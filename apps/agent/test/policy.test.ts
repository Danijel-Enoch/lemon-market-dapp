import { describe, expect, it } from "bun:test";
import {
	decide,
	deployableAmount,
	driftBps,
	permittedActions,
	perpMarginFor,
	splitDeployment,
	type VaultSnapshot,
} from "../src/policy";

const USDC = 1_000_000n;
const NOW = 1_800_000_000;

function snapshot(overrides: Partial<VaultSnapshot> = {}): VaultSnapshot {
	return {
		address: "0x0000000000000000000000000000000000000001",
		riskTier: "CONSERVATIVE",
		targetLeverageBps: 10_000,
		maxLeverageBps: 10_000,
		freeAssets: 10_000n * USDC,
		totalAssets: 10_000n * USDC,
		deployedAssets: 0n,
		maxDeployedBps: 9000,
		withdrawWindowRemaining: 500_000n * USDC,
		ripeRedeemAssets: 0n,
		pendingRedeemAssets: 0n,
		earliestDeadline: null,
		spotUnits: 0n,
		perpUnits: 0n,
		fundingShortPercentPerHour: 0.002,
		spotBuyable: true,
		spotSellable: true,
		...overrides,
	};
}

describe("deployableAmount", () => {
	it("respects the contract's deployment ceiling", () => {
		// 90% of 10,000 is 9,000.
		expect(deployableAmount(snapshot())).toBe(9_000n * USDC);
	});

	it("leaves money already owed to the queue alone", () => {
		const s = snapshot({ ripeRedeemAssets: 2_000n * USDC, pendingRedeemAssets: 1_000n * USDC });
		// 10,000 idle less 3,000 committed, still under the 9,000 ceiling.
		expect(deployableAmount(s)).toBe(7_000n * USDC);
	});

	it("respects the agent's remaining rate-limit allowance", () => {
		expect(deployableAmount(snapshot({ withdrawWindowRemaining: 500n * USDC }))).toBe(500n * USDC);
	});

	it("returns nothing once the ceiling is reached", () => {
		expect(deployableAmount(snapshot({ deployedAssets: 9_000n * USDC }))).toBe(0n);
	});
});

describe("driftBps", () => {
	/**
	 * Measured in units, so a neutral position reads neutral at any price. A
	 * dollar-denominated check would report drift on every tick from the two
	 * venues simply disagreeing.
	 */
	it("is zero when the legs match", () => {
		expect(driftBps(100n * 10n ** 18n, 100n * 10n ** 18n)).toBe(0);
	});

	it("is positive when under-hedged", () => {
		expect(driftBps(100n * 10n ** 18n, 99n * 10n ** 18n)).toBe(100);
	});

	it("is negative when over-hedged", () => {
		expect(driftBps(100n * 10n ** 18n, 101n * 10n ** 18n)).toBe(-100);
	});

	it("treats a hedge with no spot behind it as maximally wrong", () => {
		expect(driftBps(0n, 10n ** 18n)).toBe(10_000);
	});
});

describe("splitDeployment", () => {
	/**
	 * The legs need equal notional but do not consume equal capital once the
	 * perp is levered. Splitting evenly would leave the position over-hedged and
	 * capital idle.
	 */
	it("splits an unlevered deployment down the middle", () => {
		const { spotNotional, perpMargin } = splitDeployment(1_000n * USDC, 10_000);
		expect(spotNotional).toBe(500n * USDC);
		expect(perpMargin).toBe(500n * USDC);
	});

	it("gives the spot leg two thirds at 2x", () => {
		const { spotNotional, perpMargin } = splitDeployment(3_000n * USDC, 20_000);
		expect(spotNotional).toBe(2_000n * USDC);
		expect(perpMargin).toBe(1_000n * USDC);
	});

	it("gives the spot leg three quarters at 3x", () => {
		const { spotNotional, perpMargin } = splitDeployment(4_000n * USDC, 30_000);
		expect(spotNotional).toBe(3_000n * USDC);
		expect(perpMargin).toBe(1_000n * USDC);
	});

	/** The margin must actually hedge the spot notional it was sized against. */
	it("produces a margin that hedges exactly the spot leg", () => {
		for (const leverage of [10_000, 15_000, 20_000, 25_000, 30_000]) {
			const { spotNotional, perpMargin } = splitDeployment(10_000n * USDC, leverage);
			expect(perpMarginFor(spotNotional, leverage)).toBeLessThanOrEqual(perpMargin + 1n);
			expect(spotNotional + perpMargin).toBe(10_000n * USDC);
		}
	});
});

