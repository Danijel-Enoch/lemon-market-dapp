import { describe, expect, test } from "bun:test";
import { roundToLot } from "./self-execution";

/**
 * Sizing a hedge to the venue's lot size.
 *
 * Tested because the direction of the rounding is load-bearing and invisible.
 * Rounding *up* on an open asks for a short slightly larger than the spot
 * backing it — a small permanent directional position, created silently, on
 * every open — and rounding up on a close is rejected outright by `reduceOnly`.
 * Neither failure announces itself, which is exactly why the rule deserves
 * assertions rather than a comment.
 */
describe("roundToLot", () => {
	test("rounds down to the lot, never up", () => {
		// 0.0257 at a 0.001 lot is 25 lots and a remainder that is dropped.
		expect(roundToLot(0.0257, "BTC", 0.001)).toBeCloseTo(0.025, 10);
	});

	test("an exact multiple is left alone", () => {
		expect(roundToLot(0.025, "BTC", 0.001)).toBeCloseTo(0.025, 10);
	});

	test("survives the float that would silently drop a lot", () => {
		// 0.3 / 0.1 is 2.9999999999999996 in binary floating point, so a naive
		// floor yields 2 lots and quietly under-hedges by a third.
		expect(roundToLot(0.3, "ETH", 0.1)).toBeCloseTo(0.3, 10);
		expect(roundToLot(0.7, "ETH", 0.1)).toBeCloseTo(0.7, 10);
		expect(roundToLot(1.1, "ETH", 0.1)).toBeCloseTo(1.1, 10);
	});

	test("a size below one lot rounds to nothing", () => {
		// Zero rather than a minimum. An order under the lot size is rejected by
		// the venue, and rounding it up to one lot would hedge more than exists.
		expect(roundToLot(0.0004, "BTC", 0.001)).toBe(0);
	});

	test("a missing lot size passes the size through rather than zeroing it", () => {
		// A market whose lot size could not be read must not silently round every
		// hedge to zero, which would leave every position unhedged.
		expect(roundToLot(1.234, "BTC", 0)).toBe(1.234);
	});

	test("nothing to size is nothing", () => {
		expect(roundToLot(0, "BTC", 0.001)).toBe(0);
		expect(roundToLot(-1, "BTC", 0.001)).toBe(0);
		expect(roundToLot(Number.NaN, "BTC", 0.001)).toBe(0);
	});
});
