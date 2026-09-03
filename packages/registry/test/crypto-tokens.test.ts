import { describe, expect, test } from "bun:test";
import { isLayer1Or2, LAYER_1_2_BASES, PERP_CRYPTO_TOKENS } from "../src/crypto-tokens";
import { SPOT_TOKENS } from "../src/tokens";

/**
 * Curation guards.
 *
 * The crypto token list is the one place where a plausible-looking mistake
 * costs real money: a token that matches a perp by symbol but is a different
 * asset produces a hedge against the wrong thing, and nothing in the app would
 * report it as wrong. These assertions pin the shape of the list rather than
 * its contents, so an addition that breaks a rule fails here.
 */

describe("crypto token registry", () => {
	test("every address is a checksummed-length Base address", () => {
		for (const token of PERP_CRYPTO_TOKENS) {
			expect(token.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
		}
	});

	test("addresses are unique — a duplicate would pair two tickers to one pool", () => {
		const seen = PERP_CRYPTO_TOKENS.map((token) => token.address.toLowerCase());
		expect(new Set(seen).size).toBe(seen.length);
	});

	test("symbols are unique across the whole spot registry", () => {
		const symbols = SPOT_TOKENS.map((token) => token.symbol);
		expect(new Set(symbols).size).toBe(symbols.length);
	});

	test("decimals are plausible", () => {
		for (const token of PERP_CRYPTO_TOKENS) {
			expect(token.decimals).toBeGreaterThan(0);
			expect(token.decimals).toBeLessThanOrEqual(18);
		}
	});

	/**
	 * These four were the additions that a naive symbol sweep would have made,
	 * and each is a different asset from the perp of the same name.
	 */
	test("known lookalikes are absent", () => {
		const tickers = new Set(PERP_CRYPTO_TOKENS.map((token) => token.ticker.toUpperCase()));
		for (const impostor of ["DOGE", "FARTCOIN", "TRUMP", "STRK"]) {
			expect(tickers.has(impostor)).toBe(false);
		}
	});

	/**
	 * 1000x-denominated perps must not pair with a 1x spot token.
	 *
	 * The check is against the actual k-market bases, not a "starts with K"
	 * rule — that would also reject KAITO, which is an ordinary 1x market.
	 */
	test("no token targets a k-denominated perp", () => {
		const kMarkets = new Set(["KBONK", "KPEPE", "KSHIB"]);
		for (const token of PERP_CRYPTO_TOKENS) {
			expect(kMarkets.has(token.ticker.toUpperCase())).toBe(false);
		}
	});
});

describe("layer 1 / layer 2 curation", () => {
	test("recognises chains, case-insensitively", () => {
		expect(isLayer1Or2("BTC")).toBe(true);
		expect(isLayer1Or2("eth")).toBe(true);
		expect(isLayer1Or2(" sol ")).toBe(true);
		expect(isLayer1Or2("ARB")).toBe(true);
	});

	/**
	 * The distinction the filter exists to make: an application's token is not a
	 * chain, however large it is.
	 */
	test("excludes protocol tokens that merely live on a chain", () => {
		for (const app of ["LINK", "AAVE", "UNI", "CRV", "ENA", "JUP", "WLD", "ZRO", "VVV", "KAITO"]) {
			expect(isLayer1Or2(app)).toBe(false);
		}
	});

	test("excludes memecoins that are not their own chain", () => {
		for (const meme of ["FARTCOIN", "PENGU", "WIF", "PUMP", "TRUMP"]) {
			expect(isLayer1Or2(meme)).toBe(false);
		}
	});

	test("includes chains whose reputation is memetic but which are still L1s", () => {
		expect(isLayer1Or2("DOGE")).toBe(true);
		expect(isLayer1Or2("LTC")).toBe(true);
	});

	test("the set has no duplicates", () => {
		expect(new Set(LAYER_1_2_BASES).size).toBe(LAYER_1_2_BASES.length);
	});

	test("entries are upper case, so the lookup cannot silently miss", () => {
		for (const base of LAYER_1_2_BASES) expect(base).toBe(base.toUpperCase());
	});
});
