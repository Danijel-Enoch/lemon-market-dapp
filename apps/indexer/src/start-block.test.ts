import { describe, expect, it } from "bun:test";
import { assertStartBlocks, GENESIS_SCAN_OVERRIDE, resolveStartBlock } from "./start-block";

/**
 * Every case here is a way of ending up at block 0 without meaning to.
 *
 * That is the only outcome that actually breaks: the backfill runs, answers
 * correctly, finds nothing for tens of millions of blocks, and reports 0.0%
 * forever. Nothing below is hypothetical — each is a configuration a deployment
 * really produces.
 */
describe("resolveStartBlock", () => {
	it("reads the chain's own variable", () => {
		expect(resolveStartBlock("BASE", { VAULT_FACTORY_START_BLOCK_BASE: "50919528" })).toBe(
			50919528,
		);
	});

	it("treats an empty variable as unset, which is how Compose writes one", () => {
		// `VAULT_FACTORY_START_BLOCK_BASE: ${VAULT_FACTORY_START_BLOCK_BASE:-}` arrives
		// as "", which is not nullish — so `??` would stop here and the unsuffixed
		// variable below would never be read.
		expect(
			resolveStartBlock("BASE", {
				VAULT_FACTORY_START_BLOCK_BASE: "",
				VAULT_FACTORY_START_BLOCK: "50919528",
			}),
		).toBe(50919528);
	});

	it("tolerates the spacing a hand-edited .env has", () => {
		expect(resolveStartBlock("BASE", { VAULT_FACTORY_START_BLOCK_BASE: " 50919528 " })).toBe(
			50919528,
		);
	});

	it("keeps the unsuffixed variable meaning Base, and only Base", () => {
		expect(resolveStartBlock("BASE", { VAULT_FACTORY_START_BLOCK: "50919528" })).toBe(50919528);
		// An Arbitrum source started at Base's deployment block would skip whatever
		// is actually there, so the older name is not allowed to leak across chains.
		expect(resolveStartBlock("ARBITRUM", { VAULT_FACTORY_START_BLOCK: "50919528" })).toBe(0);
	});

	it("prefers the chain's own variable over the older unsuffixed one", () => {
		expect(
			resolveStartBlock("BASE", {
				VAULT_FACTORY_START_BLOCK_BASE: "50919528",
				VAULT_FACTORY_START_BLOCK: "1",
			}),
		).toBe(50919528);
	});

	it("returns 0 when nothing is set, leaving the refusal to the caller", () => {
		expect(resolveStartBlock("XLAYER", {})).toBe(0);
	});

	it("rejects a value that is not a block number, naming the variable", () => {
		// `Number("latest")` is NaN, and a NaN start block reaches Ponder as a range
		// whose every comparison is false — a stranger failure than the typo earns.
		expect(() => resolveStartBlock("BASE", { VAULT_FACTORY_START_BLOCK_BASE: "latest" })).toThrow(
			/VAULT_FACTORY_START_BLOCK_BASE/,
		);
		expect(() =>
			resolveStartBlock("BASE", { VAULT_FACTORY_START_BLOCK_BASE: "50_919_528" }),
		).toThrow();
		expect(() => resolveStartBlock("BASE", { VAULT_FACTORY_START_BLOCK_BASE: "-1" })).toThrow();
		expect(() => resolveStartBlock("BASE", { VAULT_FACTORY_START_BLOCK_BASE: "1.5" })).toThrow();
	});

	it("names the older variable when that is the one that is wrong", () => {
		expect(() => resolveStartBlock("BASE", { VAULT_FACTORY_START_BLOCK: "latest" })).toThrow(
			/VAULT_FACTORY_START_BLOCK is/,
		);
	});
});

describe("assertStartBlocks", () => {
	const base = { name: "base", envSuffix: "BASE" };
	const xlayer = { name: "xlayer", envSuffix: "XLAYER" };

	it("passes when every configured chain has a start block", () => {
		expect(() =>
			assertStartBlocks(
				[
					{ ...base, startBlock: 50919528 },
					{ ...xlayer, startBlock: 71408658 },
				],
				{},
			),
		).not.toThrow();
	});

	it("refuses a configured factory with no start block", () => {
		expect(() => assertStartBlocks([{ ...base, startBlock: 0 }], {})).toThrow(
			/VAULT_FACTORY_START_BLOCK_BASE/,
		);
	});

	it("names every misconfigured chain, not just the first", () => {
		// Otherwise this is fixed one restart at a time, and each restart is another
		// backfill from genesis before the next one is noticed.
		let message = "";
		try {
			assertStartBlocks(
				[
					{ ...base, startBlock: 0 },
					{ ...xlayer, startBlock: 0 },
				],
				{},
			);
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain("VAULT_FACTORY_START_BLOCK_BASE");
		expect(message).toContain("VAULT_FACTORY_START_BLOCK_XLAYER");
	});

	it("ignores a correctly configured chain beside a broken one", () => {
		let message = "";
		try {
			assertStartBlocks(
				[
					{ ...base, startBlock: 0 },
					{ ...xlayer, startBlock: 71408658 },
				],
				{},
			);
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain("base");
		expect(message).not.toContain("VAULT_FACTORY_START_BLOCK_XLAYER");
	});

	it("passes when there is nothing configured to index", () => {
		// A chain with no factory address never becomes a source, so genesis here is
		// not a mistake — it is the disabled placeholder the config falls back to.
		expect(() => assertStartBlocks([], {})).not.toThrow();
	});

	it("allows genesis deliberately, for a local chain where block 0 is minutes old", () => {
		expect(() =>
			assertStartBlocks([{ ...base, startBlock: 0 }], { [GENESIS_SCAN_OVERRIDE]: "true" }),
		).not.toThrow();
		expect(() =>
			assertStartBlocks([{ ...base, startBlock: 0 }], { [GENESIS_SCAN_OVERRIDE]: " TRUE " }),
		).not.toThrow();
	});

	it("does not treat an empty override as permission", () => {
		// Compose writes the unset variable as "", and an indexer that read that as
		// consent would be exactly the silent genesis scan this guard exists to stop.
		expect(() =>
			assertStartBlocks([{ ...base, startBlock: 0 }], { [GENESIS_SCAN_OVERRIDE]: "" }),
		).toThrow();
		expect(() =>
			assertStartBlocks([{ ...base, startBlock: 0 }], { [GENESIS_SCAN_OVERRIDE]: "false" }),
		).toThrow();
	});
});
