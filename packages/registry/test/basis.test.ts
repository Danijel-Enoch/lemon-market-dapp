import { describe, expect, test } from "bun:test";
import type { Market } from "@lemon/core";
import { ROUND_TRIP_FEE_PERCENT, VENUE_FEES } from "@lemon/core";
import {
	annualizeFunding,
	computeBasisEconomics,
	defaultCosts,
	deltaDriftPercent,
	planBasis,
	roundTripFeePercent,
	spotPerpBasisPercent,
} from "../src/basis";

const market: Market = {
	symbol: "NVDA/USD",
	base: "NVDA",
	quote: "USD",
	assetClass: "equity",
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

/** Costs zeroed out, for tests that isolate sizing or funding from fees. */
const noCosts = defaultCosts({ spotFeePercent: 0, perpFeePercent: 0 });

describe("position sizing", () => {
	test("legs are equal notional, which is what makes it delta neutral", () => {
		const plan = planBasis({
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
		const low = planBasis({
			notionalUsd: 1000,
			perpLeverage: 1,
			funding: { long: 0, short: 0 },
			costs: noCosts,
			market,
		});
		const high = planBasis({
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
	 * negative means you pay." The position holds the SHORT side, so the short
	 * rate is what accrues. Inverting this would advertise a losing position as
	 * yield-generating, which is the single most costly bug this module could
	 * have.
	 */
	test("a positive short rate earns", () => {
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: -0.001, short: 0.001 },
			costs: noCosts,
			market,
		});

		expect(plan.netFundingPerHourPercent).toBe(0.001);
		expect(plan.hasPositiveFunding).toBe(true);
		expect(plan.fundingApyPercent).toBeGreaterThan(0);
		expect(plan.warnings.some((w: string) => w.includes("pays funding"))).toBe(false);
	});

	test("a negative short rate pays, and says so", () => {
		// This is the live NVDA condition: shorts are crowded, so shorts pay.
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0.00062496, short: -0.0005672 },
			costs: noCosts,
			market,
		});

		expect(plan.hasPositiveFunding).toBe(false);
		expect(plan.isNetPositive).toBe(false);
		expect(plan.fundingApyPercent).toBeLessThan(0);
		expect(plan.warnings.some((w: string) => w.includes("pays funding rather than earning"))).toBe(
			true,
		);
	});

	test("the long rate is ignored — the position is short the perp", () => {
		const plan = planBasis({
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

	test("APR is on notional, APY is on the capital actually deployed", () => {
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 1,
			funding: { long: 0, short: 0.001 },
			costs: noCosts,
			market,
		});

		// At 1x, capital is 2x notional (spot outlay plus equal margin), so the
		// yield on capital is half the yield on notional.
		expect(plan.fundingAprPercent).toBeCloseTo(8.76, 5);
		expect(plan.fundingApyPercent).toBeCloseTo(4.38, 5);
	});
});

describe("fees", () => {
	/**
	 * The mistake this guards against is charging a round trip as two fills
	 * instead of four. A position crosses both legs on the way in and both
	 * again on the way out, so at 0.1% a side the true cost is 0.4% of
	 * notional — halving it understates the cost by most of a month's funding
	 * at single-digit yields.
	 */
	test("a round trip is four fills, not two", () => {
		expect(roundTripFeePercent(defaultCosts())).toBeCloseTo(0.4, 10);
		expect(ROUND_TRIP_FEE_PERCENT).toBeCloseTo(0.4, 10);
		expect(VENUE_FEES.spotTakerPercent).toBe(0.1);
		expect(VENUE_FEES.perpTakerPercent).toBe(0.1);
	});

	test("both venues charge, and both are counted", () => {
		const plan = planBasis({
			notionalUsd: 10_000,
			perpLeverage: 2,
			funding: { long: 0, short: 0 },
			costs: defaultCosts(),
			market,
		});

		// 0.4% of $10,000, with no slippage or gas modelled.
		expect(plan.roundTripCostUsd).toBeCloseTo(40, 6);
		expect(plan.roundTripCostPercent).toBeCloseTo(0.4, 6);
	});

	test("the venue spread adds to the flat taker rate", () => {
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: 0 },
			costs: defaultCosts({ spreadPercent: 0.05, gasUsd: 0.1 }),
			market,
		});

		// (0.4 + 0.05)% of 1000 = 4.50, plus gas.
		expect(plan.roundTripCostUsd).toBeCloseTo(4.5 + 0.1, 6);
	});

	test("slippage is counted on both the entry and the exit", () => {
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: 0 },
			costs: defaultCosts({ spotBuyImpactPercent: -1.5, spotSellImpactPercent: -1.5 }),
			market,
		});

		// 0.4% fees = 4, plus 3% slippage = 30.
		expect(plan.roundTripCostUsd).toBeCloseTo(34, 6);
	});
});

