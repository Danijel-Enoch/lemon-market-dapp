import { describe, expect, it } from "bun:test";
import { adlRisk } from "@lemon/core";
import {
	decide,
	deployableAmount,
	deploymentFor,
	driftBps,
	isFlat,
	type MarketSnapshot,
	MIN_DEPLOY_USDC,
	permittedActions,
	perpMarginFor,
	splitDeployment,
	type VaultSnapshot,
} from "../src/policy";

const USDC = 1_000_000n;
const NOW = 1_800_000_000;

/** Flat: entry equals mark, so the short is neither winning nor in the queue. */
const CALM_ADL = adlRisk({
	side: "short",
	entryPrice: 100,
	markPrice: 100,
	size: 10,
	equityUsd: 1000,
});

function market(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
	return {
		ticker: "NVDA",
		symbol: "NVDAc",
		targetWeightBps: 10_000,
		spotValueUsdc: 0n,
		spotUnits: 0n,
		perpUnits: 0n,
		fundingShortPercentPerHour: 0.002,
		spotBuyable: true,
		spotSellable: true,
		adl: CALM_ADL,
		...overrides,
	};
}

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
		markets: [market()],
		closeRequested: false,
		adl: CALM_ADL,
		...overrides,
	};
}

/** A snapshot whose single market carries the given per-market overrides. */
function withMarket(
	marketOverrides: Partial<MarketSnapshot>,
	vaultOverrides: Partial<VaultSnapshot> = {},
): VaultSnapshot {
	return snapshot({ markets: [market(marketOverrides)], ...vaultOverrides });
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

	/**
	 * The venue checks the *spot leg* against the same minimum, and only after
	 * the margin has bridged to Solana. A gate measured on the total would wave
	 * through a deployment the adapter then rejects with the margin already on
	 * the wrong chain — enforcing, at the cost of a stranded bridge, a limit this
	 * layer can enforce for nothing.
	 */
	it("measures the deploy minimum on the spot leg, not the whole deployment", () => {
		// $180 is deployable out of $200, which buys a $90 spot leg at 1x and $120 at 2x.
		const idle = { freeAssets: 200n * USDC, totalAssets: 200n * USDC };
		expect(permittedActions(snapshot(idle), NOW).map((o) => o.kind)).not.toContain("DEPLOY");
		expect(
			permittedActions(snapshot({ ...idle, targetLeverageBps: 20_000 }), NOW).map((o) => o.kind),
		).toContain("DEPLOY");
	});

	it("never offers a deployment the venue would reject", () => {
		for (const targetLeverageBps of [10_000, 15_000, 20_000, 25_000, 30_000]) {
			for (const size of [100n, 150n, 200n, 250n, 400n, 1_000n]) {
				const s = snapshot({
					targetLeverageBps,
					freeAssets: size * USDC,
					totalAssets: size * USDC,
				});
				const deploy = permittedActions(s, NOW).find((o) => o.kind === "DEPLOY");
				if (!deploy) continue;
				const { spotNotional } = splitDeployment(deploy.amount, targetLeverageBps);
				expect(spotNotional).toBeGreaterThanOrEqual(MIN_DEPLOY_USDC);
			}
		}
	});

	it("does not offer to deploy into a leg it cannot buy", () => {
		expect(
			permittedActions(withMarket({ spotBuyable: false }), NOW).map((o) => o.kind),
		).not.toContain("DEPLOY");
	});

	it("offers a rebalance once drift clears the threshold", () => {
		const s = withMarket({ spotUnits: 100n * 10n ** 18n, perpUnits: 98n * 10n ** 18n });
		expect(permittedActions(s, NOW).map((o) => o.kind)).toContain("REBALANCE");
	});

	it("ignores drift too small to be worth the fees", () => {
		const s = withMarket({ spotUnits: 10_000n * 10n ** 18n, perpUnits: 9_995n * 10n ** 18n });
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("REBALANCE");
	});

	it("always offers to do nothing", () => {
		expect(permittedActions(snapshot(), NOW).map((o) => o.kind)).toContain("HOLD");
	});

	// -- the queue ---------------------------------------------------------

	it("unwinds only the shortfall, not the whole redemption", () => {
		const s = withMarket(
			{ spotValueUsdc: 9_000n * USDC },
			{
				freeAssets: 1_000n * USDC,
				deployedAssets: 9_000n * USDC,
				ripeRedeemAssets: 3_000n * USDC,
			},
		);
		const unwind = permittedActions(s, NOW).find((o) => o.kind === "UNWIND");
		// 2,000 short, plus the 0.5% buffer.
		expect(unwind?.amount).toBe(2_010n * USDC);
	});

	it("does not unwind when the vault can already pay", () => {
		const s = snapshot({ freeAssets: 5_000n * USDC, ripeRedeemAssets: 3_000n * USDC });
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("UNWIND");
	});

	it("never asks to unwind more than is deployed", () => {
		const s = withMarket(
			{ spotValueUsdc: 500n * USDC },
			{ freeAssets: 0n, deployedAssets: 500n * USDC, ripeRedeemAssets: 5_000n * USDC },
		);
		expect(permittedActions(s, NOW).find((o) => o.kind === "UNWIND")?.amount).toBe(500n * USDC);
	});

	/**
	 * A market whose pool has dried up holds value the NAV still counts and an
	 * unwind cannot reach. Sizing against `deployedAssets` would ask the venue
	 * adapter to raise more than every routable leg put together contains, and
	 * the shortfall would surface as a failed unwind rather than a small one.
	 */
	it("never asks for more than the sellable legs are worth", () => {
		const s = snapshot({
			freeAssets: 0n,
			deployedAssets: 9_000n * USDC,
			ripeRedeemAssets: 5_000n * USDC,
			markets: [
				market({ ticker: "BTC", spotValueUsdc: 2_000n * USDC, targetWeightBps: 5_000 }),
				market({
					ticker: "NVDA",
					spotValueUsdc: 7_000n * USDC,
					targetWeightBps: 5_000,
					spotSellable: false,
				}),
			],
		});
		expect(permittedActions(s, NOW).find((o) => o.kind === "UNWIND")?.amount).toBe(2_000n * USDC);
	});

	/**
	 * The deadline overrides deliberation entirely. A withdrawal promised in
	 * seven days is a promise, and a model that finds the funding rate
	 * interesting does not get to weigh in on it.
	 */
	it("forces the unwind and offers nothing else near the deadline", () => {
		const s = withMarket(
			{ spotValueUsdc: 9_000n * USDC, spotUnits: 100n * 10n ** 18n, perpUnits: 90n * 10n ** 18n },
			{
				freeAssets: 0n,
				deployedAssets: 9_000n * USDC,
				ripeRedeemAssets: 3_000n * USDC,
				earliestDeadline: NOW + 3600,
			},
		);
		const options = permittedActions(s, NOW);
		expect(options).toHaveLength(1);
		expect(options[0].kind).toBe("UNWIND");
		expect(options[0].forced).toBe(true);
	});

	it("still deliberates when the deadline is comfortably away", () => {
		const s = withMarket(
			{ spotValueUsdc: 9_000n * USDC },
			{
				freeAssets: 0n,
				deployedAssets: 9_000n * USDC,
				ripeRedeemAssets: 3_000n * USDC,
				earliestDeadline: NOW + 5 * 86_400,
			},
		);
		const options = permittedActions(s, NOW);
		expect(options.length).toBeGreaterThan(1);
		expect(options[0].forced).toBe(false);
	});
});

