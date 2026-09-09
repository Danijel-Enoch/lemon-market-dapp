import { describe, expect, it } from "bun:test";
import { bucketFunding, DAY, type FundingRow } from "./funding";

/**
 * The chart is only as honest as this bucketing.
 *
 * Each case below is a way of drawing a wrong picture rather than of throwing:
 * a day that reads as earning a third of what it did, an outage that leaves no
 * gap, a total that disagrees with the bars it sits above. None of them would
 * look broken on screen, which is why they are tested here rather than left to
 * be noticed.
 */

/** A Thursday at midnight UTC, and the two days before it. */
const TODAY = 1_760_054_400 - (1_760_054_400 % DAY);
const YESTERDAY = TODAY - DAY;
const TWO_DAYS_AGO = TODAY - 2 * DAY;

function row(day: number, hour: number, amount: bigint): FundingRow {
	return { occurredAt: day + hour * 3600, pnlAssets: amount };
}

describe("bucketFunding", () => {
	it("adds a day's settlements up instead of keeping the last", () => {
		// Three markets paid in the same hour. Thinning to one — which is right
		// for the NAV series — would report a third of the day's income.
		const window = bucketFunding(
			[row(TODAY, 3, 100n), row(TODAY, 3, 250n), row(TODAY, 4, 50n)],
			TODAY,
			TODAY,
		);

		expect(window.points).toHaveLength(1);
		expect(window.points[0].amount).toBe(400n);
		expect(window.points[0].settlements).toBe(3);
	});

	it("emits every day in the window, including the ones that paid nothing", () => {
		// The gap is the point. A series built only from days with rows would put
		// the two paying days side by side and hide the outage between them.
		const window = bucketFunding(
			[row(TWO_DAYS_AGO, 1, 100n), row(TODAY, 1, 300n)],
			TWO_DAYS_AGO,
			TODAY,
		);

		expect(window.points.map((p) => [p.day, p.amount, p.settlements])).toEqual([
			[TWO_DAYS_AGO, 100n, 1],
			[YESTERDAY, 0n, 0],
			[TODAY, 300n, 1],
		]);
	});

	it("buckets on UTC midnight, so a late settlement stays in its own day", () => {
		const window = bucketFunding([row(YESTERDAY, 23, 100n), row(TODAY, 0, 200n)], YESTERDAY, TODAY);

		expect(window.points[0].amount).toBe(100n);
		expect(window.points[1].amount).toBe(200n);
	});

	it("keeps a running total that ends at the window total", () => {
		const window = bucketFunding(
			[row(TWO_DAYS_AGO, 1, 100n), row(YESTERDAY, 1, 200n), row(TODAY, 1, 300n)],
			TWO_DAYS_AGO,
			TODAY,
		);

		expect(window.points.map((p) => p.cumulative)).toEqual([100n, 300n, 600n]);
		expect(window.windowTotal).toBe(600n);
	});

	it("carries a day the vault paid rather than received", () => {
		// A negative period is ordinary, and the bar belongs below the axis. A
		// clamp here would quietly turn a loss into a flat day.
		const window = bucketFunding([row(TODAY, 1, 500n), row(TODAY, 2, -800n)], TODAY, TODAY);

		expect(window.points[0].amount).toBe(-300n);
		expect(window.today).toBe(-300n);
	});

	it("reports today separately, and only today", () => {
		const window = bucketFunding(
			[row(YESTERDAY, 1, 999n), row(TODAY, 1, 40n), row(TODAY, 2, 60n)],
			YESTERDAY,
			TODAY,
		);

		expect(window.today).toBe(100n);
		expect(window.todaySettlements).toBe(2);
	});

	it("says nothing settled today when nothing has", () => {
		// Distinguishable from a day that settled to zero: the caller shows a dash
		// for one and a figure for the other.
		const window = bucketFunding([row(YESTERDAY, 1, 500n)], YESTERDAY, TODAY);

		expect(window.today).toBe(0n);
		expect(window.todaySettlements).toBe(0);
	});

	it("counts only the settlements the points actually show", () => {
		// A row outside the window must not inflate a count the bars cannot
		// account for — the number under the chart has to describe the chart.
		const window = bucketFunding(
			[row(TWO_DAYS_AGO, 1, 100n), row(TODAY, 1, 300n)],
			YESTERDAY,
			TODAY,
		);

		expect(window.settlements).toBe(1);
		expect(window.windowTotal).toBe(300n);
	});

	it("returns a single empty day for a vault that has never been paid", () => {
		const window = bucketFunding([], TODAY, TODAY);

		expect(window.points).toEqual([{ day: TODAY, amount: 0n, settlements: 0, cumulative: 0n }]);
		expect(window.windowTotal).toBe(0n);
		expect(window.settlements).toBe(0);
	});
});
