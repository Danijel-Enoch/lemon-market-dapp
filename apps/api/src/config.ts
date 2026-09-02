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
import { RelayClient } from "@lemon/relay";

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
};

export type Clients = typeof clients;
