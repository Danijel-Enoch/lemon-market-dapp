import { lemonVaultAbi, vaultFactoryAbi } from "@lemon/contracts";
import { allChains, type ChainInfo } from "@lemon/core";
import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";
import { resolveRpc } from "./src/rpc";
import { assertStartBlocks, resolveStartBlock } from "./src/start-block";
import { resolveThrottle, throttledHttp } from "./src/throttle";

/**
 * Note on the schema.
 *
 * The package scripts pass `--schema ponder`, which is not cosmetic. Ponder
 * writes its indexed tables into whatever schema it is given, and Prisma manages
 * `public` — so left at the default the two share a namespace, and
 * `prisma db push` offers to drop `vault`, `nav_point`, `activity` and the rest
 * because they are not in its schema file. That is the documented setup command,
 * and it silently destroys the read model.
 *
 * Keeping them apart also makes resetting the indexer a single statement
 * (`drop schema ponder cascade`) rather than a hunt for which tables belong to
 * whom.
 *
 * Note on the port.
 *
 * Ponder resolves its listen port from `process.env.PORT` in preference to its
 * own `--port` flag, and this monorepo's `.env` sets `PORT` for the web app. Run
 * unqualified alongside the rest of the stack, the indexer therefore tries to
 * bind the web app's port, increments onto the API's, and exits — so the
 * package scripts pin `PORT=42069` in front of every `ponder` invocation. The
 * flag would not have worked; the environment variable is the only lever.
 */

/**
 * Vaults are not known at build time.
 *
 * The factory deploys them as an operator adds markets, so the address list has
 * to come from the chain rather than from configuration. Ponder's `factory()`
 * reads `VaultCreated` and starts following each child from its own deployment
 * block — which also means a vault created five minutes ago is indexed from its
 * first block rather than from wherever the indexer happened to be.
 */
const vaultCreated = parseAbiItem(
	"event VaultCreated(address indexed vault, bytes32 indexed marketId, address indexed agentWallet, string name, string symbol, uint8 tier, uint32 targetLeverageBps, uint32 maxLeverageBps)",
);

/**
 * A chain is indexed iff it has a factory address configured.
 *
 * The same rule the browser uses, for the same reason: a chain with no factory
 * has nothing to index, and configuring one implicitly — by listing chains
 * somewhere separate from their addresses — produces a source pointed at the
 * zero address that backfills the whole chain finding nothing. Deriving the set
 * from the addresses makes that state unreachable.
 *
 * `VAULT_FACTORY_ADDRESS` without a suffix still means Base, so an `.env` from
 * before this existed keeps working unchanged.
 */
interface ChainSource {
	info: ChainInfo;
	factoryAddress: `0x${string}`;
	startBlock: number;
}

function sourceFor(info: ChainInfo): ChainSource | null {
	const suffix = info.envSuffix;
	const address =
		process.env[`VAULT_FACTORY_ADDRESS_${suffix}`]?.trim() ||
		(suffix === "BASE" ? process.env.VAULT_FACTORY_ADDRESS?.trim() : undefined);
	if (!address) return null;

	/**
	 * The block the factory was deployed in — see `src/start-block.ts` for why a
	 * missing one is refused rather than defaulted, and for the empty-string trap
	 * that used to make the unsuffixed variable silently do nothing under Compose.
	 */
	const startBlock = resolveStartBlock(suffix, process.env);

	return { info, factoryAddress: address as `0x${string}`, startBlock };
}

const sources = allChains()
	.map(sourceFor)
	.filter((source): source is ChainSource => source !== null);

/**
 * Checked here rather than inside `sourceFor`, so the message can name every
 * misconfigured chain at once instead of failing on the first and being fixed
 * one restart at a time.
 */
assertStartBlocks(
	sources.map(({ info, startBlock }) => ({
		name: info.key,
		envSuffix: info.envSuffix,
		startBlock,
	})),
	process.env,
);

/**
 * Fall back to a disabled Base source rather than to nothing.
 *
 * Ponder rejects a config with no chains at all, so an unconfigured checkout
 * would fail at build time with an error about the config's shape rather than
 * about the missing address. The zero address indexes nothing and costs nothing,
 * and `indexer-health` already explains what is unset.
 */
const effectiveSources: ChainSource[] =
	sources.length > 0
		? sources
		: [
				{
					info: allChains()[0],
					factoryAddress: "0x0000000000000000000000000000000000000000",
					startBlock: 0,
				},
			];

