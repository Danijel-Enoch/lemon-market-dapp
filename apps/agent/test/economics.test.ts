import { describe, expect, it } from "bun:test";
import { VENUE_FEES } from "@lemon/core";
import {
	ACTION_PAYOFF_MULTIPLE,
	BASE_TX_GAS_USDC,
	BRIDGE_CROSSING_USDC,
	breakevenHours,
	costOf,
	describeBreakeven,
	economicFloor,
	NO_FRICTIONS,
	percentOf,
	type TradeFrictions,
} from "../src/economics";

const USDC = 1_000_000n;

/**
 * A pool that charges something and a venue that charges something, so a test
 * that says nothing about frictions is not silently measuring zeros. The
 * numbers are ordinary rather than round: a cost model that only works on
 * round dollars is not a cost model.
 */
function frictions(overrides: Partial<TradeFrictions> = {}): TradeFrictions {
	return {
		spotImpactPercent: 0.05,
		spotGasUsdc: 12_345n,
		withdrawalFeeUsdc: 1_500_000n,
		...overrides,
	};
}

/** The multiple as `economicFloor` reads it, so a fractional setting still lines up. */
const PAYOFF = BigInt(Math.max(1, Math.round(ACTION_PAYOFF_MULTIPLE)));

describe("costOf", () => {
	/**
	 * The split is the whole point of the model. Gas is the same whether a swap
	 * moves ten dollars or ten thousand, which is why "trade a smaller amount" is
	 * never the answer to "this trade costs too much".
	 */
	it("charges the same overhead whatever the trade is worth", () => {
		const small = costOf("deploy", 10n * USDC, frictions());
		const large = costOf("deploy", 10_000n * USDC, frictions());
		expect(large.fixedUsdc).toBe(small.fixedUsdc);
	});

	it("charges a thousand times the fee on a thousand times the notional", () => {
		const small = costOf("deploy", 10n * USDC, frictions());
		const large = costOf("deploy", 10_000n * USDC, frictions());
		expect(large.variableUsdc).toBe(small.variableUsdc * 1_000n);
		expect(small.variableUsdc).toBeGreaterThan(0n);
	});

	it("reports a total that is exactly its two halves", () => {
		const cost = costOf("unwind", 4_321n * USDC, frictions());
		expect(cost.totalUsdc).toBe(cost.fixedUsdc + cost.variableUsdc);
	});

	/**
	 * Counted from `venue.ts` rather than folded into one dollar figure, so a
	 * reader can check them against the adapter. An unwind is the expensive one:
	 * four transactions, a crossing, and the venue's flat fee for moving margin
	 * home.
	 */
	it("prices an unwind as four transactions, a crossing and a withdrawal", () => {
		const f = frictions();
		const cost = costOf("unwind", 1_000n * USDC, f);
		expect(cost.fixedUsdc).toBe(
			BASE_TX_GAS_USDC * 4n + f.spotGasUsdc + BRIDGE_CROSSING_USDC + f.withdrawalFeeUsdc,
		);
	});

	it("prices a deployment as five transactions and a crossing, with nothing withdrawn", () => {
		const f = frictions();
		const cost = costOf("deploy", 1_000n * USDC, f);
		expect(cost.fixedUsdc).toBe(BASE_TX_GAS_USDC * 5n + f.spotGasUsdc + BRIDGE_CROSSING_USDC);
	});

	/** No chain, no bridge, no gas — so nothing that a bigger order would amortise. */
	it("gives a rebalance no fixed cost at all, because it is one signed API call", () => {
		expect(costOf("rebalance", 1_000n * USDC).fixedUsdc).toBe(0n);
		expect(costOf("rebalance", 1_000n * USDC).breakdown).not.toContain("crossing");
	});

	// -- which legs actually move -------------------------------------------

	/**
	 * A rebalance touches the perp leg and nothing else, so it pays one taker fee
	 * and crosses no pool. Charging it the spot side too would price a trade that
	 * does not happen, and would make a correction look uneconomic that is not.
	 */
	it("charges a rebalance one taker fee and no pool impact", () => {
		const notional = 10_000n * USDC;
		const cost = costOf("rebalance", notional, frictions({ spotImpactPercent: 5 }));
		expect(cost.variableUsdc).toBe(percentOf(notional, VENUE_FEES.perpTakerPercent));
	});

	it("charges every other action both legs and the pool it crosses", () => {
		const notional = 10_000n * USDC;
		const impact = 0.5;
		for (const kind of ["deploy", "unwind", "topUp"] as const) {
			const cost = costOf(kind, notional, frictions({ spotImpactPercent: impact }));
			expect(cost.variableUsdc).toBe(
				percentOf(
					notional,
					VENUE_FEES.perpTakerPercent + VENUE_FEES.spotTakerPercent + impact,
				),
			);
		}
	});

	/** Impact is a cost whichever way the quote signed it. */
	it("reads a negative price impact as a cost rather than a rebate", () => {
		const notional = 10_000n * USDC;
		expect(costOf("deploy", notional, frictions({ spotImpactPercent: -0.5 })).variableUsdc).toBe(
			costOf("deploy", notional, frictions({ spotImpactPercent: 0.5 })).variableUsdc,
		);
	});

	it("does not charge a withdrawal fee to an action that withdraws nothing", () => {
		const withFee = costOf("deploy", 1_000n * USDC, frictions({ withdrawalFeeUsdc: 9n * USDC }));
		const without = costOf("deploy", 1_000n * USDC, frictions({ withdrawalFeeUsdc: 0n }));
		expect(withFee.fixedUsdc).toBe(without.fixedUsdc);
	});

	it("prices a notional of nothing as pure overhead", () => {
		const cost = costOf("unwind", 0n, frictions());
		expect(cost.variableUsdc).toBe(0n);
		expect(cost.totalUsdc).toBe(cost.fixedUsdc);
	});

	it("names the parts it charged, so a decision's reason can say why", () => {
		const breakdown = costOf("unwind", 1_000n * USDC, frictions()).breakdown;
		expect(breakdown).toContain("4 Base txs");
		expect(breakdown).toContain("1 crossing");
		expect(breakdown).toContain("withdrawal fee");
	});
});