describe("deploymentFor", () => {
	/** The inverse of `splitDeployment`, which is what sizes a weighted deploy. */
	it("round-trips through splitDeployment at every leverage", () => {
		for (const leverage of [10_000, 15_000, 20_000, 25_000, 30_000]) {
			for (const spot of [100n, 250n, 1_000n, 7_777n]) {
				const total = deploymentFor(spot * USDC, leverage);
				expect(splitDeployment(total, leverage).spotNotional).toBeGreaterThanOrEqual(spot * USDC);
			}
		}
	});

	it("asks for twice the spot at 1x and a third more at 3x", () => {
		expect(deploymentFor(1_000n * USDC, 10_000)).toBe(2_000n * USDC);
		expect(deploymentFor(3_000n * USDC, 30_000)).toBe(4_000n * USDC);
	});
});

describe("permittedActions, across several markets", () => {
	const even = () => [
		market({ ticker: "BTC", symbol: "cbBTC", targetWeightBps: 5_000 }),
		market({ ticker: "ETH", symbol: "WETH", targetWeightBps: 5_000 }),
	];

	it("deploys into the market furthest below its share", () => {
		const s = snapshot({
			markets: [
				market({ ticker: "BTC", targetWeightBps: 5_000, spotValueUsdc: 4_000n * USDC }),
				market({ ticker: "ETH", targetWeightBps: 5_000, spotValueUsdc: 1_000n * USDC }),
			],
		});
		const deploy = permittedActions(s, NOW).find((o) => o.kind === "DEPLOY");
		expect(deploy?.market).toBe("ETH");
	});

	/**
	 * One market per tick. The five steps of a deployment cross two chains and a
	 * venue's matching engine and have no atomic form, so doing several at once
	 * multiplies the ways to end up half-open. Ticks are a minute apart; the
	 * weights converge on their own.
	 */
	it("offers exactly one deployment however many markets are underweight", () => {
		const deploys = permittedActions(snapshot({ markets: even() }), NOW).filter(
			(o) => o.kind === "DEPLOY",
		);
		expect(deploys).toHaveLength(1);
	});

	it("caps a deployment at the market's own room, not the whole idle balance", () => {
		const s = snapshot({ markets: even() });
		const deploy = permittedActions(s, NOW).find((o) => o.kind === "DEPLOY");
		// $9,000 deployable at 1x buys $4,500 of spot across both markets, so BTC's
		// half is $2,250 — which needs a $4,500 deployment to buy.
		expect(deploy?.amount).toBe(4_500n * USDC);
	});

	it("skips a market that cannot be bought and deploys into the next one", () => {
		const s = snapshot({
			markets: [
				market({ ticker: "BTC", targetWeightBps: 8_000, spotBuyable: false }),
				market({ ticker: "ETH", targetWeightBps: 2_000 }),
			],
		});
		expect(permittedActions(s, NOW).find((o) => o.kind === "DEPLOY")?.market).toBe("ETH");
	});

	it("offers a rebalance per drifted market, worst first", () => {
		const s = snapshot({
			markets: [
				market({ ticker: "BTC", spotUnits: 100n * 10n ** 18n, perpUnits: 98n * 10n ** 18n }),
				market({ ticker: "ETH", spotUnits: 100n * 10n ** 18n, perpUnits: 90n * 10n ** 18n }),
			],
		});
		const rebalances = permittedActions(s, NOW).filter((o) => o.kind === "REBALANCE");
		expect(rebalances.map((o) => o.market)).toEqual(["ETH", "BTC"]);
	});

	/**
	 * Two markets a percent out in opposite directions average to neutral. A
	 * vault-level drift figure would report that as healthy, and both hedges
	 * would stay wrong.
	 */
	it("does not let opposing drifts cancel each other out", () => {
		const s = snapshot({
			markets: [
				market({ ticker: "BTC", spotUnits: 100n * 10n ** 18n, perpUnits: 97n * 10n ** 18n }),
				market({ ticker: "ETH", spotUnits: 100n * 10n ** 18n, perpUnits: 103n * 10n ** 18n }),
			],
		});
		expect(permittedActions(s, NOW).filter((o) => o.kind === "REBALANCE")).toHaveLength(2);
	});

	/**
	 * Disabling a market is how one is retired, and a zero target is what drains
	 * it: it becomes the most overweight market the vault has, so it is never
	 * deployed into and is the first place the next unwind takes from.
	 */
	it("offers to unwind a market an operator has retired", () => {
		const s = snapshot({
			markets: [
				market({ ticker: "BTC", targetWeightBps: 10_000, spotValueUsdc: 5_000n * USDC }),
				market({ ticker: "NVDA", targetWeightBps: 0, spotValueUsdc: 2_000n * USDC }),
			],
		});
		const unwind = permittedActions(s, NOW).find((o) => o.kind === "UNWIND");
		expect(unwind?.amount).toBe(2_000n * USDC);
		expect(unwind?.reason).toContain("NVDA");
		// Offered, not forced: selling into a bad hour to satisfy a preference
		// costs the depositors real money.
		expect(unwind?.forced).toBe(false);
	});

	it("never deploys into a retired market", () => {
		const s = snapshot({
			markets: [market({ ticker: "NVDA", targetWeightBps: 0, spotValueUsdc: 2_000n * USDC })],
		});
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("DEPLOY");
	});
});

