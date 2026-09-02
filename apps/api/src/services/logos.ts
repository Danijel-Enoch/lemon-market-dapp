import { requestJson } from "@lemon/core";
import { SPOT_TOKENS } from "@lemon/registry";
import { TtlCache } from "../cache";

const COINGECKO_BASE_LIST = "https://tokens.coingecko.com/base/all.json";

interface TokenListEntry {
	address: string;
	symbol: string;
	name: string;
	decimals: number;
	logoURI?: string;
}

/**
 * Logo lookup for tokens we hold an address for.
 *
 * Keyed by contract address rather than symbol: symbol lookups are what let an
 * impostor token borrow a real project's icon, and this list is also the source
 * that caught a fake "MON" during registry curation.
 *
 * The list is ~600KB, so it is cached for a day; a failure yields an empty map
 * and the UI falls back to a monogram rather than breaking.
 */
const listCache = new TtlCache<Map<string, TokenListEntry>>(
	async () => {
		const list = await requestJson<{ tokens: TokenListEntry[] }>(
			"coingecko",
			COINGECKO_BASE_LIST,
			"",
			{ timeoutMs: 30_000 },
		);
		return new Map(list.tokens.map((token) => [token.address.toLowerCase(), token]));
	},
	24 * 60 * 60_000,
);

/**
 * DexScreener serves a token image per contract address on Base.
 *
 * Used only as a fallback when the curated list has no logo. It stays keyed by
 * address, never symbol, so it cannot hand an impostor another project's brand
 * — the same property that made the curated list catch a fake "MON". The URL is
 * returned unverified; `MarketLogo` falls back to a monogram if it 404s.
 */
function dexscreenerLogo(address: string): string {
	return `https://dd.dexscreener.com/ds-data/tokens/base/${address.toLowerCase()}.png`;
}

export async function getTokenLogos(): Promise<Map<string, string>> {
	const list = await listCache.get().catch(() => new Map<string, TokenListEntry>());

	const logos = new Map<string, string>();
	for (const token of SPOT_TOKENS) {
		const entry = list.get(token.address.toLowerCase());
		const logo = entry?.logoURI ?? dexscreenerLogo(token.address);
		// Keyed by both so a market (ticker) and a spot row (symbol) resolve.
		logos.set(token.symbol.toUpperCase(), logo);
		logos.set(token.ticker.toUpperCase(), logo);
	}
	return logos;
}
