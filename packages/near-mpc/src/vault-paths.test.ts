import { describe, expect, it } from "bun:test";
import { parseEcdsaSignature } from "./client";
import { agentDerivationPath, derivationPath, vaultAgentDerivationPath } from "./paths";

describe("vault agent derivation paths", () => {
	it("derives a stable path from a vault address", () => {
		expect(vaultAgentDerivationPath("0xAbC0000000000000000000000000000000000123")).toBe(
			"lemon-vault-v1/0xabc0000000000000000000000000000000000123",
		);
	});

	it("treats checksum casing as the same vault", () => {
		const upper = vaultAgentDerivationPath("0xABC0000000000000000000000000000000000123");
		const lower = vaultAgentDerivationPath("0xabc0000000000000000000000000000000000123");
		expect(upper).toBe(lower);
	});

	it("rejects anything that is not an address", () => {
		expect(() => vaultAgentDerivationPath("NVDA")).toThrow();
		expect(() => vaultAgentDerivationPath("0x123")).toThrow();
	});

	/**
	 * The whole point of the separate prefix: a vault address and a user wallet
	 * address are the same shape, and a shared namespace would let one derive the
	 * other's keys.
	 */
	it("cannot collide with a user's path", () => {
		const address = "0xabc0000000000000000000000000000000000123";
		expect(vaultAgentDerivationPath(address)).not.toBe(derivationPath(address));
	});

	it("gives the two tiers of one market different agents", () => {
		expect(agentDerivationPath("NVDA", "conservative")).not.toBe(
			agentDerivationPath("NVDA", "leveraged"),
		);
	});

	it("normalises the market id", () => {
		expect(agentDerivationPath("NVDA", "leveraged")).toBe("lemon-vault-v1/leveraged/nvda");
	});

	it("rejects a market id that would break the path shape", () => {
		expect(() => agentDerivationPath("NV/DA", "leveraged")).toThrow();
		expect(() => agentDerivationPath("", "leveraged")).toThrow();
	});
});

describe("parseEcdsaSignature", () => {
	const bigR = `03${"11".repeat(32)}`;
	const s = "22".repeat(32);

	it("drops the compressed-point parity byte from r", () => {
		const sig = parseEcdsaSignature({
			big_r: { affine_point: bigR },
			s: { scalar: s },
			recovery_id: 0,
		});
		expect(sig.r).toBe(`0x${"11".repeat(32)}`);
		expect(sig.s).toBe(`0x${s}`);
	});

	/**
	 * 27/28, not 0/1. The raw recovery bit recovers the wrong address about half
	 * the time, which presents as an authorisation failure rather than an
	 * encoding one and is correspondingly hard to find.
	 */
	it("returns v in the Ethereum 27/28 form", () => {
		expect(parseEcdsaSignature({ big_r: bigR, s, recovery_id: 0 }).v).toBe(27);
		expect(parseEcdsaSignature({ big_r: bigR, s, recovery_id: 1 }).v).toBe(28);
	});

	it("keeps yParity alongside, for typed transactions", () => {
		expect(parseEcdsaSignature({ big_r: bigR, s, recovery_id: 1 }).yParity).toBe(1);
	});

	it("accepts a scheme-wrapped response", () => {
		const sig = parseEcdsaSignature({ Secp256k1: { big_r: bigR, s, recovery_id: 1 } });
		expect(sig.v).toBe(28);
	});

	it("refuses an unrecognised shape rather than guessing", () => {
		expect(() => parseEcdsaSignature({ signature: "nope" })).toThrow();
		expect(() => parseEcdsaSignature({ big_r: bigR, s, recovery_id: 4 })).toThrow();
	});
});