/**
 * The endpoints for one chain, throttled if the operator asked for it.
 *
 * Ponder's `rpc` accepts a list of URLs *or* one transport, never a list of
 * transports — so throttling and multi-endpoint balancing are exclusive. That
 * is not a limitation worth working around: the two solve the same problem from
 * opposite ends. More endpoints is more capacity, and Ponder splits the
 * backfill across them itself; a throttle is for when there is only one and it
 * is small. Configuring both is a contradiction rather than a belt and braces,
 * and is refused here instead of one of them being silently dropped.
 */
function chainRpc(envSuffix: string) {
	const endpoints = resolveRpc(envSuffix, process.env);
	const throttle = resolveThrottle(envSuffix, process.env);
	if (throttle === null) return endpoints;

	if (endpoints.length > 1) {
		throw new Error(
			`INDEXER_RPC_MAX_RPS_${envSuffix} is set, but ${endpoints.length} endpoints are configured for ${envSuffix}. Ponder balances the backfill across a list itself and cannot do that through a throttled transport. Drop to one endpoint, or unset the throttle and let the extra capacity do the work.`,
		);
	}

	return throttledHttp(endpoints[0], throttle);
}

const chains = Object.fromEntries(
	effectiveSources.map(({ info }) => [
		info.key,
		{
			/**
			 * Pinned from the registry, never read from the environment.
			 *
			 * An id that could be configured could only ever point a source at a
			 * chain with no factory on it — and the failure mode is an indexer that
			 * runs cleanly and serves an empty app. Only the endpoint is
			 * configurable, which is the part that is a genuine operational choice.
			 */
			id: info.id,
			/**
			 * Every endpoint we are allowed to use for this chain, not the first one
			 * that works.
			 *
			 * Ponder rate-limits, ranks and fails over across this list itself — see
			 * `src/rpc.ts` for what it does with more than one and why a single URL
			 * is the configuration that stalls a backfill.
			 */
			rpc: chainRpc(info.envSuffix),
			// `ethGetLogsBlockRange` is left unset on purpose. Ponder starts at 500
			// blocks and halves the range whenever a provider complains — including
			// on Base's "backend response too large" — then remembers the smaller
			// number. Pinning a range turns that self-correction off and makes the
			// same complaint fatal, which matters more now that the list above can
			// mix providers whose limits differ, and more again now that the chains
			// themselves have different limits.
		},
	]),
);

/**
 * Two contracts, each spanning every configured chain.
 *
 * Ponder's per-chain `chain: { base: {...}, arbitrum: {...} }` form rather than
 * one differently-named contract per chain, and the difference is not stylistic.
 * Handlers register against a contract *name*, so a name per chain would mean
 * `ponder.on("VaultFactory_ARBITRUM:VaultCreated", ...)` alongside the Base one
 * — the same handler body registered three times, and a fourth chain silently
 * unhandled until someone remembers to add it. One name means a handler is
 * written once and automatically covers every chain in the map; which chain an
 * event came from is read from `context.chain` inside it.
 */
function perChain<T>(select: (source: ChainSource) => T): Record<string, T> {
	return Object.fromEntries(effectiveSources.map((source) => [source.info.key, select(source)]));
}

const contracts = {
	VaultFactory: {
		abi: vaultFactoryAbi,
		chain: perChain(({ factoryAddress, startBlock }) => ({
			address: factoryAddress,
			startBlock,
		})),
	},
	LemonVault: {
		abi: lemonVaultAbi,
		chain: perChain(({ factoryAddress, startBlock }) => ({
			address: factory({ address: factoryAddress, event: vaultCreated, parameter: "vault" }),
			startBlock,
		})),
	},
} as const;

export default createConfig({
	/**
	 * `multichain`, not `omnichain`.
	 *
	 * Omnichain ordering processes events from every chain in one global
	 * timestamp order, which is what you want when a handler reads state another
	 * chain's handler wrote. Nothing here does: a vault's rows are touched only
	 * by events from the chain that vault lives on, and no query joins across
	 * chains. What omnichain would buy is therefore nothing, and what it costs is
	 * real — a single lagging or rate-limited endpoint holds up indexing for
	 * *every* chain, because the global order cannot advance past the slowest.
	 *
	 * With three chains and one of them on a public endpoint, that is not a
	 * hypothetical. Independent ordering means X Layer being slow makes X Layer
	 * vaults stale, and leaves Base alone.
	 */
	ordering: "multichain",
	database: process.env.DATABASE_URL
		? { kind: "postgres", connectionString: process.env.DATABASE_URL }
		: { kind: "pglite" },
	chains,
	contracts,
});
