import { describe, expect, test } from "bun:test";
import type { BasisMarket, UserBalances } from "@lemon/client";
import { planEntry } from "./EntryPlanner";

/**
 * The sizing arithmetic.
 *
 * Tested because this is the one place in the self-managed flow where a wrong
 * number is both invisible and expensive: every figure here is read by someone
 * deciding how much capital to commit, and none of them is checked against a
 * venue before they act on it. A liquidation price that is too high or a margin
 * requirement that is too low does not fail loudly — it fails weeks later, on
 * the position.
 *
 * The component around it is not tested. Rendering is checked by looking at it;
 * the multiplication is not.
 */

/** A market with round numbers, so an assertion states the intent rather than a constant. */
function market(overrides: Partial<BasisMarket> = {}): BasisMarket {
	return {
		id: "TEST",
		chainId: 8453,
		ticker: "TEST",
		name: "Test Asset",
		assetClass: "crypto",
		logoUrl: null,
		spot: {
			symbol: "tTEST",
			address: "0x0000000000000000000000000000000000000001",
			decimals: 18,
			priceUsd: 100,
			buyable: true,
			sellable: true,
			priceImpactPercent: -0.5,
			probeFailed: false,
			checkedAt: null,
		},
		perp: {
			symbol: "TEST/USD",
			pacificaSymbol: "TEST",
			markPrice: 100,
			maxLeverage: 10,
			minPositionUsdc: 10,
			lotSize: 0.001,
			tickSize: 0.01,
			openInterest: 1_000_000,
			availableOpenInterest: 500_000,
			isOpen: true,
			// 0.001% an hour — a round 8.76% a year.
			fundingShortPercentPerHour: 0.001,
			fundingLongPercentPerHour: -0.001,
		},
		economics: {
			basisPercent: 0.1,
			fundingShortPercentPerHour: 0.001,
			fundingAprPercent: 8.76,
			fundingApyPercent: 8.76,
			// 1% of notional for the whole round trip.
			roundTripCostPercent: 1,
			netApyPercent: 7.76,
			breakevenDays: 41.7,
			referenceNotionalUsd: 10_000,
			referenceLeverage: 1,
		},
		blockers: [],
		...overrides,
	};
}

function balances(overrides: Partial<UserBalances> = {}): UserBalances {
	return {
		solana: { address: "So1", idleUsdc: "0", tokenAccountReady: true },
		pacifica: {
			account: "So1",
			registered: true,
			equityUsdc: "1000000000",
			availableUsdc: "1000000000",
			usedUsdc: "0",
		},
		minimums: { depositUsdc: 10, positionUsdc: 25 },
		...overrides,
	};
}

describe("capital requirements", () => {
	test("at 1x the short is fully collateralised, so margin equals notional", () => {
		const plan = planEntry({ market: market(), notional: 1_000, leverage: 1 });

		expect(plan.spotCapital).toBe(1_000);
		expect(plan.margin).toBe(1_000);
		expect(plan.totalCapital).toBe(2_000);
	});

	test("leverage shrinks the margin and nothing else", () => {
		const plan = planEntry({ market: market(), notional: 1_000, leverage: 4 });

		// The spot leg is bought outright whatever the short is doing — leverage
		// applies to the perp only, and quoting it against the whole position is a
		// common way to understate what a basis trade actually ties up.
		expect(plan.spotCapital).toBe(1_000);
		expect(plan.margin).toBe(250);
		expect(plan.totalCapital).toBe(1_250);
	});
});

describe("yield", () => {
	test("funding accrues on notional, not on margin", () => {
		const base = planEntry({ market: market(), notional: 1_000, leverage: 1 });
		const levered = planEntry({ market: market(), notional: 1_000, leverage: 5 });

		// 1000 * 0.001% * 24 hours = $0.24 a day, whatever backs the short.
		expect(base.fundingPerDay).toBeCloseTo(0.24, 10);
		expect(levered.fundingPerDay).toBeCloseTo(0.24, 10);
	});

	test("breakeven is the round trip divided by daily funding", () => {
		const plan = planEntry({ market: market(), notional: 1_000, leverage: 1 });

		// 1% of $1,000 is $10, against $0.24 a day.
		expect(plan.roundTrip).toBeCloseTo(10, 10);
		expect(plan.breakevenDays).toBeCloseTo(10 / 0.24, 8);
	});

	test("breakeven is null rather than infinite when funding is negative", () => {
		const negative = market();
		negative.perp.fundingShortPercentPerHour = -0.001;
		negative.economics.fundingShortPercentPerHour = -0.001;

		const plan = planEntry({ market: negative, notional: 1_000, leverage: 1 });

		// Null is the honest answer: the position never pays for itself out of
		// funding, and a very large number would read as "eventually".
		expect(plan.breakevenDays).toBeNull();
		expect(plan.problems.some((p) => p.includes("negative"))).toBe(true);
	});
});

describe("liquidation price", () => {
	test("there is none at 1x", () => {
		const plan = planEntry({ market: market(), notional: 1_000, leverage: 1 });
		// Not a missing value. A fully collateralised short cannot be liquidated,
		// and inventing a price would invent a risk the position does not carry.
		expect(plan.liquidationPrice).toBeNull();
	});

	test("a short is liquidated above the mark, by one over the leverage", () => {
		const plan = planEntry({ market: market(), notional: 1_000, leverage: 4 });
		// A short loses as price rises; at 4x, a 25% rise wipes the margin.
		expect(plan.liquidationPrice).toBeCloseTo(125, 10);
	});

	test("more leverage means a nearer liquidation", () => {
		const two = planEntry({ market: market(), notional: 1_000, leverage: 2 });
		const eight = planEntry({ market: market(), notional: 1_000, leverage: 8 });

		expect(two.liquidationPrice).toBeGreaterThan(eight.liquidationPrice as number);
	});
});

describe("what would be rejected", () => {
	test("a position under the venue's market minimum is flagged", () => {
		const plan = planEntry({ market: market(), notional: 5, leverage: 1 });
		expect(plan.problems.some((p) => p.includes("minimum position"))).toBe(true);
	});

	test("leverage above the venue's ceiling is flagged", () => {
		const plan = planEntry({ market: market(), notional: 1_000, leverage: 25 });
		expect(plan.problems.some((p) => p.includes("at most 10x"))).toBe(true);
	});

	test("margin under the deposit floor is flagged, because the deposit would bounce", () => {
		// $100 at 20x needs $5 of margin, under Pacifica's $10 deposit minimum.
		// The order would be accepted and the deposit funding it would not.
		const plan = planEntry({
			market: market(),
			notional: 100,
			leverage: 20,
			balances: balances(),
		});
		expect(plan.problems.some((p) => p.includes("rejects deposits below"))).toBe(true);
	});

	test("margin that is not actually on Pacifica is flagged against the real balance", () => {
		const plan = planEntry({
			market: market(),
			notional: 10_000,
			leverage: 1,
			balances: balances({
				pacifica: {
					account: "So1",
					registered: true,
					equityUsdc: "50000000",
					availableUsdc: "50000000",
					usedUsdc: "0",
				},
			}),
		});
		// $10,000 of margin needed against $50 available.
		expect(plan.problems.some((p) => p.includes("is available there"))).toBe(true);
	});

	test("a well-funded, correctly sized position raises nothing", () => {
		const plan = planEntry({
			market: market(),
			notional: 1_000,
			leverage: 1,
			balances: balances(),
		});
		expect(plan.problems).toEqual([]);
	});
});
