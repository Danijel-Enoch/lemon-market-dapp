import { describe, expect, it } from "bun:test";
import { formatSol, parseSol } from "./gas-withdraw";

/**
 * The lamport conversion, which is the part of a gas sweep worth testing.
 *
 * Everything else in this service is an RPC round trip or an MPC signature, but
 * this is arithmetic on an operator's typed string — and a decimal conversion
 * that is wrong by a factor of a thousand is wrong in a direction nobody
 * notices until the transfer lands.
 */
describe("parseSol", () => {
	it("reads whole and fractional SOL", () => {
		expect(parseSol("1")).toBe(1_000_000_000n);
		expect(parseSol("0.02")).toBe(20_000_000n);
		expect(parseSol("2.5")).toBe(2_500_000_000n);
		expect(parseSol("0")).toBe(0n);
	});

	it("pads a short fraction rather than truncating it", () => {
		// "0.1" is a tenth of a SOL, not a tenth of a lamport. Reading the digits
		// without padding to nine places is the factor-of-a-thousand bug.
		expect(parseSol("0.1")).toBe(100_000_000n);
		expect(parseSol("0.000000001")).toBe(1n);
	});

	it("refuses anything that is not a plain decimal", () => {
		for (const bad of ["", ".", "-1", "1e9", "1.0000000001", "abc", "1,5"]) {
			expect(() => parseSol(bad)).toThrow();
		}
	});
});

describe("formatSol", () => {
	it("round-trips through parseSol", () => {
		for (const amount of ["1", "0.02", "2.5", "0.000000001", "10"]) {
			expect(formatSol(parseSol(amount))).toBe(amount);
		}
	});

	it("trims the fraction without eating the integer's own zeros", () => {
		expect(formatSol(10_000_000_000n)).toBe("10");
		expect(formatSol(0n)).toBe("0");
		expect(formatSol(5_000n)).toBe("0.000005");
	});
});
