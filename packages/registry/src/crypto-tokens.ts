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
 * (name and symbol), verified on Base mainnet for `symbol()` and `decimals()`,
 * and probed for a live KyberSwap route before inclusion.
 *
 * The curation rule is why this list is shorter than the perp catalog. A plain
 * symbol match against a Base token list is actively dangerous: it returns
 * "Department Of Government Efficiency" for DOGE, "Based Fartcoin" for
 * FARTCOIN, "MAGA" for TRUMP, and a Dinari tokenized stock for STRK — none of
 * which are the asset the perp prices. Pairing any of them would hedge against
 * the wrong thing while looking perfectly healthy.
 *
 * Also omitted, for the same reason: MON, HYPE, ZEC, TAO, NEAR, WLD, ICP, WIF
 * and PAXG, whose Base entries are wrappers or lookalikes rather than the
 * canonical asset. UNI and LDO simply are not issued on Base.
 *
 * The `k`-prefixed perps (kBONK, kPEPE, kSHIB) are quoted per 1,000 units, so
 * their tickers deliberately do not match a spot token — pairing them would
 * size a hedge 1,000x wrong.
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
	{
		symbol: "CRV",
		ticker: "CRV",
		name: "Curve DAO Token",
		address: "0x8Ee73c484A26e0A5df2Ee2a4960B789967dd0415",
		decimals: 18,
	},
	{
		symbol: "ENA",
		ticker: "ENA",
		name: "Ethena",
		address: "0x58538e6A46E07434d7E7375Bc268D3cb839C0133",
		decimals: 18,
	},
	{
		symbol: "VVV",
		ticker: "VVV",
		name: "Venice Token",
		address: "0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf",
		decimals: 18,
	},
	{
		symbol: "KAITO",
		ticker: "KAITO",
		name: "Kaito",
		address: "0x98d0baa52b2D063E780DE12F615f963Fe8537553",
		decimals: 18,
	},
] as const;

/**
 * Perp markets whose underlying is a blockchain rather than an application.
 *
 * Curated by hand because no venue publishes this distinction — asset class
 * says "crypto" for a settlement layer and a memecoin alike, and the difference
 * is what most people are actually filtering for.
 *
 * The rule is narrow: the asset must be the native token of its own chain, L1
 * or L2. That admits DOGE and LTC, which are independent chains despite their
 * reputation, and excludes protocol tokens that merely live on one — LINK,
 * AAVE, UNI, CRV, ENA, JUP, WLD — as well as interoperability layers like ZRO
 * and DoubleZero, which are infrastructure rather than settlement.
 *
 * Symbols are perp bases, matched case-insensitively.
 */
export const LAYER_1_2_BASES: readonly string[] = [
	// Layer 1
	"BTC",
	"ETH",
	"SOL",
	"XRP",
	"BNB",
	"ADA",
	"AVAX",
	"SUI",
	"LTC",
	"DOGE",
	"BCH",
	"XMR",
	"ZEC",
	"NEAR",
	"ICP",
	"TAO",
	"HYPE",
	"MON",
	"XPL",
	// Layer 2 and scaling
	"ARB",
	"ZK",
	"STRK",
] as const;

/** True when a perp's base asset is a chain's own token. */
export function isLayer1Or2(base: string): boolean {
	return LAYER_1_2_BASES.includes(base.trim().toUpperCase());
}
