import { describe, expect, test } from "bun:test";
import type { Market } from "@lemon/core";
import { annualizeFunding, deltaDriftPercent, planCarry } from "../src/carry";

const market: Market = {
	pairIndex: 81,
	symbol: "NVDA/USD",
	base: "NVDA",
	quote: "USD",
	assetClass: "equity",
	pythSymbol: "Equity.US.NVDA/USD",
	isUpside: false,
	minLeverage: 1,
	maxLeverage: 5,
	minPositionUsdc: 100,
	openInterest: 86_842,
	maxOpenInterest: 1_578_105,
	availableOpenInterest: 1_491_263,
	isListed: true,
	closeOnly: false,
	isOpen: true,
	nextOpen: null,
	nextClose: null,
};

const noCosts = {
	openFeePercent: 0,
	closeFeePercent: 0,
	spreadPercent: 0,
	spotBuyImpactPercent: 0,
	spotSellImpactPercent: 0,
	gasUsd: 0,
};

describe("carry sizing", () => {
	test("legs are equal notional, which is what makes it delta neutral", () => {
		const plan = planCarry({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: 0 },
			costs: noCosts,
			market,
		});

		expect(plan.spotCostUsd).toBe(1000);
		expect(plan.perpCollateralUsd).toBe(500);
		// Spot outlay plus perp margin.
		expect(plan.totalCapitalUsd).toBe(1500);
	});

	test("higher leverage frees capital without changing exposure", () => {
		const low = planCarry({
			notionalUsd: 1000,
			perpLeverage: 1,
			funding: { long: 0, short: 0 },
			costs: noCosts,
			market,
		});
		const high = planCarry({
			notionalUsd: 1000,
			perpLeverage: 5,
			funding: { long: 0, short: 0 },
			costs: noCosts,
			market,
		});

		expect(low.totalCapitalUsd).toBe(2000);
		expect(high.totalCapitalUsd).toBe(1200);
		expect(low.notionalUsd).toBe(high.notionalUsd);
	});
});

describe("funding sign", () => {
	/**
	 * The protocol documents this as: "A positive rate means you receive,
	 * negative means you pay." A carry holds the SHORT side, so the short rate
	 * is what accrues. Inverting this would advertise a losing position as
	 * yield-generating, which is the single most costly bug this module could
	 * have.
	 */
	test("a positive short rate earns", () => {
		const plan = planCarry({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: -0.001, short: 0.001 },
			costs: noCosts,
			market,
		});

		expect(plan.netFundingPerHourPercent).toBe(0.001);
		expect(plan.hasPositiveFunding).toBe(true);
		expect(plan.fundingApyPercent).toBeGreaterThan(0);
		expect(plan.warnings.some((w) => w.includes("pays funding"))).toBe(false);
	});

	test("a negative short rate pays, and says so", () => {
		// This is the live NVDA condition: shorts are crowded, so shorts pay.
		const plan = planCarry({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0.00062496, short: -0.0005672 },
			costs: noCosts,
			market,
		});

		expect(plan.hasPositiveFunding).toBe(false);
		expect(plan.isNetPositive).toBe(false);
		expect(plan.fundingApyPercent).toBeLessThan(0);
		expect(plan.warnings.some((w) => w.includes("pays funding rather than earning"))).toBe(true);
	});

	test("the long rate is ignored — the carry is short the perp", () => {
		const plan = planCarry({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 5, short: -1 },
			costs: noCosts,
			market,
		});
		expect(plan.netFundingPerHourPercent).toBe(-1);
	});

	test("annualisation uses hours, not days", () => {
		expect(annualizeFunding(0.001)).toBeCloseTo(8.76, 5);
	});
});

describe("costs and net result", () => {
	test("positive funding can still be net-negative after costs", () => {
		// Funding earns, but a 1.6% round trip on these pools swallows it.
		const plan = planCarry({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: -0.00001, short: 0.00001 },
			costs: {
				...noCosts,
				spotBuyImpactPercent: -1.6,
				spotSellImpactPercent: -1.6,
			},
			market,
		});

		expect(plan.hasPositiveFunding).toBe(true);
		expect(plan.isNetPositive).toBe(false);
		// The two flags must not be conflated in the UI.
		expect(plan.hasPositiveFunding).not.toBe(plan.isNetPositive);
		expect(plan.warnings.some((w) => w.includes("costs exceed it"))).toBe(true);
	});

	test("breakeven is null when funding never pays it back", () => {
		const plan = planCarry({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: -0.001 },
			costs: { ...noCosts, spotBuyImpactPercent: -1 },
			market,
		});
		expect(plan.breakevenHours).toBeNull();
	});

	test("round-trip cost counts both entry and exit", () => {
		const plan = planCarry({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: 0 },
			costs: {
				openFeePercent: 0.045,
				closeFeePercent: 0.045,
				spreadPercent: 0.05,
				spotBuyImpactPercent: -1.5,
				spotSellImpactPercent: -1.5,
				gasUsd: 0.1,
			},
			market,
		});

		// (0.045 + 0.045 + 0.05)% of 1000 = 1.40, plus 3% slippage = 30, plus gas.
		expect(plan.roundTripCostUsd).toBeCloseTo(1.4 + 30 + 0.1, 6);
	});
});

describe("warnings", () => {
	test("equity carries warn about the weekend hedge gap", () => {
		const plan = planCarry({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: 0.001 },
			costs: noCosts,
			market,
		});
		expect(plan.warnings.some((w) => w.includes("close nights and weekends"))).toBe(true);
	});

	test("below-minimum size is flagged", () => {
		const plan = planCarry({
			notionalUsd: 50,
			perpLeverage: 2,
			funding: { long: 0, short: 0.001 },
			costs: noCosts,
			market,
		});
		expect(plan.warnings.some((w) => w.includes("minimum position"))).toBe(true);
	});

	test("a closed market is flagged", () => {
		const plan = planCarry({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: 0.001 },
			costs: noCosts,
			market: { ...market, isOpen: false },
		});
		expect(plan.warnings.some((w) => w.includes("is closed"))).toBe(true);
	});
});

describe("delta drift", () => {
	test("matched legs have no drift", () => {
		expect(deltaDriftPercent(1000, 1000)).toBe(0);
	});

	test("drift is reported as a percentage of the spot leg", () => {
		expect(deltaDriftPercent(1000, 900)).toBeCloseTo(10, 6);
		expect(deltaDriftPercent(1000, 1100)).toBeCloseTo(-10, 6);
	});
});