describe("permittedActions, under a close order", () => {
	const open = () =>
		snapshot({
			closeRequested: true,
			deployedAssets: 9_000n * USDC,
			markets: [
				market({
					ticker: "BTC",
					targetWeightBps: 5_000,
					spotValueUsdc: 5_000n * USDC,
					spotUnits: 10n ** 18n,
					perpUnits: 10n ** 18n,
				}),
				market({ ticker: "ETH", targetWeightBps: 5_000, spotValueUsdc: 4_000n * USDC }),
			],
		});

	it("offers only CLOSE_ALL, forced, while anything is open", () => {
		const options = permittedActions(open(), NOW);
		expect(options).toHaveLength(1);
		expect(options[0].kind).toBe("CLOSE_ALL");
		expect(options[0].forced).toBe(true);
	});

	it("names what is still open in its reason", () => {
		expect(permittedActions(open(), NOW)[0].reason).toContain("BTC");
	});

	/**
	 * An order to return *all* of the capital already satisfies every request in
	 * the queue, so there is nothing an urgent unwind would additionally do — and
	 * an unwind that stopped at the amount owed would leave the rest of the
	 * position open against an order to close it.
	 */
	it("outranks even a redemption inside its deadline", () => {
		const s = {
			...open(),
			freeAssets: 0n,
			ripeRedeemAssets: 3_000n * USDC,
			earliestDeadline: NOW + 3600,
		};
		expect(permittedActions(s, NOW).map((o) => o.kind)).toEqual(["CLOSE_ALL"]);
	});

	/**
	 * The order is standing, not one-shot. A flag that cleared itself on
	 * completion would have the very next tick see idle USDC, decide it should be
	 * earning, and undo the whole thing.
	 */
	it("holds rather than redeploying once the vault is flat", () => {
		const s = snapshot({ closeRequested: true, deployedAssets: 0n });
		const options = permittedActions(s, NOW);
		expect(options).toHaveLength(1);
		expect(options[0].kind).toBe("HOLD");
		expect(options[0].forced).toBe(true);
	});

	it("deploys again once the order is lifted", () => {
		const s = snapshot({ closeRequested: false, deployedAssets: 0n });
		expect(permittedActions(s, NOW).map((o) => o.kind)).toContain("DEPLOY");
	});

	/** Dust is not a position. Insisting on zero would never let an order finish. */
	it("treats sub-dollar residue as flat", () => {
		const s = snapshot({ closeRequested: true, deployedAssets: 900_000n });
		expect(permittedActions(s, NOW)[0].kind).toBe("HOLD");
	});

	it("is not flat while capital is home but a leg is still open", () => {
		const s = snapshot({
			deployedAssets: 0n,
			markets: [market({ spotUnits: 10n ** 18n })],
		});
		expect(isFlat(s)).toBe(false);
	});

	/**
	 * The reverse, and the one that costs a depositor. Empty legs with the money
	 * still at the agent's wallets is a position sold and not sent home, and
	 * `freeAssets` cannot pay a redemption out of it.
	 */
	it("is not flat while the position is sold but the money is still out", () => {
		expect(isFlat(snapshot({ deployedAssets: 5_000n * USDC }))).toBe(false);
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
		const s = withMarket({
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
		const s = withMarket(
			{ spotValueUsdc: 9_000n * USDC },
			{
				freeAssets: 0n,
				deployedAssets: 9_000n * USDC,
				ripeRedeemAssets: 3_000n * USDC,
				earliestDeadline: NOW + 3600,
			},
		);
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
