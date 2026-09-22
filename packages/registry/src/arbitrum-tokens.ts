import type { StockTokenSeed } from "./tokens";

/**
 * Arbitrum One's spot universe: crypto only.
 *
 * There are **no tokenized equities on Arbitrum**. That is not an omission
 * pending research — a sweep of the chain's hundred deepest pools returns
 * nothing but crypto, so a basis vault there hedges an ERC-20 against a crypto
 * perp and nothing else. X Layer is where this app's equity markets live.
 *
 * Every entry below was selected the same way the Base list was, and the rule
 * is the same: the token must be the **same asset** the perp prices. A plain
 * symbol match is actively dangerous here. Arbitrum lists more than one
 * contract for several of these names, and the wrong one is not a failure but a
 * bad fill — measured on a $10,000 KyberSwap route, TRUMP came back at -100%,
 * ICP at -94.7%, BNB at -86.9% and ENA at -81.6%. Each of those answers
 * `symbol()` correctly and has a matching Pacifica perp; each would have been
 * paired by a naive join, and each would have destroyed the position on entry.
 *
 * Inclusion required both:
 *
 *   - a live KyberSwap route at $10,000 with under ~1.5% price impact, and
 *   - corroborating pool depth in GeckoTerminal's Arbitrum top pools, so a
 *     single favourable route snapshot could not carry a token in on its own.
 *
 * Measured at curation time (impact on a $10k probe; reserve across top pools):
 *
 *   WBTC  +0.013%   $59.1M    WETH  -0.022%   $102.4M
 *   ARB   -0.142%    $3.5M    AAVE  -0.461%    $0.7M
 *   LINK  -0.521%    $0.3M    UNI   -1.048%    $1.0M
 *   CRV   -1.246%    $0.5M
 *
 * LINK and CRV are the thin ones and are kept deliberately: both route well
 * because KyberSwap aggregates venues outside GeckoTerminal's top pools, but
 * their pool depth is the first thing to re-measure if fills start disappointing.
 * Routability is probed live at request time regardless, so a token whose
 * liquidity leaves stops being offered without an edit here.
 *
 * Omitted despite having a Pacifica perp: PENDLE, GMX, GNS, GRT, LPT and ETHFI
 * have pools but no perp; SOL (-1.7%), CHIP (-3.0%), LDO and ZRO (-3.2% each)
 * route too expensively for a trade whose edge is funding measured in basis
 * points a day.
 */
export const ARBITRUM_TOKENS: readonly StockTokenSeed[] = [
	{
		symbol: "WETH",
		ticker: "ETH",
		name: "Wrapped Ether",
		address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
		decimals: 18,
	},
	{
		symbol: "WBTC",
		ticker: "BTC",
		name: "Wrapped BTC",
		address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
		decimals: 8,
	},
	{
		symbol: "ARB",
		ticker: "ARB",
		name: "Arbitrum",
		address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
		decimals: 18,
	},
	{
		symbol: "LINK",
		ticker: "LINK",
		name: "ChainLink Token",
		address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
		decimals: 18,
	},
	{
		symbol: "AAVE",
		ticker: "AAVE",
		name: "Aave Token",
		address: "0xba5DdD1f9d7F570dc94a51479a000E3BCE967196",
		decimals: 18,
	},
	{
		symbol: "UNI",
		ticker: "UNI",
		name: "Uniswap",
		address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
		decimals: 18,
	},
	{
		symbol: "CRV",
		ticker: "CRV",
		name: "Curve DAO Token",
		address: "0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978",
		decimals: 18,
	},
];
