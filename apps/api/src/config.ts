import {
	AvantisClient,
	AvantisDataClient,
	AvantisFeedClient,
	DEFAULT_BATCHED_MARKET_URL,
	DEFAULT_DATA_API_URL,
	DEFAULT_FEED_URL,
	DEFAULT_TX_BUILDER_URL,
} from "@lemon/avantis";
import { BASE_CHAIN_ID, isValidBps, MAX_SPOT_FEE_BPS, type SpotFeeConfig } from "@lemon/core";
import { KyberAggregatorClient, KyberLimitOrderClient } from "@lemon/kyber";
import { NearMpcClient, type NearNetwork } from "@lemon/near-mpc";
import { PACIFICA_MAINNET, PacificaClient } from "@lemon/pacifica";
import { RelayClient } from "@lemon/relay";
import { parseBuilderConfig } from "./services/builder";

function env(name: string, fallback: string): string {
	return process.env[name]?.trim() || fallback;
}

function optionalEnv(name: string): string | undefined {
	return process.env[name]?.trim() || undefined;
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

export const config = {
	chainId: Number(env("CHAIN_ID", String(BASE_CHAIN_ID))),
	baseRpcUrl: env("BASE_RPC_URL", "https://mainnet.base.org"),
	avantisTxBuilderUrl: env("AVANTIS_TX_BUILDER_URL", DEFAULT_TX_BUILDER_URL),
	avantisBatchedMarketUrl: env("AVANTIS_BATCHED_MARKET_URL", DEFAULT_BATCHED_MARKET_URL),
	avantisDataUrl: env("AVANTIS_DATA_API_URL", DEFAULT_DATA_API_URL),
	avantisFeedUrl: env("AVANTIS_FEED_URL", DEFAULT_FEED_URL),
	kyberBaseUrl: env("KYBER_BASE_URL", "https://aggregator-api.kyberswap.com"),
	kyberClientId: env("KYBER_CLIENT_ID", "lemon-markets"),
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
		network: (optionalEnv("NEAR_NETWORK") === "testnet" ? "testnet" : "mainnet") as NearNetwork,
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
	 * Spot fees ride inside the KyberSwap route. Perp fees come from an Avantis
	 * builder code: the rate and collector live on-chain in the BuilderCode
	 * registry, and orders are attributed by an ERC-8021 calldata suffix — so
	 * only the code goes here, not a percentage.
	 */
	fees: {
		spot: readSpotFee(),
		builderCode: optionalEnv("AVANTIS_BUILDER_CODE"),
		/**
		 * Pacifica builder attribution, or null when unconfigured.
		 *
		 * The ceiling deliberately sits above the rate actually charged.
		 * Pacifica rejects an order whose builder fee exceeds what the user
		 * approved, so a rate raised past an approved ceiling stops those users
		 * trading until they approve again. Headroom is what keeps a fee change
		 * from becoming an outage.
		 */
		pacificaBuilder: parseBuilderConfig(
			optionalEnv("PACIFICA_BUILDER_CODE"),
			optionalEnv("PACIFICA_BUILDER_MAX_FEE_RATE"),
		),
	},
};

/**
 * Upstream clients are constructed once and shared.
 *
 * They live server-side specifically so `RELAY_API_KEY` and `KYBER_CLIENT_ID`
 * never reach the browser bundle.
 */
export const clients = {
	avantis: new AvantisClient({
		txBuilderUrl: config.avantisTxBuilderUrl,
		batchedMarketUrl: config.avantisBatchedMarketUrl,
	}),
	avantisData: new AvantisDataClient({ baseUrl: config.avantisDataUrl }),
	avantisFeed: new AvantisFeedClient({ baseUrl: config.avantisFeedUrl }),
	pacifica: new PacificaClient({ baseUrl: config.pacificaApiUrl }),
	kyber: new KyberAggregatorClient({
		baseUrl: config.kyberBaseUrl,
		clientId: config.kyberClientId,
		fee: config.fees.spot,
	}),
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
					network: config.near.network,
					accountId: config.near.accountId,
					privateKey: config.near.privateKey,
					rpcUrl: config.near.rpcUrl,
					contractId: config.near.contractId,
				})
			: null,
};

export type Clients = typeof clients;
