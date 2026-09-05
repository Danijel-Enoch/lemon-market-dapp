import { lemonVaultAbi, vaultFactoryAbi } from "@lemon/contracts";
import { BASE_CHAIN_ID } from "@lemon/core";
import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";

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

const FACTORY_ADDRESS = (process.env.VAULT_FACTORY_ADDRESS ??
	"0x0000000000000000000000000000000000000000") as `0x${string}`;

/**
 * The block the factory was deployed in.
 *
 * Indexing from genesis on Base would be tens of millions of empty blocks and
 * hours of RPC. There is nothing to find before the factory existed.
 */
const START_BLOCK = Number(process.env.VAULT_FACTORY_START_BLOCK ?? 0);

export default createConfig({
	ordering: "omnichain",
	database: process.env.DATABASE_URL
		? { kind: "postgres", connectionString: process.env.DATABASE_URL }
		: { kind: "pglite" },
	chains: {
		base: {
			/**
			 * Base mainnet, pinned.
			 *
			 * The vault contracts exist on one chain, so an id read from the
			 * environment could only ever point this at a chain with no factory on
			 * it — and the failure mode is an indexer that runs cleanly and serves
			 * an empty app. Only the endpoint is configurable.
			 */
			id: BASE_CHAIN_ID,
			rpc:
				process.env.PONDER_RPC_URL_BASE ?? process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
		},
	},
	contracts: {
		VaultFactory: {
			chain: "base",
			abi: vaultFactoryAbi,
			address: FACTORY_ADDRESS,
			startBlock: START_BLOCK,
		},
		LemonVault: {
			chain: "base",
			abi: lemonVaultAbi,
			address: factory({
				address: FACTORY_ADDRESS,
				event: vaultCreated,
				parameter: "vault",
			}),
			startBlock: START_BLOCK,
		},
	},
});
