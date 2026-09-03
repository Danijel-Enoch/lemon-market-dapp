import { describe, expect, test } from "bun:test";
import { decimalsFor, roundToLot } from "./usePacificaTrade";

/**
 * Order sizing arithmetic.
 *
 * Pacifica rejects a size that is not a multiple of the market's lot, so this
 * is the difference between an order that fills and one that bounces. It is
 * also where floating point does its worst work: dividing a USD notional by a
 * price rarely lands on a clean multiple of 0.001.
 */

describe("roundToLot", () => {
	test("rounds down onto the lot grid", () => {
		expect(roundToLot(0.12345, 0.001)).toBeCloseTo(0.123, 10);
		expect(roundToLot(1.9999, 1)).toBe(1);
	});

	/**
	 * Down, never nearest. Rounding up can exceed the balance the size was
	 * computed from, turning a valid order into a rejected one.
	 */
	test("never rounds up past what was asked for", () => {
		expect(roundToLot(0.999, 1)).toBe(0);
		expect(roundToLot(4.9, 5)).toBe(0);
	});

	test("leaves an exact multiple alone", () => {
		expect(roundToLot(0.5, 0.1)).toBeCloseTo(0.5, 10);
		expect(roundToLot(3, 1)).toBe(3);
	});

	test("a size below one lot is not tradable", () => {
		expect(roundToLot(0.0004, 0.001)).toBe(0);
	});

	test("passes the size through when no lot size is known", () => {
		// Better an order the venue judges than one this rounds to zero on a
		// missing field.
		expect(roundToLot(1.234, 0)).toBe(1.234);
	});
});

describe("decimalsFor", () => {
	test("matches the precision of the increment", () => {
		expect(decimalsFor(0.001)).toBe(3);
		expect(decimalsFor(0.1)).toBe(1);
		expect(decimalsFor(0.00001)).toBe(5);
	});

	test("whole-number increments need no decimals", () => {
		expect(decimalsFor(1)).toBe(0);
		expect(decimalsFor(10)).toBe(0);
	});

	test("is safe on a missing increment", () => {
		expect(decimalsFor(0)).toBe(0);
	});

	test("caps precision, so a tiny lot cannot produce an unformattable string", () => {
		expect(decimalsFor(1e-12)).toBe(8);
	});

	/** The pairing that matters: a rounded size must format without reintroducing dust. */
	test("formats a rounded size back to exactly the lot grid", () => {
		const lot = 0.001;
		const size = roundToLot(100 / 77555.7, lot);
		expect(size.toFixed(decimalsFor(lot))).toBe("0.001");
	});
});
