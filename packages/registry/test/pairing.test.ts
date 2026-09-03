import { describe, expect, test } from "bun:test";
import type { Market, StockToken } from "@lemon/core";
import { findCarryCandidates, findMarketByTicker, pairTokensWithMarkets } from "../src/pairing";

/**
 * Token ↔ perp pairing.
 *
 * This decides which tokenized stocks can be hedged, and therefore which ones
 * cash-and-carry offers at all. A token that fails to pair does not error — it
 * quietly disappears from the product, which is exactly the kind of bug that
 * survives a release, so the join is pinned here.
 */

function market(overrides: Partial<Market> & Pick<Market, "symbol" | "base">): Market {
	return {
		quote: "USD",
		assetClass: "equity",
		minLeverage: 1,
		maxLeverage: 10,
		minPositionUsdc: 10,
		openInterest: 0,
		maxOpenInterest: 1_000_000,
		availableOpenInterest: 1_000_000,
		isListed: true,
		closeOnly: false,
		isOpen: true,
		nextOpen: null,
		nextClose: null,
		...overrides,
	};
}

const NVDA = market({ symbol: "NVDA/USD", base: "NVDA" });
const GOOG = market({ symbol: "GOOG/USD", base: "GOOG" });
const markets = [NVDA, GOOG];

const seeds = [
	{
		symbol: "NVDAc",
		ticker: "NVDA",
		name: "Nvidia",
		address: "0x0000000000000000000000000000000000000001" as const,
		decimals: 8,
	},
	{
		// Coinbase issues Class A (GOOGL); the perp may be listed against Class C.
		symbol: "GOOGLc",
		ticker: "GOOGL",
		name: "Alphabet",
		address: "0x0000000000000000000000000000000000000002" as const,
		decimals: 8,
	},
	{
		symbol: "NFLXc",
		ticker: "NFLX",
		name: "Netflix",
		address: "0x0000000000000000000000000000000000000003" as const,
		decimals: 8,
	},
];

describe("findMarketByTicker", () => {
	test("matches the USD-quoted market for a ticker", () => {
		expect(findMarketByTicker(markets, "NVDA")).toBe(NVDA);
	});

	test("is case and whitespace insensitive, as pasted tickers are", () => {
		expect(findMarketByTicker(markets, " nvda ")).toBe(NVDA);
	});

	test("does not match a non-USD quote", () => {
		const eur = market({ symbol: "NVDA/EUR", base: "NVDA", quote: "EUR" });
		expect(findMarketByTicker([eur], "NVDA")).toBeUndefined();
	});

	test("returns nothing for an unlisted ticker", () => {
		expect(findMarketByTicker(markets, "NFLX")).toBeUndefined();
	});
});

describe("pairTokensWithMarkets", () => {
	const paired = pairTokensWithMarkets(markets, seeds);
	const bySymbol = new Map(paired.map((token) => [token.symbol, token]));

	test("pairs a token with the perp of the same ticker", () => {
		expect(bySymbol.get("NVDAc")?.perpSymbol).toBe("NVDA/USD");
	});

	/**
	 * The alias case is the whole reason the table exists: without it Alphabet
	 * silently drops out of carry, and it reads as "no market" rather than as a
	 * share-class naming mismatch.
	 */
	test("follows a share-class alias", () => {
		expect(bySymbol.get("GOOGLc")?.perpSymbol).toBe("GOOG/USD");
	});

	test("leaves an unhedgeable token unpaired rather than guessing", () => {
		expect(bySymbol.get("NFLXc")?.perpSymbol).toBeNull();
	});

	test("keeps every token, paired or not", () => {
		expect(paired.length).toBe(seeds.length);
	});

	test("carries the token's own fields through untouched", () => {
		const nvda = bySymbol.get("NVDAc");
		expect(nvda?.ticker).toBe("NVDA");
		expect(nvda?.decimals).toBe(8);
	});
});

describe("findCarryCandidates", () => {
	const tokens = pairTokensWithMarkets(markets, seeds) as StockToken[];
	const allBuyable = () => true;

	test("offers a token that is both paired and buyable", () => {
		const candidates = findCarryCandidates(tokens, markets, allBuyable);
		expect(candidates.map((candidate) => candidate.token.symbol).sort()).toEqual([
			"GOOGLc",
			"NVDAc",
		]);
	});

	test("excludes a token with no buy route — a carry needs both legs", () => {
		const candidates = findCarryCandidates(tokens, markets, (symbol) => symbol === "NVDAc");
		expect(candidates.map((candidate) => candidate.token.symbol)).toEqual(["NVDAc"]);
	});

	test("excludes a close-only market: it cannot open the short", () => {
		const closing = [market({ symbol: "NVDA/USD", base: "NVDA", closeOnly: true }), GOOG];
		const candidates = findCarryCandidates(tokens, closing, allBuyable);
		expect(candidates.map((candidate) => candidate.token.symbol)).toEqual(["GOOGLc"]);
	});

	test("excludes an unlisted market", () => {
		const delisted = [market({ symbol: "NVDA/USD", base: "NVDA", isListed: false }), GOOG];
		const candidates = findCarryCandidates(tokens, delisted, allBuyable);
		expect(candidates.map((candidate) => candidate.token.symbol)).toEqual(["GOOGLc"]);
	});

	test("pairs each candidate with the market it actually resolved to", () => {
		const candidates = findCarryCandidates(tokens, markets, allBuyable);
		const alphabet = candidates.find((candidate) => candidate.token.symbol === "GOOGLc");
		expect(alphabet?.market.symbol).toBe("GOOG/USD");
	});

	test("offers nothing when the catalog is empty", () => {
		expect(findCarryCandidates(tokens, [], allBuyable)).toEqual([]);
	});
});
