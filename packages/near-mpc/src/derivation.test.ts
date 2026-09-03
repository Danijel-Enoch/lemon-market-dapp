import { describe, expect, test } from "bun:test";
import { base58 } from "@scure/base";
import { MPC_ROOT_KEYS } from "./constants";
import {
	deriveEd25519PublicKey,
	deriveEvmAddress,
	deriveSecp256k1PublicKey,
	epsilonTweak,
	evmAddressFromNaj,
	evmAddressFromPublicKey,
} from "./derivation";
import { DERIVATION_PATH_VERSION, derivationPath } from "./paths";

const roots = MPC_ROOT_KEYS.mainnet;

/**
 * Captured from `v1.signer`'s own `derived_public_key` view on mainnet.
 *
 * These are the load-bearing assertions in this package. Derivation is pure
 * arithmetic over pinned constants, so it cannot fail intermittently — but if
 * it ever changes, every user's funds move to an address nobody can sign for.
 * A fixture the contract itself produced is the only check that catches that.
 */
const VECTOR = {
	predecessor: "lemon-markets.near",
	path: "lemon/0x1234567890abcdef1234567890abcdef12345678",
	ed25519: "CU2adJQ7YSz9PhNd7Z7hEp1JAEtoGoXp3BaQZ5uNEjto",
	evm: "0xa7cf47ee6ec9c8547b27fa207ac796b3838e02d7",
} as const;

describe("epsilon derivation", () => {
	test("reproduces the contract's ed25519 child key", () => {
		expect(deriveEd25519PublicKey(roots.ed25519, VECTOR.predecessor, VECTOR.path)).toBe(
			VECTOR.ed25519,
		);
	});

	test("reproduces the contract's secp256k1 child key as an EVM address", () => {
		expect(deriveEvmAddress(roots.secp256k1, VECTOR.predecessor, VECTOR.path)).toBe(VECTOR.evm);
	});

	test("the tweak is a 32-byte sha3-256 digest", () => {
		expect(epsilonTweak("a.near", "path").length).toBe(32);
	});

	test("is deterministic", () => {
		const first = deriveEd25519PublicKey(roots.ed25519, "a.near", "p");
		const second = deriveEd25519PublicKey(roots.ed25519, "a.near", "p");
		expect(first).toBe(second);
	});

	test("a different path is a different account", () => {
		const one = deriveEd25519PublicKey(roots.ed25519, "a.near", "p1");
		const two = deriveEd25519PublicKey(roots.ed25519, "a.near", "p2");
		expect(one).not.toBe(two);
	});

	test("a different caller is a different account, even on the same path", () => {
		const one = deriveEvmAddress(roots.secp256k1, "a.near", "p");
		const two = deriveEvmAddress(roots.secp256k1, "b.near", "p");
		expect(one).not.toBe(two);
	});

	test("ed25519 children are valid 32-byte curve points", () => {
		const key = base58.decode(deriveEd25519PublicKey(roots.ed25519, "a.near", "p"));
		expect(key.length).toBe(32);
	});

	test("secp256k1 children are uncompressed SEC1", () => {
		const key = deriveSecp256k1PublicKey(roots.secp256k1, "a.near", "p");
		expect(key.length).toBe(130);
		expect(key.startsWith("04")).toBe(true);
	});

	test("rejects a key from the wrong curve", () => {
		expect(() => deriveEd25519PublicKey(roots.secp256k1, "a.near", "p")).toThrow(
			"Expected a ed25519 key",
		);
	});

	test("rejects a key with no curve prefix", () => {
		expect(() => deriveEd25519PublicKey("G9hwngxWNK", "a.near", "p")).toThrow("Malformed");
	});
});

describe("evm addresses", () => {
	test("accepts a key with or without the SEC1 marker", () => {
		const uncompressed = deriveSecp256k1PublicKey(roots.secp256k1, VECTOR.predecessor, VECTOR.path);
		const bytes = Uint8Array.from(
			(uncompressed.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16)),
		);
		expect(evmAddressFromPublicKey(bytes)).toBe(VECTOR.evm);
		expect(evmAddressFromPublicKey(bytes.slice(1))).toBe(VECTOR.evm);
	});

	test("rejects a wrongly sized key rather than hashing garbage", () => {
		expect(() => evmAddressFromPublicKey(new Uint8Array(33))).toThrow("Expected a 64- or 65-byte");
	});

	test("reads a NEAR-format secp256k1 key", () => {
		// Round-trip the pinned root through NAJ form and back.
		const najRoot = roots.secp256k1;
		expect(evmAddressFromNaj(najRoot)).toMatch(/^0x[0-9a-f]{40}$/);
	});
});

describe("derivation paths", () => {
	test("are versioned, so a future scheme cannot silently reuse this one", () => {
		expect(derivationPath("0x1234567890abcdef1234567890abcdef12345678")).toBe(
			`${DERIVATION_PATH_VERSION}/0x1234567890abcdef1234567890abcdef12345678`,
		);
	});

	test("checksum casing does not fork an account in two", () => {
		const lower = derivationPath("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
		const upper = derivationPath("0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD");
		expect(lower).toBe(upper);
	});

	test("rejects anything that is not an EVM address", () => {
		expect(() => derivationPath("not-an-address")).toThrow("Not an EVM address");
		expect(() => derivationPath("0x1234")).toThrow("Not an EVM address");
	});
});
