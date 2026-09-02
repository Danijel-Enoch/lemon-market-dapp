import {
	AvantisClient,
	AvantisDataClient,
	AvantisFeedClient,
	DEFAULT_BATCHED_MARKET_URL,
	DEFAULT_DATA_API_URL,
	DEFAULT_FEED_URL,
	DEFAULT_TX_BUILDER_URL,
} from "@lemon/avantis";
import { BASE_CHAIN_ID } from "@lemon/core";
import { KyberAggregatorClient, KyberLimitOrderClient } from "@lemon/kyber";
import { RelayClient } from "@lemon/relay";

function env(name: string, fallback: string): string {
	return process.env[name]?.trim() || fallback;
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
	}),
	kyberLimit: new KyberLimitOrderClient({
		chainId: config.chainId,
		clientId: config.kyberClientId,
	}),
	relay: new RelayClient({ baseUrl: config.relayApiUrl, apiKey: config.relayApiKey }),
};

export type Clients = typeof clients;
