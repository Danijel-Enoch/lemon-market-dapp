import { describe, expect, test } from "bun:test";
import { NearMpcClient } from "./client";

/**
 * Read-only check against the real MPC contract.
 *
 * The pinned root keys in `constants.ts` are the one thing in this package that
 * cannot be verified offline, and getting them wrong sends funds to addresses
 * the network will never sign for. Opt-in because it needs network: run with
 * NEAR_LIVE=1.
 */
const live = process.env.NEAR_LIVE === "1";
const suite = live ? describe : describe.skip;

suite("near mpc live contract", () => {
	// Views do not authenticate, so any well-formed key gets through.
	const client = new NearMpcClient({
		accountId: process.env.NEAR_ACCOUNT_ID?.trim() || "lemon-markets.near",
		privateKey:
			"ed25519:3D4YudUahN1nawWogh8pAKSj92sUNMdbZGY3jH3vAdaZ8CqYcYqJhz2LDMnAWpuJ3RJDrsBwDLTDBqUq3VLhtHGA",
	});

	test("the pinned root keys still match v1.signer", async () => {
		await client.verifyRootKeys();
	}, 30_000);

	test("a derived pair is well formed on both chains", () => {
		const derived = client.derive("lemon-v1/0x1234567890abcdef1234567890abcdef12345678");
		expect(derived.solanaAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
		expect(derived.evmAddress).toMatch(/^0x[0-9a-f]{40}$/);
	});
});
