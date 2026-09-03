import type { StockTokenSeed } from "./tokens";

/**
 * Base ERC-20s that correspond to a listed perp crypto market.
 *
 * Curation rule: the token must be the **same asset** the perp prices, not
 * merely a ticker match. That distinction is load-bearing — a DexScreener sweep
 * for "FARTCOIN" surfaces "Based Fartcoin", a separate Base-native token, while
 * the FARTCOIN/USD perp prices the Solana original. Pairing those for a
 * cash-and-carry would produce a hedge against the wrong asset, so it is
 * excluded despite matching by symbol and having liquidity.
 *
 * Every address below was cross-checked against the CoinGecko Base token list
 * (name and symbol) before inclusion. Candidates that were only found by
 * symbol search — MON, HYPE, ZEC, TAO, TRUMP, NEAR, WLD, XAU/PAXG — are
 * deliberately omitted: they did not appear on the curated list, so their
 * canonical status could not be confirmed.
 */
export const PERP_CRYPTO_TOKENS: readonly StockTokenSeed[] = [
	{
		symbol: "WETH",
		ticker: "ETH",
		name: "Wrapped Ether",
		address: "0x4200000000000000000000000000000000000006",
		decimals: 18,
	},
	{
		symbol: "cbBTC",
		ticker: "BTC",
		name: "Coinbase Wrapped BTC",
		address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
		decimals: 8,
	},
	{
		symbol: "SOL",
		ticker: "SOL",
		name: "Base Bridged SOL",
		address: "0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82",
		decimals: 9,
	},
	{
		symbol: "AERO",
		ticker: "AERO",
		name: "Aerodrome Finance",
		address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
		decimals: 18,
	},
	{
		symbol: "VIRTUAL",
		ticker: "VIRTUAL",
		name: "Virtuals Protocol",
		address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
		decimals: 18,
	},
	{
		symbol: "AVNT",
		ticker: "AVNT",
		name: "Avantis",
		address: "0x696F9436B67233384889472Cd7cD58A6fB5DF4f1",
		decimals: 18,
	},
	{
		symbol: "LINK",
		ticker: "LINK",
		name: "Chainlink",
		address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
		decimals: 18,
	},
	{
		symbol: "AAVE",
		ticker: "AAVE",
		name: "Aave",
		address: "0x63706e401c06ac8513145b7687A14804d17f814b",
		decimals: 18,
	},
	{
		symbol: "ETHFI",
		ticker: "ETHFI",
		name: "Ether.fi",
		address: "0x6C240DDA6b5c336DF09A4D011139beAAa1eA2Aa2",
		decimals: 18,
	},
	{
		symbol: "ZRO",
		ticker: "ZRO",
		name: "LayerZero",
		address: "0x6985884C4392D348587B19cb9eAAf157F13271cd",
		decimals: 18,
	},
] as const;
