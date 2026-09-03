import { beforeEach, describe, expect, test } from "bun:test";
import {
	hashToken,
	isAuthConfigured,
	MissingAuthSecretError,
	randomToken,
	safeEquals,
	seal,
	unseal,
} from "./secrets";

const SECRET = "a-test-secret-long-enough-to-be-accepted-0123456789";

beforeEach(() => {
	process.env.AUTH_SECRET = SECRET;
});

describe("configuration", () => {
	test("a short secret is treated as unconfigured, not as a weak key", () => {
		process.env.AUTH_SECRET = "too-short";
		expect(isAuthConfigured()).toBe(false);
		expect(() => seal("x")).toThrow(MissingAuthSecretError);
	});

	test("an absent secret is unconfigured", () => {
		process.env.AUTH_SECRET = "";
		expect(isAuthConfigured()).toBe(false);
	});

	test("a long enough secret is configured", () => {
		expect(isAuthConfigured()).toBe(true);
	});
});

describe("sealing agent keys", () => {
	test("round-trips", () => {
		const secret = "an-agent-secret-key";
		expect(unseal(seal(secret))).toBe(secret);
	});

	test("the same plaintext seals differently every time", () => {
		// A fresh nonce per encryption: identical agent keys must not produce
		// identical ciphertext, or the database leaks which users share state.
		expect(seal("same")).not.toBe(seal("same"));
	});

	test("ciphertext does not contain the plaintext", () => {
		const sealed = seal("agent-secret-material");
		expect(sealed).not.toContain("agent-secret-material");
	});

	test("tampering is detected rather than decrypted into garbage", () => {
		const sealed = seal("agent-secret");
		const raw = Buffer.from(sealed, "base64");
		raw[raw.length - 1] ^= 0xff;
		expect(() => unseal(raw.toString("base64"))).toThrow();
	});

	test("a rotated secret cannot open old ciphertext", () => {
		const sealed = seal("agent-secret");
		process.env.AUTH_SECRET = "a-different-secret-also-long-enough-0123456789";
		expect(() => unseal(sealed)).toThrow();
	});

	test("a truncated value is rejected before decryption is attempted", () => {
		expect(() => unseal(Buffer.from("short").toString("base64"))).toThrow("too short");
	});
});

describe("session tokens", () => {
	test("are long and unpredictable", () => {
		const first = randomToken();
		const second = randomToken();
		expect(first).not.toBe(second);
		expect(first.length).toBeGreaterThanOrEqual(43);
	});

	test("hash deterministically, so a token can be looked up", () => {
		const token = randomToken();
		expect(hashToken(token)).toBe(hashToken(token));
	});

	test("the hash does not reveal the token", () => {
		const token = randomToken();
		expect(hashToken(token)).not.toContain(token);
		expect(hashToken(token).length).toBe(64);
	});

	test("different tokens hash differently", () => {
		expect(hashToken("a")).not.toBe(hashToken("b"));
	});
});

describe("safeEquals", () => {
	test("matches equal strings", () => {
		expect(safeEquals("abc", "abc")).toBe(true);
	});

	test("rejects different strings and different lengths without throwing", () => {
		expect(safeEquals("abc", "abd")).toBe(false);
		expect(safeEquals("abc", "abcd")).toBe(false);
		expect(safeEquals("", "a")).toBe(false);
	});
});
