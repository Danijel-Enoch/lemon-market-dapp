import { describe, expect, test } from "bun:test";
import {
	type BuilderConfig,
	builderCodeFor,
	MAX_BUILDER_FEE_RATE,
	needsBuilderApproval,
	parseBuilderConfig,
} from "./builder";

/**
 * Builder-code attribution.
 *
 * The stakes are asymmetric, and that asymmetry is the whole design. Failing to
 * attach a code costs a fee. Attaching one the user has not approved costs the
 * *order* — Pacifica rejects it rather than filling it unattributed. So every
 * branch has to fail towards "no code", and these tests exist to keep it that
 * way.
 */

const CODE = "lemon01";
const RATE = "0.001";
const configured: BuilderConfig = { code: CODE, maxFeeRate: RATE };

const issuedAt = new Date("2026-09-03T10:50:14.487Z");

const approvedUser = {
	id: "u1",
	address: "0xf0b3e14b1588246244215d8c0d500a07e7223976",
	derivationPath: "lemon-v1/0xf0b3e14b1588246244215d8c0d500a07e7223976",
	solanaAddress: "9ffbUFTNbZiwfWhBRyCrPSkVpizMrfNBpiiJ6CBatisD",
	derivedEvmAddress: "0xa7cf47ee6ec9c8547b27fa207ac796b3838e02d7",
	pacificaAgentPublicKey: "agent",
	pacificaAgentSecret: "sealed",
	pacificaBoundAt: issuedAt,
	pacificaBuilderCode: CODE,
	pacificaBuilderMaxFeeRate: RATE,
	pacificaBuilderApprovedAt: issuedAt,
	createdAt: issuedAt,
	updatedAt: issuedAt,
};

describe("attribution", () => {
	test("attaches the code for a user who approved it at this rate", () => {
		expect(builderCodeFor(approvedUser, configured)).toBe(CODE);
		expect(needsBuilderApproval(approvedUser, configured)).toBe(false);
	});

	test("attaches nothing when the user never approved", () => {
		const user = {
			...approvedUser,
			pacificaBuilderCode: null,
			pacificaBuilderMaxFeeRate: null,
			pacificaBuilderApprovedAt: null,
		};
		expect(builderCodeFor(user, configured)).toBeUndefined();
		expect(needsBuilderApproval(user, configured)).toBe(true);
	});

	test("attaches nothing when the user approved a different code", () => {
		const user = { ...approvedUser, pacificaBuilderCode: "other99" };
		expect(builderCodeFor(user, configured)).toBeUndefined();
		expect(needsBuilderApproval(user, configured)).toBe(true);
	});

	/**
	 * The case that turns a fee change into an outage if it goes unnoticed: the
	 * configured rate rose past the ceiling this user agreed to, so every
	 * attributed order of theirs would now be rejected.
	 */
	test("attaches nothing once the configured rate exceeds the approved ceiling", () => {
		const raised: BuilderConfig = { code: CODE, maxFeeRate: "0.002" };
		expect(builderCodeFor(approvedUser, raised)).toBeUndefined();
		expect(needsBuilderApproval(approvedUser, raised)).toBe(true);
	});

	test("still attaches when the configured rate is below the approved ceiling", () => {
		const lowered: BuilderConfig = { code: CODE, maxFeeRate: "0.0005" };
		expect(builderCodeFor(approvedUser, lowered)).toBe(CODE);
		expect(needsBuilderApproval(approvedUser, lowered)).toBe(false);
	});

	test("an equal rate and ceiling is approved — the bound is inclusive", () => {
		expect(builderCodeFor(approvedUser, { code: CODE, maxFeeRate: RATE })).toBe(CODE);
	});

	test("attaches nothing when the approval timestamp is missing despite matching fields", () => {
		const user = { ...approvedUser, pacificaBuilderApprovedAt: null };
		expect(builderCodeFor(user, configured)).toBeUndefined();
	});

	test("attaches nothing when no code is configured, and asks for nothing", () => {
		expect(builderCodeFor(approvedUser, null)).toBeUndefined();
		// Nothing to approve, so a user is never nagged about it.
		expect(needsBuilderApproval(approvedUser, null)).toBe(false);
	});
});

describe("configuration", () => {
	const silent = () => undefined;

	test("accepts a well-formed code and rate", () => {
		expect(parseBuilderConfig(CODE, RATE, silent)).toEqual(configured);
	});

	test("a code without a rate is unconfigured, not an unbounded fee", () => {
		expect(parseBuilderConfig(CODE, undefined, silent)).toBeNull();
	});

	test("a rate without a code attributes nothing, so it is unconfigured", () => {
		expect(parseBuilderConfig(undefined, RATE, silent)).toBeNull();
	});

	test("rejects a code outside Pacifica's 3-16 alphanumeric rule", () => {
		expect(parseBuilderConfig("no-dashes", RATE, silent)).toBeNull();
		expect(parseBuilderConfig("ab", RATE, silent)).toBeNull();
		expect(parseBuilderConfig("a".repeat(17), RATE, silent)).toBeNull();
	});

	test("accepts the boundary lengths", () => {
		expect(parseBuilderConfig("abc", RATE, silent)).not.toBeNull();
		expect(parseBuilderConfig("a".repeat(16), RATE, silent)).not.toBeNull();
	});

	/**
	 * `max_fee_rate` is a fraction, so "1" means 100%. A typo like that would
	 * otherwise be shown to every user as a fee to approve, and it would not look
	 * obviously wrong in a wallet dialog.
	 */
	test("rejects an implausible fee rate", () => {
		expect(parseBuilderConfig(CODE, "1", silent)).toBeNull();
		expect(parseBuilderConfig(CODE, String(MAX_BUILDER_FEE_RATE * 2), silent)).toBeNull();
	});

	test("accepts the ceiling itself", () => {
		expect(parseBuilderConfig(CODE, String(MAX_BUILDER_FEE_RATE), silent)).not.toBeNull();
	});

	test("rejects zero, negative and non-numeric rates", () => {
		expect(parseBuilderConfig(CODE, "0", silent)).toBeNull();
		expect(parseBuilderConfig(CODE, "-0.001", silent)).toBeNull();
		expect(parseBuilderConfig(CODE, "cheap", silent)).toBeNull();
	});

	test("explains itself when it disables attribution", () => {
		const warnings: string[] = [];
		parseBuilderConfig("bad code!", RATE, (message) => warnings.push(message));
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain("PACIFICA_BUILDER_CODE");
	});

	test("says nothing when simply unconfigured", () => {
		const warnings: string[] = [];
		parseBuilderConfig(undefined, undefined, (message) => warnings.push(message));
		expect(warnings).toEqual([]);
	});
});