describe("permittedActions", () => {
	it("offers a deployment when capital is idle", () => {
		const options = permittedActions(snapshot(), NOW);
		expect(options.map((o) => o.kind)).toContain("DEPLOY");
		expect(options.find((o) => o.kind === "DEPLOY")?.amount).toBe(9_000n * USDC);
	});

	it("does not offer to deploy dust", () => {
		const s = snapshot({ freeAssets: 50n * USDC, totalAssets: 50n * USDC });
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("DEPLOY");
	});

	it("does not offer to deploy into a leg it cannot buy", () => {
		expect(
			permittedActions(snapshot({ spotBuyable: false }), NOW).map((o) => o.kind),
		).not.toContain("DEPLOY");
	});

	it("offers a rebalance once drift clears the threshold", () => {
		const s = snapshot({ spotUnits: 100n * 10n ** 18n, perpUnits: 98n * 10n ** 18n });
		expect(permittedActions(s, NOW).map((o) => o.kind)).toContain("REBALANCE");
	});

	it("ignores drift too small to be worth the fees", () => {
		const s = snapshot({ spotUnits: 10_000n * 10n ** 18n, perpUnits: 9_995n * 10n ** 18n });
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("REBALANCE");
	});

	it("always offers to do nothing", () => {
		expect(permittedActions(snapshot(), NOW).map((o) => o.kind)).toContain("HOLD");
	});

	// -- the queue ---------------------------------------------------------

	it("unwinds only the shortfall, not the whole redemption", () => {
		const s = snapshot({
			freeAssets: 1_000n * USDC,
			deployedAssets: 9_000n * USDC,
			ripeRedeemAssets: 3_000n * USDC,
		});
		const unwind = permittedActions(s, NOW).find((o) => o.kind === "UNWIND");
		// 2,000 short, plus the 0.5% buffer.
		expect(unwind?.amount).toBe(2_010n * USDC);
	});

	it("does not unwind when the vault can already pay", () => {
		const s = snapshot({ freeAssets: 5_000n * USDC, ripeRedeemAssets: 3_000n * USDC });
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("UNWIND");
	});

	it("never asks to unwind more than is deployed", () => {
		const s = snapshot({
			freeAssets: 0n,
			deployedAssets: 500n * USDC,
			ripeRedeemAssets: 5_000n * USDC,
		});
		expect(permittedActions(s, NOW).find((o) => o.kind === "UNWIND")?.amount).toBe(500n * USDC);
	});

	/**
	 * The deadline overrides deliberation entirely. A withdrawal promised in
	 * seven days is a promise, and a model that finds the funding rate
	 * interesting does not get to weigh in on it.
	 */
	it("forces the unwind and offers nothing else near the deadline", () => {
		const s = snapshot({
			freeAssets: 0n,
			deployedAssets: 9_000n * USDC,
			ripeRedeemAssets: 3_000n * USDC,
			earliestDeadline: NOW + 3600,
			spotUnits: 100n * 10n ** 18n,
			perpUnits: 90n * 10n ** 18n,
		});
		const options = permittedActions(s, NOW);
		expect(options).toHaveLength(1);
		expect(options[0].kind).toBe("UNWIND");
		expect(options[0].forced).toBe(true);
	});

	it("still deliberates when the deadline is comfortably away", () => {
		const s = snapshot({
			freeAssets: 0n,
			deployedAssets: 9_000n * USDC,
			ripeRedeemAssets: 3_000n * USDC,
			earliestDeadline: NOW + 5 * 86_400,
		});
		const options = permittedActions(s, NOW);
		expect(options.length).toBeGreaterThan(1);
		expect(options[0].forced).toBe(false);
	});
});

describe("decide", () => {
	it("takes the advisor's choice when it is permitted", async () => {
		const result = await decide(snapshot(), NOW, async () => ({
			kind: "HOLD",
			rationale: "Funding is flattening; waiting a tick.",
			fellBack: false,
		}));
		expect(result.kind).toBe("HOLD");
		expect(result.advised).toBe(true);
	});

	/**
	 * The guardrail that matters. A model naming something outside the option
	 * set is discarded rather than argued with.
	 */
	it("discards an advisory answer that is not permitted", async () => {
		// Drift makes REBALANCE available, so there is a real choice to make —
		// otherwise `decide` short-circuits on the single option and the advisor
		// is never consulted, which would not exercise the guardrail at all.
		const s = snapshot({
			spotBuyable: false,
			spotUnits: 100n * 10n ** 18n,
			perpUnits: 97n * 10n ** 18n,
		});
		const result = await decide(s, NOW, async () => ({
			kind: "DEPLOY",
			rationale: "Looks like a good entry.",
			fellBack: false,
		}));
		expect(result.kind).not.toBe("DEPLOY");
		expect(result.advised).toBe(false);
		expect(result.rationale).toContain("not among the permitted actions");
	});

	it("proceeds on policy alone when the advisor throws", async () => {
		const result = await decide(snapshot(), NOW, async () => {
			throw new Error("OpenRouter answered 503");
		});
		expect(result.kind).toBe("DEPLOY");
		expect(result.advised).toBe(false);
		expect(result.rationale).toContain("503");
	});

	it("proceeds on policy alone when no advisor is configured", async () => {
		const result = await decide(snapshot(), NOW, null);
		expect(result.kind).toBe("DEPLOY");
		expect(result.advised).toBe(false);
	});

	/** No point paying for a round trip to confirm a foregone conclusion. */
	it("does not consult the advisor on a forced action", async () => {
		let called = false;
		const s = snapshot({
			freeAssets: 0n,
			deployedAssets: 9_000n * USDC,
			ripeRedeemAssets: 3_000n * USDC,
			earliestDeadline: NOW + 3600,
		});
		const result = await decide(s, NOW, async () => {
			called = true;
			return { kind: "HOLD" as const, rationale: "wait", fellBack: false };
		});
		expect(called).toBe(false);
		expect(result.kind).toBe("UNWIND");
	});

	/**
	 * The property, stated once: whatever the advisor says, the amount is the
	 * policy's. A model cannot size a trade.
	 */
	it("never lets the advisor change an amount", async () => {
		const s = snapshot();
		const policyAmount = permittedActions(s, NOW).find((o) => o.kind === "DEPLOY")?.amount;
		const result = await decide(s, NOW, async () => ({
			kind: "DEPLOY",
			rationale: "Deploy everything, ignore the ceiling.",
			fellBack: false,
		}));
		expect(result.amount).toBe(policyAmount as bigint);
	});
});
