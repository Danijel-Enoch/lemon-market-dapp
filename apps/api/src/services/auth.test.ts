import { describe, expect, test } from "bun:test";
import { challengeMessage, normaliseAddress, toAccountSummary } from "./auth";

const address = "0xf0b3e14b1588246244215d8c0d500a07e7223976";
const issuedAt = new Date("2026-09-03T10:50:14.487Z");

describe("normaliseAddress", () => {
	test("lowercases, so checksum casing cannot fork one wallet into two accounts", () => {
		expect(normaliseAddress("0xF0B3E14B1588246244215D8C0D500A07E7223976")).toBe(address);
	});

	test("trims stray whitespace from pasted addresses", () => {
		expect(normaliseAddress("  0xF0B3e14B1588246244215D8c0d500A07e7223976 ")).toBe(address);
	});
});

describe("sign-in message", () => {
	const message = challengeMessage({ purpose: "sign-in", address, nonce: "abc123", issuedAt });

	test("says plainly that nothing is being spent", () => {
		expect(message).toContain("does not approve any transaction");
	});

	test("binds the wallet, the nonce and the time", () => {
		expect(message).toContain(`Wallet: ${address}`);
		expect(message).toContain("Nonce: abc123");
		expect(message).toContain("Issued at: 2026-09-03T10:50:14.487Z");
	});

	test("does not mention an agent key — that is a separate authorisation", () => {
		expect(message).not.toContain("Agent key");
	});
});

describe("activation message", () => {
	const message = challengeMessage({
		purpose: "pacifica",
		address,
		nonce: "def456",
		issuedAt,
		pacificaAccount: "9ffbUFTNbZiwfWhBRyCrPSkVpizMrfNBpiiJ6CBatisD",
		agentPublicKey: "5MukW7QPfW5wfCCWp8KJ1qHtiG6szPDGmASiqKESJ9jz",
	});

	/**
	 * The signature is only a real authorisation if the thing being authorised
	 * appears in what the user sees. A message that said "authorise an agent
	 * key" without naming one would verify against any key at all.
	 */
	test("names the exact agent key being authorised", () => {
		expect(message).toContain("Agent key: 5MukW7QPfW5wfCCWp8KJ1qHtiG6szPDGmASiqKESJ9jz");
	});

	test("names the account it will trade for", () => {
		expect(message).toContain("Pacifica account: 9ffbUFTNbZiwfWhBRyCrPSkVpizMrfNBpiiJ6CBatisD");
	});

	test("states the limit of what it grants", () => {
		expect(message).toContain("cannot withdraw");
	});

	test("differs from a sign-in message, so one cannot be replayed as the other", () => {
		const signIn = challengeMessage({ purpose: "sign-in", address, nonce: "def456", issuedAt });
		expect(message).not.toBe(signIn);
	});
});

describe("account summary", () => {
	const base = {
		id: "u1",
		address,
		derivationPath: `lemon-v1/${address}`,
		solanaAddress: "9ffbUFTNbZiwfWhBRyCrPSkVpizMrfNBpiiJ6CBatisD",
		derivedEvmAddress: "0xa7cf47ee6ec9c8547b27fa207ac796b3838e02d7",
		pacificaAgentPublicKey: null,
		pacificaAgentSecret: null,
		pacificaBoundAt: null,
		pacificaBuilderCode: null,
		pacificaBuilderMaxFeeRate: null,
		pacificaBuilderApprovedAt: null,
		createdAt: issuedAt,
		updatedAt: issuedAt,
	};

	/**
	 * The derived addresses are infrastructure. Showing them invites a user to
	 * send funds straight to one, which lands the money outside Pacifica with
	 * nothing in the app to explain where it went.
	 */
	test("never exposes the derived wallets", () => {
		const summary = JSON.stringify(toAccountSummary(base));
		expect(summary).not.toContain(base.derivedEvmAddress);
		expect(summary).not.toContain("derivationPath");
	});

	test("exposes the Pacifica account, which the user does need", () => {
		expect(toAccountSummary(base).pacificaAccount).toBe(base.solanaAddress);
	});

	test("trading is disabled until an agent key is both stored and bound", () => {
		expect(toAccountSummary(base).tradingEnabled).toBe(false);
		expect(toAccountSummary({ ...base, pacificaAgentPublicKey: "key" }).tradingEnabled).toBe(false);
		expect(toAccountSummary({ ...base, pacificaBoundAt: issuedAt }).tradingEnabled).toBe(false);
	});

	test("trading is enabled once both are present", () => {
		const summary = toAccountSummary({
			...base,
			pacificaAgentPublicKey: "key",
			pacificaAgentSecret: "sealed",
			pacificaBoundAt: issuedAt,
		});
		expect(summary.tradingEnabled).toBe(true);
		expect(summary.activatedAt).toBe(issuedAt.toISOString());
	});

	/** The agent secret is the one thing that must never cross the wire. */
	test("never exposes the agent secret", () => {
		const summary = JSON.stringify(
			toAccountSummary({ ...base, pacificaAgentSecret: "sealed-secret-material" }),
		);
		expect(summary).not.toContain("sealed-secret-material");
	});
});
