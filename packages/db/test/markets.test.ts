import { describe, expect, it } from "bun:test";
import { FULL_WEIGHT_BPS, validateWeights } from "../src/markets";

/**
 * The gate on a vault's market weights.
 *
 * Small and pure, and worth stating explicitly because it is the last check
 * before a set of weights reaches an agent that deploys real capital against
 * them. Every case below is a set that looks reasonable in a form and would be
 * wrong in a vault.
 */

const ok = (ticker: string, targetWeightBps: number) => ({ ticker, targetWeightBps });

describe("validateWeights", () => {
	it("accepts a single market at the full weight", () => {
		expect(validateWeights([ok("NVDA", FULL_WEIGHT_BPS)])).toBeNull();
	});

	it("accepts a set that adds up", () => {
		expect(validateWeights([ok("BTC", 4_000), ok("ETH", 4_000), ok("NVDA", 2_000)])).toBeNull();
	});

	/**
	 * Refused rather than normalised. A set summing to 90% is far more often a
	 * typo than an intention to leave a tenth of the vault idle, and scaling it up
	 * on the operator's behalf would deploy capital at proportions nobody chose.
	 */
	it("refuses a set that does not add up, and says what it adds up to", () => {
		expect(validateWeights([ok("BTC", 4_000), ok("ETH", 4_000)])).toContain("80.00%");
	});

	it("refuses a set that adds up to more than everything", () => {
		expect(validateWeights([ok("BTC", 7_000), ok("ETH", 7_000)])).toContain("140.00%");
	});

	/**
	 * A zero weight is not "keep it but do not fund it" — it is how a *retired*
	 * market is represented, and reaching that state through the editor rather
	 * than through removal would leave the row enabled with nothing going into it.
	 */
	it("refuses a zero weight rather than treating it as a removal", () => {
		expect(validateWeights([ok("BTC", 10_000), ok("ETH", 0)])).toContain("positive weight");
	});

	it("refuses a negative weight", () => {
		expect(validateWeights([ok("BTC", 12_000), ok("ETH", -2_000)])).toContain("positive weight");
	});

	/** Basis points are integers. A fractional one is a unit mix-up upstream. */
	it("refuses a fractional weight", () => {
		expect(validateWeights([ok("BTC", 5_000.5), ok("ETH", 4_999.5)])).toContain("positive weight");
	});

	/**
	 * Two rows for one market would each be written and the second would win,
	 * silently discarding the first's weight while the total still checked out.
	 */
	it("refuses the same market twice, however it is cased", () => {
		expect(validateWeights([ok("btc", 5_000), ok("BTC", 5_000)])).toContain("listed twice");
	});

	it("refuses an empty set and points at the right tool", () => {
		expect(validateWeights([])).toContain("close its positions");
	});
});
