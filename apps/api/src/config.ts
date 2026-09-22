import {
	allChains,
	BASE_CHAIN_ID,
	type ChainInfo,
	DEFAULT_CHAIN_ID,
	isValidBps,
	MAX_SPOT_FEE_BPS,
	requireChainInfo,
	type SpotAggregator,
	type SpotFeeConfig,
	XLAYER_CHAIN_ID,
} from "@lemon/core";
import { KyberAggregatorClient, KyberLimitOrderClient, kyberCovers } from "@lemon/kyber";
import { LifiAggregatorClient } from "@lemon/lifi";
import { NearMpcClient } from "@lemon/near-mpc";
import { PACIFICA_MAINNET, PacificaClient } from "@lemon/pacifica";
import { RelayClient } from "@lemon/relay";
import { UniswapV3AggregatorClient } from "@lemon/univ3";

function env(name: string, fallback: string): string {
	return process.env[name]?.trim() || fallback;
}

function optionalEnv(name: string): string | undefined {
	return process.env[name]?.trim() || undefined;
}

function envList(name: string): string[] {
	return (process.env[name] ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

function envFlag(name: string, fallback: boolean): boolean {
	const raw = process.env[name]?.trim().toLowerCase();
	if (!raw) return fallback;
	return raw !== "0" && raw !== "false" && raw !== "off";
}

/**
 * Integrator fee taken on every spot swap, in basis points.
 *
 * Both the rate and the receiver must be set for a fee to apply. Configuring
 * one without the other is treated as "no fee" rather than defaulting the
 * other — a fee with no receiver would be silently burned, and a receiver with
 * no rate collects nothing.
 */
function readSpotFee(): SpotFeeConfig | null {
	const bps = Number(optionalEnv("SPOT_FEE_BPS") ?? "0");
	const receiver = optionalEnv("SPOT_FEE_RECEIVER");

	if (!bps || !receiver) return null;
	if (!isValidBps(bps)) {
		console.warn(
			`[config] SPOT_FEE_BPS=${bps} is outside 0-${MAX_SPOT_FEE_BPS}; spot fees disabled.`,
		);
		return null;
	}

	const chargeBy =
		optionalEnv("SPOT_FEE_CHARGE_BY") === "currency_out" ? "currency_out" : "currency_in";

	return { bps, receiver: receiver as `0x${string}`, chargeBy };
}

/**
 * Every RPC endpoint this process may use, per chain, in the order configured.
 *
 * `RPC_URL_<CHAIN>` then `<CHAIN>_RPC_FALLBACK_URLS`. The suffixed-first name is
 * the one `.env.example`, both compose files, `scripts/deploy-contracts.sh` and
 * the agent all use, and reading anything else here is how an operator sets an
 * endpoint that reaches three of the four processes: the API would keep quietly
 * using the public node while every log said the private one was configured.
 * `<CHAIN>_RPC_URL` is still read after it, because `BASE_RPC_URL` is that name
 * for Base and predates the suffix — so an existing `.env` needs no edit.
 *
 * Nothing falls through to another chain's variables: an Arbitrum client pointed
 * at a Base node answers every read with the same address's Base state, which is
 * a real number about the wrong chain and looks entirely ordinary wherever it
 * surfaces.
 *
 * The per-chain default is that chain's canonical public endpoint — shared,
 * unauthenticated and rate-limited per IP, on a deployed host by an IP that may
 * not even be ours alone. Fine for a laptop and poor for anything serving
 * requests, so a deployment should set these.
 */
function readRpc(): Record<string, string[]> {
	const defaults: Record<string, string> = {
		BASE: "https://mainnet.base.org",
		ARBITRUM: "https://arb1.arbitrum.io/rpc",
		XLAYER: "https://rpc.xlayer.tech",
	};

	const out: Record<string, string[]> = {};
	for (const info of allChains()) {
		const suffix = info.envSuffix;
		const primary = env(`RPC_URL_${suffix}`, env(`${suffix}_RPC_URL`, defaults[suffix]));
		// Deliberately empty by default rather than quietly appending the public
		// node. A deployment that has pointed this at its own provider has usually
		// done so for a reason, and inheriting a fallback it did not ask for would
		// send its traffic somewhere it did not choose.
		out[suffix] = [...new Set([primary, ...envList(`${suffix}_RPC_FALLBACK_URLS`)])];
	}
	return out;
}

export const config = {
	/**
	 * The chain anything unscoped means.
	 *
	 * Still Base, and still a constant rather than a variable: the spot registry,
	 * the KyberSwap routes and the Relay defaults are Base-side by construction.
	 * A *vault's* chain comes from its own row, never from here.
	 */
	chainId: BASE_CHAIN_ID,
	rpc: readRpc(),
	/**
	 * The node every Base read goes through.
	 *
	 * The default is Circle's public endpoint, which is shared, unauthenticated
	 * and rate-limited per IP — on a deployed host, an IP that may not even be
	 * ours alone. It is a fine default for a laptop and a poor one for anything
	 * serving requests, so a deployment should set this.
	 */
	baseRpcUrl: env("BASE_RPC_URL", "https://mainnet.base.org"),

	/**
	 * Further Base endpoints, comma separated, tried in order when the primary
	 * fails — including when it fails with a rate limit.
	 *
	 * Deliberately empty by default rather than quietly appending the public
	 * node. A deployment that has pointed `BASE_RPC_URL` at its own provider has
	 * usually done so for a reason, and inheriting a fallback it did not ask for
	 * would send its traffic somewhere it did not choose.
	 */
	baseRpcFallbackUrls: envList("BASE_RPC_FALLBACK_URLS"),

	/**
	 * Whether Base reads may be sent as JSON-RPC batches.
	 *
	 * On by default, because coalescing the reads a single page makes into one
	 * request is the whole point. The escape hatch exists because a minority of
	 * providers reject batched payloads outright, and on those the failure is
	 * total rather than partial — every read breaks at once.
	 */
	baseRpcBatch: envFlag("BASE_RPC_BATCH", true),
	/**
	 * Whether RPC reads may be sent as JSON-RPC batches, on every chain.
	 *
	 * On by default, because coalescing the reads a single page makes into one
	 * request is the whole point. The escape hatch exists because a minority of
	 * providers reject batched payloads outright, and on those the failure is
	 * total rather than partial — every read breaks at once. `RPC_BATCH` is the
	 * chain-wide name; `BASE_RPC_BATCH` still works and still means Base only,
	 * which is why an explicit `RPC_BATCH=0` wins over it.
	 */
	rpcBatch: envFlag("RPC_BATCH", envFlag("BASE_RPC_BATCH", true)),
	kyberBaseUrl: env("KYBER_BASE_URL", "https://aggregator-api.kyberswap.com"),
	kyberClientId: env("KYBER_CLIENT_ID", "lemon-markets"),

	// --- LI.FI, which routes the chains KyberSwap does not cover -------------
	lifiBaseUrl: env("LIFI_BASE_URL", "https://li.quest"),
	lifiIntegrator: env("LIFI_INTEGRATOR", "lemon-markets"),
	/**
	 * Strongly recommended wherever X Layer is enabled.
	 *
	 * LI.FI's unauthenticated tier is tight and this app is a heavy user of it:
	 * a routability sweep is two calls per token, and a quote that has to try
	 * the USDG hop is three. Exhausting it returns a 429 saying "retry in two
	 * hours" — which, reached mid-deploy, is a position with one leg on.
	 */
	lifiApiKey: optionalEnv("LIFI_API_KEY"),
	pacificaApiUrl: env("PACIFICA_API_URL", PACIFICA_MAINNET),
	solanaRpcUrl: env("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"),

	/**
	 * NEAR chain signatures, which hold every user's derived wallet.
	 *
	 * `accountId` is part of the derivation input, so changing it after users
	 * exist repoints all of them at fresh, empty addresses. It is configuration
	 * in the sense that a deployment picks it once — not in the sense that it
	 * can be edited later.
	 */
	near: {
		accountId: optionalEnv("NEAR_ACCOUNT_ID"),
		privateKey: optionalEnv("NEAR_PRIVATE_KEY"),
		rpcUrl: optionalEnv("NEAR_RPC_URL"),
		contractId: optionalEnv("NEAR_MPC_CONTRACT_ID"),
	},

	/**
	 * Solana keypair that pays fees for deposits, base58 encoded.
	 *
	 * A derived wallet holds USDC but never SOL, so it cannot pay for the
	 * transaction that credits its own Pacifica balance. This account covers
	 * that fee and the rent for a first-time token account; it is never an
	 * authority over user funds, only a fee payer.
	 */
	solanaFeePayerSecret: optionalEnv("SOLANA_FEE_PAYER_SECRET"),
	relayApiUrl: env("RELAY_API_URL", "https://api.relay.link"),
	relayApiKey: process.env.RELAY_API_KEY?.trim() || undefined,
	databaseUrl: process.env.DATABASE_URL?.trim() || undefined,

	/**
	 * Fees this deployment collects.
	 *
	 * Spot fees ride inside the KyberSwap route. Perp fees come from a Pacifica
	 * builder code, which each user approves during onboarding — the rate is a
	 * ceiling they agree to, not something charged unilaterally.
	 */
	fees: {
		/**
		 * The integrator fee on the agent's own swaps.
		 *
		 * Users no longer swap through this app, so this is charged on the
		 * vault's trades — which means it comes out of vault performance and
		 * lands in the same place the management fee does. It is disclosed on
		 * the vault page for that reason.
		 */
		spot: readSpotFee(),
	},

	/**
	 * Where the indexed read model lives.
	 *
	 * Everything historical — balances, the queue, the activity feed — is served
	 * from Ponder rather than reconstructed here. The API proxies it so the
	 * browser has one origin and so a caller cannot be handed a different answer
	 * than the app was.
	 */
	indexerUrl: env("INDEXER_URL", "http://localhost:42069"),

	/** Addresses that may administer the protocol, seeded at boot from env. */
	bootstrapAdmins: (optionalEnv("ADMIN_ADDRESSES") ?? "")
		.split(",")
		.map((a) => a.trim().toLowerCase())
		.filter((a) => /^0x[0-9a-f]{40}$/.test(a)),

	/** Deployed contract addresses on Base. */
	/**
	 * The factory on each chain, or undefined where this deployment has none.
	 *
	 * Keyed by env suffix, and the same rule the indexer and the browser use: a
	 * chain is enabled iff it has a factory, and the unsuffixed name still means
	 * Base so an older `.env` keeps working. `contracts.vaultFactory` below is
	 * that unsuffixed name and is Base-only — reading it for "the" factory is
	 * what made the indexer health check compare every chain's vaults against
	 * Base's count.
	 */
	factories: Object.fromEntries(
		allChains().map((info) => [
			info.envSuffix,
			(optionalEnv(`VAULT_FACTORY_ADDRESS_${info.envSuffix}`) ??
				(info.id === BASE_CHAIN_ID ? optionalEnv("VAULT_FACTORY_ADDRESS") : undefined)) as
				| `0x${string}`
				| undefined,
		]),
	) as Record<string, `0x${string}` | undefined>,

	contracts: {
		vaultFactory: optionalEnv("VAULT_FACTORY_ADDRESS") as `0x${string}` | undefined,
		insuranceFund: optionalEnv("INSURANCE_FUND_ADDRESS") as `0x${string}` | undefined,
		usdc: env("USDC_ADDRESS", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`,
	},
};

/**
 * Upstream clients are constructed once and shared.
 *
 * They live server-side specifically so `RELAY_API_KEY` and `KYBER_CLIENT_ID`
 * never reach the browser bundle.
 */
/**
 * One spot aggregator per chain, chosen by which one actually covers it.
 *
 * KyberSwap routes Base and Arbitrum. X Layer reads Uniswap V3 directly,
 * through `@lemon/univ3`, and that is not the arrangement this file used to
 * describe: X Layer went to LI.FI on the understanding that LI.FI reached the
 * chain's Uniswap v3 pools through SushiSwap's aggregator. It does not. LI.FI
 * answers "Could not find token on chain 196" for all fourteen tokens this app
 * trades there — individual token lookups included, so it is not a curation
 * artifact — and returns "No available quotes" even between two tokens it does
 * list on the chain. The board showed fourteen unvaultable markets and no
 * vault could be created on X Layer at all.
 *
 * The pools were never the problem. There are fifty-one of them across the
 * fourteen tokens on the Uniswap V3 deployment at `0x4B2ab38D…`, with the
 * quoting split between USDC and USDG exactly as described above. Reading them
 * directly is what the sentence above always claimed was happening.
 *
 * Which aggregator serves a chain stays invisible to the agent: it asks for its
 * vault's chain and trades through whatever comes back.
 *
 * Built eagerly for every chain in the registry, so a misconfiguration is a
 * boot failure rather than a failed trade. `KyberAggregatorClient` throws on a
 * chain it does not cover, which is what makes "X Layer must not be routed to
 * KyberSwap" a fact the type system and the constructor both enforce.
 */
function aggregatorFor(info: ChainInfo): SpotAggregator {
	if (kyberCovers(info.id)) {
		return new KyberAggregatorClient({
			chainId: info.id,
			baseUrl: config.kyberBaseUrl,
			clientId: config.kyberClientId,
			fee: config.fees.spot,
		});
	}

	if (info.id === XLAYER_CHAIN_ID) {
		return new UniswapV3AggregatorClient({
			chainId: info.id,
			// The same endpoints every other X Layer read uses, so an operator who
			// has bought capacity for the chain gets it here too.
			rpcUrl: config.rpc[info.envSuffix]?.[0] ?? "https://rpc.xlayer.tech",
			quoteAsset: info.usdc,
		});
	}

	/**
	 * Anything else falls back to LI.FI, which is the general router.
	 *
	 * Unreachable today — the registry is three chains and the two above cover
	 * all of them — and kept for the fourth, where the sensible first move is to
	 * try a routing service before writing another venue adapter.
	 */
	return new LifiAggregatorClient({
		chainId: info.id,
		baseUrl: config.lifiBaseUrl,
		integrator: config.lifiIntegrator,
		apiKey: config.lifiApiKey,
	});
}

const aggregators = new Map<number, SpotAggregator>(
	allChains().map((info) => [info.id, aggregatorFor(info)]),
);

export const clients = {
	pacifica: new PacificaClient({ baseUrl: config.pacificaApiUrl }),

	/**
	 * The aggregator for one chain.
	 *
	 * Throws on a chain this build does not know. A fallback to Base's client
	 * would quote an Arbitrum token against Base pools, find nothing, and report
	 * a healthy market as unroutable — or worse, find a same-addressed token and
	 * quote it.
	 */
	aggregatorFor(chainId: number): SpotAggregator {
		const found = aggregators.get(requireChainInfo(chainId).id);
		if (!found) throw new Error(`No spot aggregator for chain ${chainId}.`);
		return found;
	},

	/** Base's aggregator, under the name the rest of the API already uses. */
	kyber: aggregators.get(DEFAULT_CHAIN_ID) as SpotAggregator,
	kyberLimit: new KyberLimitOrderClient({
		chainId: config.chainId,
		clientId: config.kyberClientId,
	}),
	relay: new RelayClient({ baseUrl: config.relayApiUrl, apiKey: config.relayApiKey }),

	/**
	 * Null when NEAR is unconfigured. Accounts then report themselves
	 * unavailable rather than failing per-request, matching how the Relay and
	 * database-backed features degrade.
	 */
	nearMpc:
		config.near.accountId && config.near.privateKey
			? new NearMpcClient({
					accountId: config.near.accountId,
					privateKey: config.near.privateKey,
					rpcUrl: config.near.rpcUrl,
					contractId: config.near.contractId,
				})
			: null,
};

export type Clients = typeof clients;
