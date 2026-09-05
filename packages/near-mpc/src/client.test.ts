import { describe, expect, test } from "bun:test";
import { base58 } from "@scure/base";
import { NearMpcClient, parseEd25519Signature } from "./client";
import { MPC_CONTRACT, MPC_ROOT_KEYS } from "./constants";
import { deriveEd25519PublicKey, deriveEvmAddress } from "./derivation";

const config = {
	accountId: "lemon-markets.near",
	// Never used: every test here stays off the network.
	privateKey:
		"ed25519:3D4YudUahN1nawWogh8pAKSj92sUNMdbZGY3jH3vAdaZ8CqYcYqJhz2LDMnAWpuJ3RJDrsBwDLTDBqUq3VLhtHGA",
};

describe("parseEd25519Signature", () => {
	const signature = new Uint8Array(64).fill(7);

	test("reads the documented { scheme, signature } envelope", () => {
		expect(parseEd25519Signature({ scheme: "Ed25519", signature: Array.from(signature) })).toEqual(
			signature,
		);
	});

	test("reads a bare byte array", () => {
		expect(parseEd25519Signature(Array.from(signature))).toEqual(signature);
	});

	test("reads a base58 string", () => {
		expect(parseEd25519Signature(base58.encode(signature))).toEqual(signature);
	});

	test("rejects a short signature rather than passing it on", () => {
		expect(() => parseEd25519Signature(Array.from(new Uint8Array(32)))).toThrow("64-byte");
	});

	test("reports an unrecognised reply with its shape intact", () => {
		expect(() => parseEd25519Signature({ error: "timeout" })).toThrow("timeout");
	});

	test("rejects a null reply", () => {
		expect(() => parseEd25519Signature(null)).toThrow("64-byte");
	});
});

describe("NearMpcClient", () => {
	const client = new NearMpcClient(config);

	test("targets the mainnet signer contract by default", () => {
		expect(client.contractId).toBe(MPC_CONTRACT);
	});

	test("derives both chains from one path, matching the standalone helpers", () => {
		const path = "lemon-v1/0x1234567890abcdef1234567890abcdef12345678";
		const derived = client.derive(path);

		expect(derived.solanaAddress).toBe(
			deriveEd25519PublicKey(MPC_ROOT_KEYS.ed25519, config.accountId, path),
		);
		expect(derived.evmAddress).toBe(
			deriveEvmAddress(MPC_ROOT_KEYS.secp256k1, config.accountId, path),
		);
		expect(derived.path).toBe(path);
	});

	test("refuses a payload larger than the contract accepts, without a round trip", async () => {
		await expect(client.signEd25519("p", new Uint8Array(2000))).rejects.toThrow(
			"the signer contract accepts at most",
		);
	});

	test("a custom contract id overrides the network default", () => {
		const custom = new NearMpcClient({ ...config, contractId: "custom.signer.near" });
		expect(custom.contractId).toBe("custom.signer.near");
	});
});
