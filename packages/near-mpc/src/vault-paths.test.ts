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
		expect(agentDerivationPath("NVDA", "conservative", "base")).not.toBe(
			agentDerivationPath("NVDA", "leveraged", "base"),
		);
	});

	it("normalises the market id", () => {
		expect(agentDerivationPath("NVDA", "leveraged", "base")).toBe("lemon-vault-v1/leveraged/nvda");
	});

	it("rejects a market id that would break the path shape", () => {
		expect(() => agentDerivationPath("NV/DA", "leveraged", "base")).toThrow();
		expect(() => agentDerivationPath("", "leveraged", "base")).toThrow();
	});

	/**
	 * The reason the chain segment exists. Same market, same tier, different
	 * chain: before this, all three of these were one path and therefore one key
	 * signing for three separate books.
	 */
	it("gives one market and tier a different agent on every chain", () => {
		const paths = ["base", "arbitrum", "xlayer"].map((chain) =>
			agentDerivationPath("NVDA", "conservative", chain),
		);
		expect(new Set(paths).size).toBe(3);
	});

	it("leaves Base's existing paths byte-for-byte unchanged", () => {
		// These wallets already hold positions. A new segment here is a migration,
		// not a rename.
		expect(agentDerivationPath("NVDA", "conservative", "base")).toBe(
			"lemon-vault-v1/conservative/nvda",
		);
		expect(agentDerivationPath("AAPL", "leveraged", "BASE")).toBe("lemon-vault-v1/leveraged/aapl");
	});

	it("segments every other chain", () => {
		expect(agentDerivationPath("NVDA", "conservative", "arbitrum")).toBe(
			"lemon-vault-v1/arbitrum/conservative/nvda",
		);
		expect(agentDerivationPath("NVDA", "conservative", "xlayer")).toBe(
			"lemon-vault-v1/xlayer/conservative/nvda",
		);
	});

	/**
	 * What makes the grandfather clause safe: a legacy path's second segment is
	 * always a tier, so no chain-segmented path can ever spell one.
	 */
	it("refuses a chain key that would collide with the legacy shape", () => {
		expect(() => agentDerivationPath("NVDA", "conservative", "leveraged")).toThrow();
		expect(() => agentDerivationPath("NVDA", "leveraged", "conservative")).toThrow();
	});

	it("rejects a chain key that would break the path shape", () => {
		expect(() => agentDerivationPath("NVDA", "leveraged", "arb/one")).toThrow();
		expect(() => agentDerivationPath("NVDA", "leveraged", "")).toThrow();
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