/**
 * The smallest amount of an action worth committing to.
 *
 * Keyed off the fixed half only, and that is deliberate: the variable half does
 * not decide whether to act, it decides how long the position has to be held.
 */
describe("economicFloor", () => {
	it("is the fixed overhead over again, so a trade is mostly not fee", () => {
		const cost = costOf("unwind", 1_000n * USDC, frictions());
		expect(economicFloor(cost)).toBe(cost.fixedUsdc * PAYOFF);
	});

	it("does not move when the fee on the notional does", () => {
		const small = costOf("unwind", 10n * USDC, frictions());
		const large = costOf("unwind", 100_000n * USDC, frictions());
		expect(large.variableUsdc).toBeGreaterThan(small.variableUsdc);
		expect(economicFloor(large)).toBe(economicFloor(small));
	});

	/** An action with no overhead has no floor to clear — see the rebalance shape. */
	it("asks nothing of an action that costs no overhead", () => {
		expect(economicFloor(costOf("rebalance", 1_000n * USDC))).toBe(0n);
	});
});

describe("breakevenHours", () => {
	it("is the cost divided by what an hour of funding pays", () => {
		// $10 of cost against a $10,000 position paying 0.01%/hour, which is $1/hour.
		expect(breakevenHours(10n * USDC, 10_000n * USDC, 0.01)).toBeCloseTo(10, 6);
	});

	/**
	 * Null is not zero and must never be rendered as "free". A market whose short
	 * side pays nothing never recovers an entry fee, so the honest answer to "when
	 * does this pay for itself" is "it does not".
	 */
	it("never pays back a market whose short side pays nothing", () => {
		expect(breakevenHours(10n * USDC, 10_000n * USDC, 0)).toBeNull();
	});

	it("never pays back a market whose short side costs money", () => {
		expect(breakevenHours(10n * USDC, 10_000n * USDC, -0.05)).toBeNull();
	});

	it("never pays back a position too small for an hour of funding to round to a unit", () => {
		expect(breakevenHours(10n * USDC, 1n, 0.0001)).toBeNull();
	});

	it("has nothing to pay it back when there is no position", () => {
		expect(breakevenHours(10n * USDC, 0n, 0.05)).toBeNull();
	});

	/** The distinction the phrasing has to preserve: "never" is not "immediately". */
	it("says never rather than a duration when funding will not recover it", () => {
		expect(describeBreakeven(null)).toContain("never");
		expect(describeBreakeven(null)).not.toBe(describeBreakeven(0));
		expect(describeBreakeven(0)).toBe("0.0 hours");
	});

	it("switches to days once hours stop being readable", () => {
		expect(describeBreakeven(12)).toBe("12.0 hours");
		expect(describeBreakeven(72)).toBe("3.0 days");
	});
});

/**
 * The percent is a float because that is what both venues quote; the amount is
 * money and stays exact until the multiplication. This is why it goes through
 * integers rather than through a double.
 */
describe("percentOf", () => {
	it("takes a whole percent of an amount a double could not hold", () => {
		// 2^53 + 1: the first integer a double cannot represent.
		const huge = 9_007_199_254_740_993n;
		expect(percentOf(huge, 100)).toBe(huge);
		// The float route loses the last unit, which is the reason for the bigint one.
		expect(BigInt(Math.round(Number(huge)))).not.toBe(huge);
	});

	it("keeps the last units of a fee on a position a double would round", () => {
		const huge = 9_007_199_254_740_993n;
		// A tenth of a percent is a thousandth, and the exact quotient floors here.
		expect(percentOf(huge, 0.1)).toBe(huge / 1_000n);
		expect(percentOf(huge, 0.1)).toBe(9_007_199_254_740n);
	});

	it("holds a thousandth of a percent exactly, which is the finest fee quoted", () => {
		expect(percentOf(100_000_000n, 0.001)).toBe(1_000n);
	});

	it("is nothing when there is no amount, no percent, or nothing sensible", () => {
		expect(percentOf(0n, 5)).toBe(0n);
		expect(percentOf(-100n, 5)).toBe(0n);
		expect(percentOf(1_000n * USDC, 0)).toBe(0n);
		expect(percentOf(1_000n * USDC, Number.NaN)).toBe(0n);
		expect(percentOf(1_000n * USDC, Number.POSITIVE_INFINITY)).toBe(0n);
	});

	it("adds up the way a fee schedule does", () => {
		const amount = 7_777n * USDC;
		expect(percentOf(amount, 0.1) + percentOf(amount, 0.1)).toBe(percentOf(amount, 0.2));
	});
});

describe("NO_FRICTIONS", () => {
	/** The default, so a caller with no quote in hand still gets the overhead. */
	it("still charges the overhead an action cannot avoid", () => {
		const cost = costOf("unwind", 1_000n * USDC, NO_FRICTIONS);
		expect(cost.fixedUsdc).toBe(BASE_TX_GAS_USDC * 4n + BRIDGE_CROSSING_USDC);
		expect(cost.variableUsdc).toBe(
			percentOf(1_000n * USDC, VENUE_FEES.perpTakerPercent + VENUE_FEES.spotTakerPercent),
		);
	});
});
