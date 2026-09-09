import { describe, expect, test } from "bun:test";
import {
	crossedFundingSettlement,
	FUNDING_INTERVAL_SECONDS,
	fundingPeriodStart,
	lastPerFundingPeriod,
	nextFundingSettlement,
} from "../src/funding";

/** 2027-01-15T12:00:00Z — exactly on an hourly boundary. */
const NOON = 1_800_007_200;

describe("funding periods", () => {
	test("Pacifica settles hourly", () => {
		expect(FUNDING_INTERVAL_SECONDS).toBe(3600);
	});

	test("a period starts at the top of the UTC hour", () => {
		expect(new Date(NOON * 1000).toISOString()).toEndWith(":00:00.000Z");
		expect(fundingPeriodStart(NOON)).toBe(NOON);
		expect(fundingPeriodStart(NOON + 1)).toBe(NOON);
		expect(fundingPeriodStart(NOON + 3599)).toBe(NOON);
		expect(fundingPeriodStart(NOON + 3600)).toBe(NOON + 3600);
	});

	/**
	 * Aligned to the epoch rather than to the caller's clock. An interval
	 * measured from "now" drifts every restart and would put one settlement in
	 * two different buckets either side of one.
	 */
	test("alignment does not depend on when it is asked", () => {
		expect(fundingPeriodStart(NOON + 900)).toBe(fundingPeriodStart(NOON + 2700));
	});

	test("the next settlement is the end of the current period", () => {
		expect(nextFundingSettlement(NOON)).toBe(NOON + 3600);
		expect(nextFundingSettlement(NOON + 3599)).toBe(NOON + 3600);
	});

	test("an eight-hour venue is a parameter, not a rewrite", () => {
		const eightHours = 8 * 3600;
		expect(fundingPeriodStart(NOON + 3600, eightHours)).toBe(fundingPeriodStart(NOON, eightHours));
		expect(nextFundingSettlement(NOON, eightHours)).toBe(
			fundingPeriodStart(NOON, eightHours) + eightHours,
		);
	});

	test("nonsense inputs do not produce a boundary", () => {
		expect(fundingPeriodStart(Number.NaN)).toBe(0);
		expect(fundingPeriodStart(NOON, 0)).toBe(0);
		expect(fundingPeriodStart(NOON, -60)).toBe(0);
	});
});

describe("crossing a settlement", () => {
	/**
	 * The distinction elapsed time cannot make: an hour apart can sit either
	 * side of a settlement, or wholly inside two adjacent periods.
	 */
	test("an hour apart may or may not have crossed one", () => {
		expect(crossedFundingSettlement(NOON - 60, NOON + 3540)).toBe(true);
		expect(crossedFundingSettlement(NOON + 1, NOON + 3599)).toBe(false);
	});

	test("a second apart across the boundary has crossed one", () => {
		expect(crossedFundingSettlement(NOON + 3599, NOON + 3600)).toBe(true);
	});

	test("the boundary itself belongs to the period it opens", () => {
		expect(crossedFundingSettlement(NOON, NOON + 3599)).toBe(false);
		expect(crossedFundingSettlement(NOON, NOON)).toBe(false);
	});
});

describe("thinning a series to one point per period", () => {
	const point = (timestamp: number, price: number) => ({ timestamp, price });
	const at = (p: { timestamp: number }) => p.timestamp;

	/** The point closest to the settlement carries the most of that period's funding. */
	test("keeps the last observation in each period", () => {
		const thinned = lastPerFundingPeriod(
			[
				point(NOON, 1),
				point(NOON + 900, 2),
				point(NOON + 1800, 3),
				point(NOON + 3600, 4),
				point(NOON + 4500, 5),
			],
			at,
		);

		expect(thinned.map((p) => p.price)).toEqual([3, 5]);
	});

	test("a series already on the venue's cadence is left alone", () => {
		const hourly = [point(NOON + 5, 1), point(NOON + 3605, 2), point(NOON + 7205, 3)];
		expect(lastPerFundingPeriod(hourly, at)).toEqual(hourly);
	});

	test("the result is ascending however it arrived", () => {
		const thinned = lastPerFundingPeriod([point(NOON + 7200, 3), point(NOON, 1)], at);
		expect(thinned.map((p) => p.timestamp)).toEqual([NOON, NOON + 7200]);
	});

	test("an unusable timestamp is dropped rather than bucketed at zero", () => {
		const thinned = lastPerFundingPeriod([point(Number.NaN, 9), point(NOON, 1)], at);
		expect(thinned.map((p) => p.price)).toEqual([1]);
	});

	test("nothing in, nothing out", () => {
		expect(lastPerFundingPeriod([], at)).toEqual([]);
	});
});
