import type { Address, ChainId } from "@lemon/core";
import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, XLAYER_CHAIN_ID } from "@lemon/core";
import { ARBITRUM_TOKENS } from "./arbitrum-tokens";
import { PERP_CRYPTO_TOKENS } from "./crypto-tokens";
import { XLAYER_TOKENS } from "./xlayer-tokens";

export interface StockTokenSeed {
	symbol: string;
	/** Base ticker, used to pair with the reference perp market. */
	ticker: string;
	name: string;
	address: Address;
	decimals: number;
}

/**
 * Coinbase tokenized equities on Base (B20 standard, launched 2026-08-24,
 * issued by Coinbase Onchain SPV Ltd. with Chainlink price feeds).
 *
 * Symbols, addresses and decimals were each verified against Base mainnet;
 * every one of these is an 8-decimal ERC-20, which is *not* the 18 that token
 * code usually assumes — sizing off a wrong decimals value would be off by
 * 1e10. `seed.ts` re-checks `decimals()` on chain rather than trusting this
 * table.
 *
 * The on-chain registry contract published alongside these tokens is
 * `0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD`.
 *
 * Deliberately no `tradable` flag here: whether a token can actually be bought
 * or sold depends on live Aerodrome liquidity and changes without warning, so
 * it is probed at runtime (see `routability.ts`) rather than configured.
 */
export const COINBASE_STOCK_TOKENS: readonly StockTokenSeed[] = [
	{
		symbol: "AAPLc",
		ticker: "AAPL",
		name: "Apple Inc.",
		address: "0xb200000000000000000000C2e324d24d7eEcd1fb",
		decimals: 8,
	},
	{
		symbol: "AMZNc",
		ticker: "AMZN",
		name: "Amazon.com Inc.",
		address: "0xb200000000000000000000d9192b6B456483C2E8",
		decimals: 8,
	},
	{
		symbol: "COINc",
		ticker: "COIN",
		name: "Coinbase Global Inc.",
		address: "0xb200000000000000000000c85a31389D71F3ecfb",
		decimals: 8,
	},
	{
		symbol: "CRCLc",
		ticker: "CRCL",
		name: "Circle Internet Group Inc.",
		address: "0xB20000000000000000000019f6E7C675b73C2e4D",
		decimals: 8,
	},
	{
		symbol: "GOOGLc",
		ticker: "GOOGL",
		name: "Alphabet Inc.",
		address: "0xb2000000000000000000002D0BA3164cc74f58B7",
		decimals: 8,
	},
	{
		symbol: "INTCc",
		ticker: "INTC",
		name: "Intel Corporation",
		address: "0xB2000000000000000000004AFF16039bA04bdFBc",
		decimals: 8,
	},
	{
		symbol: "METAc",
		ticker: "META",
		name: "Meta Platforms Inc.",
		address: "0xb2000000000000000000008bC8786B856E61707C",
		decimals: 8,
	},
	{
		symbol: "MSFTc",
		ticker: "MSFT",
		name: "Microsoft Corporation",
		address: "0xB200000000000000000000Ab99cFa739E253872B",
		decimals: 8,
	},
	{
		symbol: "MSTRc",
		ticker: "MSTR",
		name: "Strategy Inc.",
		address: "0xb2000000000000000000004884b426556b92883d",
		decimals: 8,
	},
	{
		symbol: "NVDAc",
		ticker: "NVDA",
		name: "NVIDIA Corporation",
		address: "0xb20000000000000000000078ee7ce2fE4908108C",
		decimals: 8,
	},
	{
		symbol: "SNDKc",
		ticker: "SNDK",
		name: "SanDisk Corporation",
		address: "0xb200000000000000000000397293Cb8cda9a10c5",
		decimals: 8,
	},
	{
		symbol: "SPCXc",
		ticker: "SPCX",
		name: "SpaceX",
		address: "0xb2000000000000000000007b9fcbd005511aCBd5",
		decimals: 8,
	},
	{
		symbol: "TSLAc",
		ticker: "TSLA",
		name: "Tesla Inc.",
		address: "0xb2000000000000000000001e800a7f5189430cD0",
		decimals: 8,
	},
] as const;

/** The B20 on-chain registry published with the token set. */
export const ONCHAIN_REGISTRY_ADDRESS =
	"0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD" as const satisfies Address;

/** A curated token, with the chain it exists on. */
export interface ChainSpotToken extends StockTokenSeed {
	chainId: ChainId;
}

const scoped = (chainId: ChainId, tokens: readonly StockTokenSeed[]): ChainSpotToken[] =>
	tokens.map((token) => ({ ...token, chainId }));

/**
 * Every curated token on every chain this app trades on.
 *
 * The chain is attached here rather than repeated on each literal: the lists
 * are chain-homogeneous by construction — a file holds one chain's tokens and
 * nothing else — so stamping it at assembly makes it impossible for an entry to
 * carry the wrong one.
 *
 * Flat rather than grouped because most callers want "the whole universe" and
 * the ones that do not say which chain they mean. What no caller may do is look
 * a token up by symbol or ticker alone: `WETH` is a real, different contract on
 * all three chains, and resolving one without a chain would return whichever
 * happened to be listed first. Every lookup below therefore takes a chain, and
 * the compiler enforces it.
 */
export const SPOT_TOKENS: readonly ChainSpotToken[] = [
	...scoped(BASE_CHAIN_ID, COINBASE_STOCK_TOKENS),
	...scoped(BASE_CHAIN_ID, PERP_CRYPTO_TOKENS),
	...scoped(ARBITRUM_CHAIN_ID, ARBITRUM_TOKENS),
	...scoped(XLAYER_CHAIN_ID, XLAYER_TOKENS),
];

/** One chain's curated tokens, in registry order. Empty for a chain with none. */
export function spotTokensFor(chainId: number): ChainSpotToken[] {
	return SPOT_TOKENS.filter((token) => token.chainId === chainId);
}

export function findTokenBySymbol(symbol: string, chainId: number): ChainSpotToken | undefined {
	const target = symbol.trim().toUpperCase();
	return SPOT_TOKENS.find((t) => t.chainId === chainId && t.symbol.toUpperCase() === target);
}

export function findTokenByTicker(ticker: string, chainId: number): ChainSpotToken | undefined {
	const target = ticker.trim().toUpperCase();
	return SPOT_TOKENS.find((t) => t.chainId === chainId && t.ticker === target);
}

export function findTokenByAddress(address: string, chainId: number): ChainSpotToken | undefined {
	const target = address.trim().toLowerCase();
	return SPOT_TOKENS.find((t) => t.chainId === chainId && t.address.toLowerCase() === target);
}
