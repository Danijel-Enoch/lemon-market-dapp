import { describe, expect, test } from "bun:test";
import {
	ACTION_POINTS,
	computePoints,
	pointsToNextTier,
	TIERS,
	tierFor,
	USD_PER_VOLUME_POINT,
	volumePoints,
} from "../src/points";

describe("volume points", () => {
	test("one point per configured USD of volume", () => {
		expect(volumePoints(USD_PER_VOLUME_POINT)).toBe(1);
		expect(volumePoints(USD_PER_VOLUME_POINT * 100)).toBe(100);
	});

	test("rounds down — partial volume never rounds up into a point", () => {
		expect(volumePoints(USD_PER_VOLUME_POINT - 0.01)).toBe(0);
		expect(volumePoints(USD_PER_VOLUME_POINT * 1.9)).toBe(1);
	});

	test("ignores nonsense input rather than producing NaN points", () => {
		// A NaN here would propagate into the leaderboard sort and scramble it.
		expect(volumePoints(Number.NaN)).toBe(0);
		expect(volumePoints(Number.POSITIVE_INFINITY)).toBe(0);
		expect(volumePoints(-500)).toBe(0);
	});
});

describe("total points", () => {
	test("sums both sources", () => {
		const result = computePoints({ spotVolumeUsd: 500, positionsOpened: 2 });

		expect(result.volumePoints).toBe(50);
		expect(result.positionPoints).toBe(2 * ACTION_POINTS.basis_opened);
		expect(result.total).toBe(result.volumePoints + result.positionPoints);
	});

	test("negative counts cannot subtract points", () => {
		// Guards against a bad DB read producing a negative and gaming the board.
		const result = computePoints({ spotVolumeUsd: 0, positionsOpened: -5 });
		expect(result.total).toBe(0);
	});

	test("a position is worth more than the same notional swapped outright", () => {
		// The only product on the platform should not be out-earned by a swap.
		const position = computePoints({ spotVolumeUsd: 0, positionsOpened: 1 });
		const swap = computePoints({ spotVolumeUsd: 100, positionsOpened: 0 });
		expect(position.total).toBeGreaterThan(swap.total);
	});
});

describe("tiers", () => {
	test("starts at the lowest tier", () => {
		expect(tierFor(0).name).toBe(TIERS[0].name);
	});

	test("resolves the highest tier the score reaches", () => {
		const top = TIERS[TIERS.length - 1];
		expect(tierFor(top.minPoints).name).toBe(top.name);
		expect(tierFor(top.minPoints * 10).name).toBe(top.name);
	});

	test("is monotonic — more points never means a lower tier", () => {
		let lastIndex = 0;
		for (let points = 0; points < 200_000; points += 977) {
			const index = TIERS.findIndex((tier) => tier.name === tierFor(points).name);
			expect(index).toBeGreaterThanOrEqual(lastIndex);
			lastIndex = index;
		}
	});

	test("reports the gap to the next tier, and null at the top", () => {
		const next = pointsToNextTier(0);
		expect(next?.next.minPoints).toBe(TIERS[1].minPoints);
		expect(next?.remaining).toBe(TIERS[1].minPoints);

		expect(pointsToNextTier(TIERS[TIERS.length - 1].minPoints)).toBeNull();
	});
});
