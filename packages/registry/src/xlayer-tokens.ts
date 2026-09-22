import type { StockTokenSeed } from "./tokens";

/**
 * X Layer's spot universe: three crypto assets and eleven tokenized equities.
 *
 * The richest equity set of any chain this app trades on — wider than Base's,
 * and the reason X Layer is worth supporting at all. The equities are the `w…x`
 * family and the crypto are the `x…` family, both quoted on Uniswap v3 X Layer
 * and reached through LI.FI.
 *
 * **The quote asset is split, and that is the thing to know before editing
 * this file.** X Layer's stablecoin liquidity lives in two places, and neither
 * reaches everything. Measured through LI.FI at $5,000:
 *
 *   from USDG            from USDC
 *   xBTC     -0.45%      wGOOGLx  -0.51%
 *   xETH     -0.50%      wPLTRx   -0.77%
 *   xSOL     -0.59%      wHOODx   -0.91%
 *   wNVDAx   -0.59%      wTSLAx   -1.34%
 *   wSPCXx   -0.51%      wCRCLx   -3.16%
 *   wMUx     +0.03%
 *   wSNDKx   -1.11%
 *   wSKHYx   -1.58%
 *   wMSTRx   -3.39%
 *
 * Every token on the left has **no direct USDC route at all**, and the vault's
 * asset is USDC. `LifiAggregatorClient` bridges that gap by quoting through
 * USDG and taking whichever path fills better — see `XLAYER_USDG`. Nothing here
 * records which quote asset a token uses, on purpose: which one works moves
 * with liquidity, and a stale table would report a live market as unroutable,
 * the one failure indistinguishable from the market genuinely being empty.
 *
 * Symbols and decimals below were each read off X Layer mainnet. The decimals
 * are not uniform — xBTC is 8, xSOL is 9, everything else is 18 — and sizing
 * off a wrong value would be out by ten orders of magnitude.
 *
 * Curation follows the same rule as the other chains: the token must be the
 * same asset the perp prices. The wider `w…x` family includes wAAPLx, wMSFTx,
 * wMETAx, wAMZNx, wQQQx, wSPYx, wGMEx, wINTCx, wORCLx, wTSMx and more, all with
 * real pools — they are absent here only because Pacifica lists no perp for
 * them, so there is no short leg to hedge with. They become listable the moment
 * one exists, which is an edit to this file and nothing else.
 */
export const XLAYER_TOKENS: readonly StockTokenSeed[] = [
	// --- crypto -------------------------------------------------------------
	{
		symbol: "xBTC",
		ticker: "BTC",
		name: "X Layer Bitcoin",
		address: "0xb7c00000bcDeeF966b20B3D884B98E64d2b06b4F",
		decimals: 8,
	},
	{
		symbol: "xETH",
		ticker: "ETH",
		name: "X Layer Ether",
		address: "0xE7b000003A45145DEcF8a28Fc755aD5EC5EA025a",
		decimals: 18,
	},
	{
		symbol: "xSOL",
		ticker: "SOL",
		name: "X Layer Solana",
		address: "0x505000008De8748DBd4422ff4687A4fC9bEBa15b",
		decimals: 9,
	},

	// --- tokenized equities -------------------------------------------------
	{
		symbol: "wNVDAx",
		ticker: "NVDA",
		name: "NVIDIA Corporation",
		address: "0xa8DDb5Cd96b5222afe198316E9A57CaA642850D5",
		decimals: 18,
	},
	{
		symbol: "wTSLAx",
		ticker: "TSLA",
		name: "Tesla, Inc.",
		address: "0xc3FdbE3a68eE5DE461D30415A8165CF9aEfE1171",
		decimals: 18,
	},
	{
		symbol: "wGOOGLx",
		ticker: "GOOGL",
		name: "Alphabet Inc.",
		address: "0xF8c5308F80e459bB53d9EBe689854d9CBb2caa6F",
		decimals: 18,
	},
	{
		symbol: "wMSTRx",
		ticker: "MSTR",
		name: "MicroStrategy Incorporated",
		address: "0x30987adf0b11DC698438a99bA04EC3a1AB2C7EAb",
		decimals: 18,
	},
	{
		symbol: "wHOODx",
		ticker: "HOOD",
		name: "Robinhood Markets, Inc.",
		address: "0x59801175A9b2248F9BF4Ba7f82e17045C4672Ec8",
		decimals: 18,
	},
	{
		symbol: "wPLTRx",
		ticker: "PLTR",
		name: "Palantir Technologies Inc.",
		address: "0x4a2Df09536F62341C9F946427d16414c04E21342",
		decimals: 18,
	},
	{
		symbol: "wCRCLx",
		ticker: "CRCL",
		name: "Circle Internet Group, Inc.",
		address: "0xB11134F14d5B94dB60d4599dfdc3bF1BbA2150e8",
		decimals: 18,
	},
	{
		symbol: "wMUx",
		ticker: "MU",
		name: "Micron Technology, Inc.",
		address: "0xe2047Ee3BDDB5c99AE428AB83Df63F8730698E30",
		decimals: 18,
	},
	{
		symbol: "wSNDKx",
		ticker: "SNDK",
		name: "SanDisk Corporation",
		address: "0x75E82e2884eA10f72FCA777449b73377F4646219",
		decimals: 18,
	},
	{
		symbol: "wSKHYx",
		ticker: "SKHYNIX",
		name: "SK hynix Inc.",
		address: "0x6215a58Ed045D71f2561aAABe54f4C885c522998",
		decimals: 18,
	},
	{
		symbol: "wSPCXx",
		ticker: "SPCX",
		name: "Space Exploration Technologies Corp.",
		address: "0x8e2EED8b8B5E13EA7bF38E50d7821d2c57309072",
		decimals: 18,
	},
];
