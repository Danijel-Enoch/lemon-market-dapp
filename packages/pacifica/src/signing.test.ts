import { describe, expect, test } from "bun:test";
import { base58 } from "@scure/base";
import {
	buildSignedRequest,
	canonicalMessage,
	generateKeypair,
	keypairFromSecret,
	localSigner,
	signMessage,
	sortJsonKeys,
	verifyMessage,
} from "./signing";

describe("sortJsonKeys", () => {
	test("sorts every level, not just the top", () => {
		const sorted = sortJsonKeys({ b: 1, a: { z: 1, y: { q: 1, p: 2 } } });
		expect(JSON.stringify(sorted)).toBe('{"a":{"y":{"p":2,"q":1},"z":1},"b":1}');
	});

	test("preserves array order while sorting the objects inside", () => {
		const sorted = sortJsonKeys([
			{ b: 1, a: 2 },
			{ d: 3, c: 4 },
		]);
		expect(JSON.stringify(sorted)).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
	});

	test("leaves primitives and null alone", () => {
		expect(sortJsonKeys(null)).toBe(null);
		expect(sortJsonKeys(false)).toBe(false);
		expect(sortJsonKeys("x")).toBe("x");
		expect(sortJsonKeys(7)).toBe(7);
	});
});

describe("canonicalMessage", () => {
	/**
	 * The exact string printed in Pacifica's signing guide. If our encoder ever
	 * drifts from this byte-for-byte, every signature we produce is rejected —
	 * so it is pinned as a literal rather than rebuilt from the same helpers.
	 */
	test("reproduces the documented example byte for byte", () => {
		const message = canonicalMessage(
			{ timestamp: 1748970123456, expiry_window: 5000, type: "create_order" },
			{
				symbol: "BTC",
				price: "100000",
				amount: "0.1",
				side: "bid",
				tif: "GTC",
				reduce_only: false,
				client_order_id: "12345678-1234-1234-1234-123456789abc",
			},
		);

		expect(message).toBe(
			'{"data":{"amount":"0.1","client_order_id":"12345678-1234-1234-1234-123456789abc","price":"100000","reduce_only":false,"side":"bid","symbol":"BTC","tif":"GTC"},"expiry_window":5000,"timestamp":1748970123456,"type":"create_order"}',
		);
	});

	test("is stable under input key order", () => {
		const header = { timestamp: 1, expiry_window: 5000, type: "create_order" } as const;
		const a = canonicalMessage(header, { symbol: "BTC", amount: "1", side: "bid" });
		const b = canonicalMessage(header, { side: "bid", amount: "1", symbol: "BTC" });
		expect(a).toBe(b);
	});

	test("emits no whitespace", () => {
		const message = canonicalMessage(
			{ timestamp: 1, expiry_window: 2, type: "cancel_order" },
			{ symbol: "BTC", order_id: 5 },
		);
		expect(message).not.toContain(" ");
	});
});

describe("keys", () => {
	test("derives the same public key from a 32-byte seed and a 64-byte secret", () => {
		const generated = generateKeypair();
		const full = new Uint8Array(64);
		full.set(generated.secretKey, 0);
		full.set(base58.decode(generated.publicKey), 32);

		expect(keypairFromSecret(generated.secretKey).publicKey).toBe(generated.publicKey);
		expect(keypairFromSecret(full).publicKey).toBe(generated.publicKey);
		expect(keypairFromSecret(base58.encode(full)).publicKey).toBe(generated.publicKey);
	});

	test("public keys are base58 and 32 bytes, as Solana addresses are", () => {
		const { publicKey } = generateKeypair();
		expect(base58.decode(publicKey).length).toBe(32);
	});

	test("rejects a wrongly sized secret", () => {
		expect(() => keypairFromSecret(new Uint8Array(31))).toThrow(/32- or 64-byte/);
	});
});

describe("signing", () => {
	test("round-trips sign and verify", () => {
		const keypair = generateKeypair();
		const message = canonicalMessage(
			{ timestamp: 1748970123456, expiry_window: 5000, type: "create_order" },
			{ symbol: "BTC", amount: "0.1", side: "bid" },
		);

		const signature = signMessage(message, keypair.secretKey);
		expect(verifyMessage(message, signature, keypair.publicKey)).toBe(true);
	});

	test("a signature does not carry over to a different message", () => {
		const keypair = generateKeypair();
		const signature = signMessage("one", keypair.secretKey);
		expect(verifyMessage("two", signature, keypair.publicKey)).toBe(false);
	});

	test("a signature does not verify under a different key", () => {
		const signer = generateKeypair();
		const other = generateKeypair();
		const signature = signMessage("one", signer.secretKey);
		expect(verifyMessage("one", signature, other.publicKey)).toBe(false);
	});

	test("verify reports false rather than throwing on malformed input", () => {
		expect(verifyMessage("one", "not-base58!!", generateKeypair().publicKey)).toBe(false);
	});

	test("signatures are base58 and 64 bytes", () => {
		const keypair = generateKeypair();
		expect(base58.decode(signMessage("m", keypair.secretKey)).length).toBe(64);
	});
});

describe("buildSignedRequest", () => {
	const keypair = generateKeypair();

	test("flattens the payload but signs it nested under data", async () => {
		const request = await buildSignedRequest(localSigner(keypair.secretKey), {
			account: keypair.publicKey,
			type: "create_order",
			data: { symbol: "BTC", amount: "0.1", side: "bid" },
			timestamp: 1748970123456,
			expiryWindow: 5000,
		});

		// Flat on the wire...
		expect(request.symbol).toBe("BTC");
		expect(request.data).toBeUndefined();

		// ...but the signature covers the nested form.
		const signed = canonicalMessage(
			{ timestamp: 1748970123456, expiry_window: 5000, type: "create_order" },
			{ symbol: "BTC", amount: "0.1", side: "bid" },
		);
		expect(verifyMessage(signed, request.signature, keypair.publicKey)).toBe(true);
	});

	test("defaults agent_wallet to null and the expiry window to 30s", async () => {
		const request = await buildSignedRequest(localSigner(keypair.secretKey), {
			account: keypair.publicKey,
			type: "cancel_order",
			data: { symbol: "BTC", order_id: 1 },
		});
		expect(request.agent_wallet).toBe(null);
		expect(request.expiry_window).toBe(30_000);
	});

	test("an agent key signs while the account stays the main wallet", async () => {
		const account = generateKeypair();
		const agent = generateKeypair();

		const request = await buildSignedRequest(localSigner(agent.secretKey), {
			account: account.publicKey,
			agentWallet: agent.publicKey,
			type: "create_order",
			data: { symbol: "SOL", amount: "1", side: "ask" },
			timestamp: 1,
		});

		expect(request.account).toBe(account.publicKey);
		expect(request.agent_wallet).toBe(agent.publicKey);

		const signed = canonicalMessage(
			{ timestamp: 1, expiry_window: 30_000, type: "create_order" },
			{ symbol: "SOL", amount: "1", side: "ask" },
		);
		// Verifies under the agent key, not the account key.
		expect(verifyMessage(signed, request.signature, agent.publicKey)).toBe(true);
		expect(verifyMessage(signed, request.signature, account.publicKey)).toBe(false);
	});

	test("accepts an async signer, as the MPC path requires", async () => {
		const remote = async (message: string) => signMessage(message, keypair.secretKey);
		const request = await buildSignedRequest(remote, {
			account: keypair.publicKey,
			type: "withdraw",
			data: { amount: "10" },
			timestamp: 1,
		});
		expect(typeof request.signature).toBe("string");
	});
});
