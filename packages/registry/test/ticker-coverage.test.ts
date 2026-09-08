import { describe, expect, test } from "bun:test";
import { assetClassForTicker, KNOWN_TICKERS } from "@lemon/core";
import { keccak256, toBytes } from "viem";
import { SPOT_TOKENS } from "../src/tokens";

/**
 * The registry and the ticker table have to agree.
 *
 * A vault stores `keccak256(ticker)` and nothing else, so every service that
 * wants the ticker back has to hash candidates from `KNOWN_TICKERS` until one
 * matches. That makes a missing entry silent in the worst way: the hash simply
 * fails to match, the indexer writes a null ticker, and `seed-venue-config`
 * skips the vault because it has no ticker to look a spot token up by. The vault
 * is deployed and funded the whole time, and the operator is told "No venue
 * configuration exists" — a sentence about the database, describing a string
 * missing from an array in another service.
 *
 * That is exactly what happened to the SNDK vault at 0x0f45dc45: tradable by the
 * token registry, classified as an equity, holding a correctly derived agent
 * wallet, and invisible to the seeder for want of four characters in a list.
 *
 * These assertions close that loop. A token cannot enter the spot registry
 * without also being nameable and classifiable, so the failure mode is a red
 * test at the moment the token is added rather than a stranded vault later.
 */

describe("ticker coverage", () => {
	const known = new Set(KNOWN_TICKERS);

	test("every spot token's ticker is recoverable from its hash", () => {
		const missing = SPOT_TOKENS.map((token) => token.ticker).filter((ticker) => !known.has(ticker));
		expect(missing).toEqual([]);
	});

	test("every spot token's ticker is classified", () => {
		const unclassified = SPOT_TOKENS.map((token) => token.ticker).filter(
			(ticker) => assetClassForTicker(ticker) === "unknown",
		);
		expect(unclassified).toEqual([]);
	});

	/**
	 * A collision would hand two markets the same identity — the indexer would
	 * label a vault with whichever ticker was inserted last, and the seeder would
	 * hedge it against that one's spot token. Astronomically unlikely from
	 * keccak256 and free to assert, but the same loop also catches the mundane
	 * version: the same ticker listed twice.
	 */
	test("no two known tickers share a market id", () => {
		const byHash = new Map<string, string>();
		for (const ticker of KNOWN_TICKERS) {
			const hash = keccak256(toBytes(ticker));
			expect(byHash.get(hash)).toBeUndefined();
			byHash.set(hash, ticker);
		}
		expect(byHash.size).toBe(KNOWN_TICKERS.length);
	});

	/**
	 * The vault that exposed the gap, pinned by the market id its constructor
	 * actually stores on Base mainnet. This is the assertion that fails if SNDK
	 * ever falls out of the table again.
	 */
	test("SNDK resolves to the market id the deployed vault carries", () => {
		expect(keccak256(toBytes("SNDK"))).toBe(
			"0x65448db112bae0530d0a664c8eec66023ff591999e2d782fa1175750374321a1",
		);
		expect(known.has("SNDK")).toBe(true);
		expect(assetClassForTicker("SNDK")).toBe("equity");
	});
});