describe("net result", () => {
	test("positive funding can still be net-negative after costs", () => {
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: -0.00001, short: 0.00001 },
			costs: defaultCosts({ spotBuyImpactPercent: -1.6, spotSellImpactPercent: -1.6 }),
			market,
		});

		expect(plan.hasPositiveFunding).toBe(true);
		expect(plan.isNetPositive).toBe(false);
		// The two flags must not be conflated in the UI.
		expect(plan.hasPositiveFunding).not.toBe(plan.isNetPositive);
		expect(plan.warnings.some((w: string) => w.includes("costs exceed it"))).toBe(true);
	});

	test("fees alone can flip a thin edge negative", () => {
		// The threshold is exact: the round trip costs 0.4% of notional, so a
		// position is only worth holding when a year of funding clears that.
		// 0.0005%/hour annualises to 4.38%, comfortably above it.
		const survives = planBasis({
			notionalUsd: 10_000,
			perpLeverage: 2,
			funding: { long: -0.0005, short: 0.0005 },
			costs: defaultCosts(),
			market,
		});
		expect(survives.fundingAprPercent).toBeCloseTo(4.38, 6);
		expect(survives.isNetPositive).toBe(true);

		// 0.00003%/hour annualises to 0.2628% — real, positive funding that the
		// same fixed cost still swallows whole.
		const drowns = planBasis({
			notionalUsd: 10_000,
			perpLeverage: 2,
			funding: { long: -0.00003, short: 0.00003 },
			costs: defaultCosts(),
			market,
		});
		expect(drowns.fundingAprPercent).toBeCloseTo(0.2628, 6);
		expect(drowns.hasPositiveFunding).toBe(true);
		expect(drowns.isNetPositive).toBe(false);
	});

	test("breakeven is null when funding never pays it back", () => {
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: -0.001 },
			costs: defaultCosts({ spotBuyImpactPercent: -1 }),
			market,
		});
		expect(plan.breakevenHours).toBeNull();
	});
});

describe("warnings", () => {
	test("equity positions warn that the underlying market closes", () => {
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: 0.001 },
			costs: noCosts,
			market,
		});
		expect(plan.warnings.some((w: string) => w.includes("underlying stock market closes"))).toBe(
			true,
		);
	});

	test("crypto positions carry no session warning", () => {
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 2,
			funding: { long: 0, short: 0.001 },
			costs: noCosts,
			market: { ...market, symbol: "BTC/USD", base: "BTC", assetClass: "crypto" },
		});
		expect(plan.warnings.some((w: string) => w.includes("underlying stock market"))).toBe(false);
	});

	test("below-minimum size is flagged", () => {
		const plan = planBasis({
			notionalUsd: 50,
			perpLeverage: 2,
			funding: { long: 0, short: 0.001 },
			costs: noCosts,
			market,
		});
		expect(plan.warnings.some((w: string) => w.includes("minimum position"))).toBe(true);
	});

	test("leverage above the market cap is flagged", () => {
		const plan = planBasis({
			notionalUsd: 1000,
			perpLeverage: 20,
			funding: { long: 0, short: 0.001 },
			costs: noCosts,
			market,
		});
		expect(plan.warnings.some((w: string) => w.includes("caps leverage"))).toBe(true);
	});
});

describe("the spot-perp spread", () => {
	test("a perp rich to spot reads positive", () => {
		expect(spotPerpBasisPercent(100, 101)).toBeCloseTo(1, 6);
	});

	test("a perp cheap to spot reads negative", () => {
		expect(spotPerpBasisPercent(100, 99)).toBeCloseTo(-1, 6);
	});

	/**
	 * Null rather than zero is the load-bearing case. Zero reads as "fairly
	 * priced, safe to enter"; the truth is that nobody is quoting one of the
	 * legs, which is the opposite of safe.
	 */
	test("an unpriced leg is unknown, not flat", () => {
		expect(spotPerpBasisPercent(null, 101)).toBeNull();
		expect(spotPerpBasisPercent(100, null)).toBeNull();
		expect(spotPerpBasisPercent(0, 101)).toBeNull();
	});
});

describe("board economics", () => {
	test("rows are priced by the same arithmetic as the trade ticket", () => {
		const economics = computeBasisEconomics({
			funding: { long: -0.001, short: 0.001 },
			market,
			spotPriceUsd: 100,
			perpMarkPrice: 101,
			spotBuyImpactPercent: -0.2,
		});

		const plan = planBasis({
			notionalUsd: economics.referenceNotionalUsd,
			perpLeverage: economics.referenceLeverage,
			funding: { long: -0.001, short: 0.001 },
			costs: defaultCosts({ spotBuyImpactPercent: -0.2, spotSellImpactPercent: -0.2 }),
			market,
		});

		expect(economics.netApyPercent).toBeCloseTo(plan.netApyPercent, 10);
		expect(economics.fundingAprPercent).toBeCloseTo(plan.fundingAprPercent, 10);
		expect(economics.basisPercent).toBeCloseTo(1, 6);
	});

	test("breakeven is reported in days, from the same hours", () => {
		const economics = computeBasisEconomics({
			funding: { long: -0.001, short: 0.001 },
			market,
			spotPriceUsd: 100,
			perpMarkPrice: 100,
			spotBuyImpactPercent: 0,
		});

		// 0.4% of notional recovered at 0.001%/hour is 400 hours.
		expect(economics.breakevenDays).toBeCloseTo(400 / 24, 6);
	});

	test("negative funding leaves no breakeven at all", () => {
		const economics = computeBasisEconomics({
			funding: { long: 0.001, short: -0.001 },
			market,
			spotPriceUsd: 100,
			perpMarkPrice: 100,
			spotBuyImpactPercent: 0,
		});
		expect(economics.breakevenDays).toBeNull();
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
