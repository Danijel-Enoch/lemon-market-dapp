import { describe, expect, it } from "bun:test";
import { adlRisk } from "@lemon/core";
import { costOf, economicFloor, MAX_BREAKEVEN_DAYS } from "../src/economics";
import {
	DEFAULT_REBALANCE_DRIFT_BPS,
	decide,
	deployableAmount,
	deploymentFor,
	driftBps,
	isFlat,
	type MarketSnapshot,
	MIN_DEPLOY_USDC,
	MIN_TOP_UP_USDC,
	permittedActions,
	perpMarginFor,
	resumableAmount,
	sizingLeverageBps,
	spareMargin,
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
		// A liquid market with a venue that takes small orders, so a fixture that
		// says nothing about costs is not silently gated by them. Tests about the
		// economic guards set these explicitly.
		markPriceUsd: 100,
		lotSize: 0.001,
		minOrderUsd: 10,
		spotGasUsd: 0.01,
		spotImpactPercent: 0.01,
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
		idleOnBase: 0n,
		unallocatedMargin: 0n,
		perpNotionalUsdc: 0n,
		perpEquityUsdc: 0n,
		ripeRedeemAssets: 0n,
		pendingRedeemAssets: 0n,
		earliestDeadline: null,
		markets: [market()],
		closeRequested: false,
		// The old fixed threshold, so the existing drift cases keep testing the
		// behaviour they were written for. The default the agent now ships is
		// higher; tests that care about that set it.
		rebalanceRequested: false,
		rebalanceDriftBps: 100,
		venueWithdrawalFeeUsdc: 0n,
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

/**
 * A deployment that failed after drawing capital down, from the state that
 * prompted this: NVDA held $36.243045, had drawn 90% of it, and the whole
 * $32.618740 was sitting in the agent's Base wallet with no position anywhere.
 *
 * That money is counted in `deployedAssets`, so it fills the ceiling exactly and
 * `deployableAmount` is zero; it is not `freeAssets`, so nothing can withdraw
 * it. Before `resumableAmount` the policy had no option that named it, and the
 * vault recomputed the same HOLD every minute indefinitely.
 */
describe("a deployment stranded at the agent", () => {
	// The real figures, for the arithmetic that produced the deadlock. This part
	// is independent of the deployment floor, which is a per-deployment setting.
	it("leaves the vault with no headroom at all", () => {
		const s = snapshot({
			totalAssets: 36_243_045n,
			freeAssets: 3_624_305n,
			deployedAssets: 32_618_740n,
			idleOnBase: 32_618_740n,
		});
		// floor(36_243_045 × 9000 / 10_000) is 32_618_740 — the deployed figure exactly.
		expect(deployableAmount(s)).toBe(0n);
	});

	// Everything below is sized off the floor rather than in dollars, so it does
	// not depend on which `MIN_DEPLOY_USDC` the environment was read with. At 1x
	// a deployment buys a spot leg worth half of it, so four times the floor is
	// comfortably deployable.
	const IDLE = 4n * MIN_DEPLOY_USDC;

	/** Every dollar the vault has is already at the agent, and none of it is placed. */
	const stranded = (overrides: Partial<VaultSnapshot> = {}) =>
		snapshot({
			totalAssets: IDLE,
			freeAssets: 0n,
			deployedAssets: IDLE,
			idleOnBase: IDLE,
			...overrides,
		});

	it("still offers a deployment, funded from the agent's own balance", () => {
		const deploy = permittedActions(stranded(), NOW).find((o) => o.kind === "DEPLOY");
		expect(deploy).toBeDefined();
		expect(deploy?.fundedFrom).toBe("AGENT");
		expect(deploy?.amount).toBe(IDLE);
	});

	it("says where the money is, so the reason is not mistaken for a fresh draw", () => {
		const deploy = permittedActions(stranded(), NOW).find((o) => o.kind === "DEPLOY");
		expect(deploy?.reason ?? "").toContain("agent's Base wallet");
	});

	/**
	 * Even with headroom to spare. Drawing more down while capital the vault
	 * already released sits idle raises `deployedAssets` twice over for one
	 * position — and leaves the first draw exactly as stuck as it was.
	 */
	it("spends what is already out before drawing anything more", () => {
		const s = snapshot({ idleOnBase: IDLE });
		const deploy = permittedActions(s, NOW).find((o) => o.kind === "DEPLOY");
		expect(deploy?.fundedFrom).toBe("AGENT");
		expect(deploy?.amount).toBe(IDLE);
	});

	it("draws from the vault in the ordinary case, where nothing is stranded", () => {
		expect(permittedActions(snapshot(), NOW).find((o) => o.kind === "DEPLOY")?.fundedFrom).toBe(
			"VAULT",
		);
	});

	it("holds the money back while the queue is owed more than the vault can pay", () => {
		const s = stranded({ ripeRedeemAssets: IDLE });
		expect(resumableAmount(s)).toBe(0n);
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("DEPLOY");
	});

	/**
	 * The state the vault reached after the bridge succeeded and the short did
	 * not: $16.284168 of margin at Pacifica backing no position, $16.309370 idle
	 * on Base, no spot leg anywhere.
	 *
	 * Splitting the idle balance again gives an $8.15 spot leg — under a $10
	 * floor, so nothing happens, and under a lower floor something worse happens:
	 * another $8.15 bridged into margin that is already unhedged. The position
	 * needs its spot leg, so this source buys spot and bridges nothing.
	 */
	describe("with margin already at the venue", () => {
		// Held at one and a half times the floor, which is the ratio that makes the
		// bug bite at any setting of it: the margin on its own clears the floor,
		// and half of it does not. The live numbers were $16.28 of margin against a
		// $10 floor, with the halved figure landing at $8.15.
		const MARGIN = (3n * MIN_DEPLOY_USDC) / 2n;
		/** Slightly more USDC on hand than margin, as the relayer's cut leaves it. */
		const IDLE_HERE = MARGIN + 25_202n;

		const halfDeployed = (overrides: Partial<VaultSnapshot> = {}) =>
			snapshot({
				freeAssets: 0n,
				totalAssets: IDLE_HERE + MARGIN,
				deployedAssets: IDLE_HERE + MARGIN,
				idleOnBase: IDLE_HERE,
				unallocatedMargin: MARGIN,
				...overrides,
			});

		it("buys the spot leg and bridges nothing", () => {
			const deploy = permittedActions(halfDeployed(), NOW).find((o) => o.kind === "DEPLOY");
			expect(deploy?.legs?.perpMargin).toBe(0n);
			// Capped by what the margin already there can carry at the *sizing*
			// leverage, not by half the idle balance — which is the whole point.
			// Slightly under the margin itself, because the hedge is opened with the
			// buffer in hand rather than at the mandate's ceiling.
			const carriable = (MARGIN * BigInt(sizingLeverageBps(snapshot()))) / 10_000n;
			expect(carriable).toBeLessThan(MARGIN);
			expect(deploy?.legs?.spotNotional).toBe(carriable);
			expect(deploy?.amount).toBe(carriable);
		});

		it("says the margin is already there, so the log is not read as a fresh bridge", () => {
			const deploy = permittedActions(halfDeployed(), NOW).find((o) => o.kind === "DEPLOY");
			expect(deploy?.reason ?? "").toContain("already at the venue");
		});

		/** Halving the idle balance puts the spot leg under the floor, and nothing happens. */
		it("clears a floor that halving the idle balance would not", () => {
			expect(splitDeployment(IDLE_HERE, 10_000).spotNotional).toBeLessThan(MIN_DEPLOY_USDC);
			const deploy = permittedActions(halfDeployed(), NOW).find((o) => o.kind === "DEPLOY");
			expect(deploy?.legs?.spotNotional).toBeGreaterThanOrEqual(MIN_DEPLOY_USDC);
		});

		it("never buys more spot than the idle balance can pay for", () => {
			// Margin far exceeding the USDC on hand: the spot leg is what is
			// affordable, not what the margin could theoretically carry.
			const deploy = permittedActions(
				halfDeployed({ idleOnBase: 2n * MIN_DEPLOY_USDC, unallocatedMargin: 500n * USDC }),
				NOW,
			).find((o) => o.kind === "DEPLOY");
			expect(deploy?.legs?.spotNotional).toBe(2n * MIN_DEPLOY_USDC);
		});

		it("splits normally once that margin is backing a position", () => {
			// Sized off the floor so the ordinary near-half-and-half split clears it.
			const idle = 4n * MIN_DEPLOY_USDC;
			const deploy = permittedActions(
				halfDeployed({ unallocatedMargin: 0n, idleOnBase: idle }),
				NOW,
			).find((o) => o.kind === "DEPLOY");

			const expected = splitDeployment(idle, sizingLeverageBps(snapshot()));
			expect(deploy?.legs).toEqual(expected);
			// The margin side is the larger of the two, which is what the buffer is:
			// an unlevered hedge backed by slightly more than its own notional.
			expect(expected.perpMargin).toBeGreaterThan(expected.spotNotional);
		});
	});

	it("falls through to the vault when the stranded balance is below the floor", () => {
		// Too small to open a spot leg with, but the vault can fund one on its own.
		const s = snapshot({ idleOnBase: 1n });
		expect(permittedActions(s, NOW).find((o) => o.kind === "DEPLOY")?.fundedFrom).toBe("VAULT");
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
		// Sized off the minimum rather than written in dollars: the minimum is a
		// deployment setting now, and a test that hard-codes one reading of it
		// stops testing the rule and starts testing the .env in the repo root.
		const dust = MIN_DEPLOY_USDC / 2n;
		const s = snapshot({ freeAssets: dust, totalAssets: dust });
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
		// Twice the minimum, of which 90% is deployable — enough that a gate on
		// the deployment total would pass either case, while the spot leg it buys
		// comes to 0.9x the minimum at 1x and 1.2x at 2x. Only the second clears.
		const idle = { freeAssets: MIN_DEPLOY_USDC * 2n, totalAssets: MIN_DEPLOY_USDC * 2n };
		expect(permittedActions(snapshot(idle), NOW).map((o) => o.kind)).not.toContain("DEPLOY");
		expect(
			permittedActions(
				snapshot({
					...idle,
					riskTier: "LEVERAGED",
					targetLeverageBps: 20_000,
					maxLeverageBps: 30_000,
				}),
				NOW,
			).map((o) => o.kind),
		).toContain("DEPLOY");
	});

	it("never offers a deployment the venue would reject", () => {
		for (const targetLeverageBps of [10_000, 15_000, 20_000, 25_000, 30_000]) {
			for (const size of [100n, 150n, 200n, 250n, 400n, 1_000n]) {
				const s = snapshot({
					targetLeverageBps,
					// A real profile: the ceiling is never below the target, and only the
					// conservative tier has them equal. Leaving it at 10_000 here would
					// size every case as if it were unlevered.
					maxLeverageBps: Math.max(targetLeverageBps, 10_000),
					freeAssets: size * USDC,
					totalAssets: size * USDC,
				});
				const deploy = permittedActions(s, NOW).find((o) => o.kind === "DEPLOY");
				if (!deploy) continue;
				// Measured at the leverage the deployment is actually sized at, which is
				// the one the venue's own floor sees.
				const { spotNotional } = splitDeployment(deploy.amount, sizingLeverageBps(s));
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

		// $9,000 is deployable, and unlevered that buys a little under half of it in
		// spot — the rest is the margin backing it, plus the buffer. Split evenly
		// between two markets, BTC's share is half of that spot, and the deployment
		// that buys it is that share grossed back up.
		//
		// Asserted through the same helpers rather than as a round number, because
		// the exact figure is a rounding artifact of the buffer: at 1x it was a clean
		// $4,500, and at 0.97x it lands a unit either side depending on the setting.
		const sizing = sizingLeverageBps(s);
		const wholeSpot = splitDeployment(9_000n * USDC, sizing).spotNotional;
		expect(deploy?.amount).toBe(deploymentFor(wholeSpot / 2n, sizing));
		// Still about half the deployable balance, which is what "capped at the
		// market's own room" means here.
		expect(deploy?.amount).toBeLessThan(5_000n * USDC);
		expect(deploy?.amount).toBeGreaterThan(4_000n * USDC);
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

/**
 * The mandate, and the arithmetic that used to breach it.
 *
 * A conservative vault is required by the contract to have a target and a
 * ceiling of exactly 10_000 with nothing in between, and the leverage it reports
 * is marked to market on both sides. A hedge opened at exactly 1x therefore
 * leaves the mandate on the first upward tick of its market — and the report
 * that admits it reverts, which stales the NAV and shuts the vault to deposits
 * and redemptions until the price comes back.
 *
 * The observed case: `LeverageExceedsMandate(10025, 10000)`, on a $32 vault,
 * every 64 seconds.
 */
describe("the margin buffer", () => {
	const conservative = snapshot();
	const leveraged = snapshot({
		riskTier: "LEVERAGED",
		targetLeverageBps: 20_000,
		maxLeverageBps: 30_000,
	});

	/**
	 * What the perp account reads after the underlying moves by `moveBps`.
	 *
	 * A short: notional is `size × mark`, so it grows with the price, and equity
	 * nets the unrealised loss, so it shrinks by the same dollars. Both halves,
	 * which is why the ratio moves at roughly twice the price.
	 */
	function afterMove(legs: { spotNotional: bigint; perpMargin: bigint }, moveBps: bigint) {
		const change = (legs.spotNotional * moveBps) / 10_000n;
		return {
			perpNotionalUsdc: legs.spotNotional + change,
			perpEquityUsdc: legs.perpMargin - change,
		};
	}

	function observedBps(legs: { spotNotional: bigint; perpMargin: bigint }, moveBps: bigint) {
		const { perpNotionalUsdc, perpEquityUsdc } = afterMove(legs, moveBps);
		return Number((perpNotionalUsdc * 10_000n) / perpEquityUsdc);
	}

	// -- what gets buffered, and what does not ------------------------------

	it("takes the buffer out of a mandate with no headroom of its own", () => {
		expect(sizingLeverageBps(conservative)).toBeLessThan(conservative.maxLeverageBps);
	});

	it("leaves a mandate that already has headroom at its target", () => {
		// A 2x target under a 3x ceiling is a third clear of the line already.
		// Shaving it would give up yield to buy room the vault has anyway.
		expect(sizingLeverageBps(leveraged)).toBe(leveraged.targetLeverageBps);
	});

	it("never sizes above the vault's own target", () => {
		for (const target of [10_000, 15_000, 20_000, 25_000, 30_000]) {
			const s = snapshot({ targetLeverageBps: target, maxLeverageBps: 30_000 });
			expect(sizingLeverageBps(s)).toBeLessThanOrEqual(target);
		}
	});

	// -- the incident -------------------------------------------------------

	/** The old sizing, kept here as the thing the buffer is measured against. */
	it("would have breached on an eighth of a percent at exactly 1x", () => {
		const atTheCeiling = splitDeployment(100n * USDC, 10_000);
		expect(atTheCeiling.spotNotional).toBe(atTheCeiling.perpMargin);
		// The reported figure, reproduced. The log said 10_025 against a ceiling of
		// 10_000; integer USDC on a round $100 lands a unit either side of that,
		// which is the point — a rise of an eighth of a percent is already over.
		expect(observedBps(atTheCeiling, 12n)).toBeGreaterThan(conservative.maxLeverageBps);
		expect(observedBps(atTheCeiling, 12n)).toBeGreaterThanOrEqual(10_024);
	});

	it("holds the same move comfortably inside the mandate once buffered", () => {
		const buffered = splitDeployment(100n * USDC, sizingLeverageBps(conservative));
		expect(observedBps(buffered, 12n)).toBeLessThan(conservative.maxLeverageBps);
	});

	/**
	 * `p = b / (2 * (1 - b))` — the move a buffer of `b` absorbs. The point of
	 * asserting it here is that the buffer is worth having: a fraction of a
	 * percent was never enough, and this is the figure that says how much is.
	 */
	it("absorbs a move a hedge sized at its ceiling could not", () => {
		const buffered = splitDeployment(100n * USDC, sizingLeverageBps(conservative));
		expect(observedBps(buffered, 100n)).toBeLessThan(conservative.maxLeverageBps);
	});

	it("still breaches eventually, which is what the top-up is for", () => {
		const buffered = splitDeployment(100n * USDC, sizingLeverageBps(conservative));
		expect(observedBps(buffered, 500n)).toBeGreaterThan(conservative.maxLeverageBps);
	});

	// -- the buffer is not spent by the next deployment ----------------------

	/**
	 * Pacifica reserves the notional at the account's 1x setting and reports the
	 * rest as free, so to the venue the whole buffer looks spendable. A deployment
	 * that believed it would buy more notional with the margin holding the line —
	 * and put the account straight back at its ceiling.
	 */
	it("does not offer the buffer to the next deployment as spare margin", () => {
		const buffered = splitDeployment(100n * USDC, sizingLeverageBps(conservative));
		const s = snapshot({
			perpNotionalUsdc: buffered.spotNotional,
			perpEquityUsdc: buffered.perpMargin,
			// What the venue would say is free: equity less the notional it reserves.
			unallocatedMargin: buffered.perpMargin - buffered.spotNotional,
		});
		// The venue sees dollars of free margin; the policy sees nothing worth
		// deploying. Not exactly zero only because flooring the split and flooring
		// the requirement disagree in the last USDC unit or two.
		expect(s.unallocatedMargin).toBeGreaterThan(USDC);
		expect(spareMargin(s)).toBeLessThan(1_000n);
	});

	/**
	 * The half-deployed case, which must keep working: margin bridged, short never
	 * opened. There is no notional, so there is no buffer to hold back, and the
	 * whole balance is spare — the state `deploymentSources` exists to resume from.
	 */
	it("still sees margin backing no position at all", () => {
		const s = snapshot({ unallocatedMargin: 45n * USDC, perpNotionalUsdc: 0n });
		expect(spareMargin(s)).toBe(45n * USDC);
	});

	it("hands back genuine excess above the buffer", () => {
		const buffered = splitDeployment(100n * USDC, sizingLeverageBps(conservative));
		const extra = 20n * USDC;
		const s = snapshot({
			perpNotionalUsdc: buffered.spotNotional,
			perpEquityUsdc: buffered.perpMargin + extra,
			unallocatedMargin: buffered.perpMargin - buffered.spotNotional + extra,
		});
		// Within a rounding unit of the excess, and nothing like the buffer beneath it.
		expect(spareMargin(s)).toBeGreaterThan(extra - 1_000n);
		expect(spareMargin(s)).toBeLessThan(extra + 1_000n);
	});
});

/**
 * Restoring the buffer once drift has eaten it.
 *
 * The buffer buys time, not immunity. A market that keeps going up spends it,
 * and the only thing that puts it back without shrinking the position the
 * depositors are paid funding on is more margin.
 */
describe("TOP_UP_MARGIN", () => {
	const SIZED = sizingLeverageBps(snapshot());

	/** A vault whose hedge is open and whose account reads at `observedBps`. */
	function atLeverage(observedBps: number, overrides: Partial<VaultSnapshot> = {}): VaultSnapshot {
		const notional = 1_000n * USDC;
		return snapshot({
			perpNotionalUsdc: notional,
			perpEquityUsdc: (notional * 10_000n) / BigInt(observedBps),
			markets: [market({ spotValueUsdc: notional, spotUnits: 10n ** 18n, perpUnits: 10n ** 18n })],
			deployedAssets: 2_000n * USDC,
			...overrides,
		});
	}

	const kinds = (s: VaultSnapshot) => permittedActions(s, NOW).map((o) => o.kind);
	const topUp = (s: VaultSnapshot) =>
		permittedActions(s, NOW).find((o) => o.kind === "TOP_UP_MARGIN");

	it("leaves a freshly opened hedge alone", () => {
		expect(kinds(atLeverage(SIZED))).not.toContain("TOP_UP_MARGIN");
	});

	/**
	 * Half way, not at the line. A bridge takes minutes and ticks are a minute
	 * apart, so waiting for the actual breach means every tick in between is one
	 * with a stale NAV. The half that remains is what covers the crossing.
	 */
	it("acts once more than half the buffer is gone", () => {
		const halfway = SIZED + Math.floor((10_000 - SIZED) / 2);
		expect(kinds(atLeverage(halfway))).not.toContain("TOP_UP_MARGIN");
		expect(kinds(atLeverage(halfway + 10))).toContain("TOP_UP_MARGIN");
	});

	it("is a judgement call while the mandate still holds", () => {
		expect(topUp(atLeverage(9_900))?.forced).toBe(false);
	});

	/**
	 * Once the report is actually reverting there is nothing else worth doing
	 * with a tick: the vault is stale, so it takes no deposits and pays no
	 * redemptions until this lands.
	 */
	it("is the only option once the ceiling is breached", () => {
		expect(permittedActions(atLeverage(10_025), NOW).map((o) => o.kind)).toEqual(["TOP_UP_MARGIN"]);
		expect(topUp(atLeverage(10_025))?.forced).toBe(true);
	});

	it("sends enough to put the account back where it was opened", () => {
		const s = atLeverage(10_025);
		const sent = topUp(s)?.amount ?? 0n;
		const restored = Number((s.perpNotionalUsdc * 10_000n) / (s.perpEquityUsdc + sent));
		expect(restored).toBeLessThanOrEqual(SIZED);
	});

	/**
	 * A 25 bps drift on a small hedge is a shortfall of cents, and bridging cents
	 * every tick would cost more than the vault earns. Overshooting is harmless:
	 * the excess is equity, it lands the account further below its ceiling rather
	 * than above it, and `spareMargin` hands it to the next deployment.
	 */
	it("never bridges less than the floor", () => {
		const tiny = atLeverage(10_025, {
			perpNotionalUsdc: 20n * USDC,
			perpEquityUsdc: (20n * USDC * 10_000n) / 10_025n,
		});
		expect(topUp(tiny)?.amount).toBe(MIN_TOP_UP_USDC);
	});

	it("says what it is doing and why", () => {
		expect(topUp(atLeverage(10_025))?.reason ?? "").toContain("stale");
		expect(topUp(atLeverage(9_900))?.reason ?? "").toContain("buffer");
	});

	// -- where the money comes from ----------------------------------------

	it("spends capital already out of the vault before drawing more", () => {
		const s = atLeverage(10_025, { idleOnBase: 500n * USDC });
		expect(topUp(s)?.fundedFrom).toBe("AGENT");
	});

	it("draws from the vault when the agent holds nothing", () => {
		expect(topUp(atLeverage(10_025))?.fundedFrom).toBe("VAULT");
	});

	/**
	 * `resumableAmount` holds idle USDC back while the queue is short, because it
	 * is the cheapest capital a redemption could be paid from. That rule inverts
	 * once the NAV is stale: a vault that cannot report cannot fulfil at all, so
	 * hoarding the money for the queue is what keeps the queue unpaid.
	 */
	it("spends the agent's idle balance for a breach even with the queue short", () => {
		const s = atLeverage(10_025, {
			idleOnBase: 500n * USDC,
			// Owed more than the vault holds, which is the condition that makes
			// `resumableAmount` refuse to release the idle balance.
			freeAssets: 1_000n * USDC,
			ripeRedeemAssets: 5_000n * USDC,
		});
		expect(resumableAmount(s)).toBe(0n);
		expect(topUp(s)?.fundedFrom).toBe("AGENT");
	});

	/**
	 * A vault at its deployment ceiling with capital stranded at the agent. The
	 * vault source is zero — the ceiling is what the stranded money is filling —
	 * and picking a single source up front by comparing the shortfall to the idle
	 * balance would have landed on it and found nothing to spend.
	 */
	it("falls through to the agent when the vault ceiling leaves nothing to draw", () => {
		const s = atLeverage(10_025, {
			freeAssets: 0n,
			totalAssets: 2_000n * USDC,
			deployedAssets: 2_000n * USDC,
			idleOnBase: 500n * USDC,
		});
		expect(deployableAmount(s)).toBe(0n);
		expect(topUp(s)?.fundedFrom).toBe("AGENT");
	});

	it("offers nothing it cannot fund", () => {
		const broke = atLeverage(10_025, {
			freeAssets: 0n,
			idleOnBase: 0n,
			withdrawWindowRemaining: 0n,
		});
		expect(kinds(broke)).not.toContain("TOP_UP_MARGIN");
	});

	/**
	 * The state the live vault was actually in: fully deployed, breached, and with
	 * nothing spare to add as margin.
	 *
	 * `deployableAmount` is zero because the deployment ceiling is full — which is
	 * what a *working* vault looks like — and a completed deployment leaves no
	 * idle USDC at the agent. So the cheap correction has nothing to fund it, and
	 * without a second one the vault would sit stale until somebody deposited.
	 */
	describe("when there is nothing to top up with", () => {
		const wedged = (overrides: Partial<VaultSnapshot> = {}) => {
			const notional = 1_000n * USDC;
			return atLeverage(10_025, {
				// Deployed right up to the 90% ceiling, with the rest owed to nobody.
				totalAssets: 2_200n * USDC,
				freeAssets: 220n * USDC,
				deployedAssets: 1_980n * USDC,
				idleOnBase: 0n,
				withdrawWindowRemaining: 0n,
				markets: [
					market({ spotValueUsdc: notional, spotUnits: 10n ** 18n, perpUnits: 10n ** 18n }),
				],
				...overrides,
			});
		};

		it("has no margin it could send", () => {
			expect(deployableAmount(wedged())).toBe(0n);
			expect(kinds(wedged())).not.toContain("TOP_UP_MARGIN");
		});

		/**
		 * Closing part of the position takes the notional down while equity stays
		 * where it is — the loss it realises was already marked — so the ratio
		 * falls. The proceeds also refill `freeAssets`, which reopens the cheap
		 * correction for next time.
		 */
		it("sells the excess notional instead, and is not asked to deliberate", () => {
			const unwind = permittedActions(wedged(), NOW).find((o) => o.kind === "UNWIND");
			expect(permittedActions(wedged(), NOW).map((o) => o.kind)).toEqual(["UNWIND"]);
			expect(unwind?.forced).toBe(true);
			expect(unwind?.reason ?? "").toContain("stale");
		});

		/**
		 * Sized to land back at the sizing leverage, not just inside the ceiling.
		 * Scraping under the line pays a full set of trading fees for no room at
		 * all, and the next tick would be back here.
		 */
		it("closes enough to reach the leverage the hedge was opened at", () => {
			const s = wedged();
			const sold = permittedActions(s, NOW).find((o) => o.kind === "UNWIND")?.amount ?? 0n;
			const after = Number(((s.perpNotionalUsdc - sold) * 10_000n) / s.perpEquityUsdc);
			expect(after).toBeLessThanOrEqual(SIZED);
		});

		/** Never more than the legs that can actually be routed out hold. */
		it("asks for no more than can be sold", () => {
			const s = wedged({
				markets: [
					market({
						spotValueUsdc: 1_000n * USDC,
						spotUnits: 10n ** 18n,
						perpUnits: 10n ** 18n,
						spotSellable: false,
					}),
				],
			});
			expect(kinds(s)).not.toContain("UNWIND");
		});
	});

	it("says nothing about a vault with no position at all", () => {
		expect(kinds(snapshot({ perpNotionalUsdc: 0n, perpEquityUsdc: 45n * USDC }))).not.toContain(
			"TOP_UP_MARGIN",
		);
	});
});

/**
 * The economics of acting at all.
 *
 * Every threshold above answers "is this permitted?". These answer the question
 * the thresholds never asked: *does this earn back what it costs?* A $32 vault
 * was closing $0.49 of position every sixty seconds — four Base transactions, a
 * Pacifica withdrawal and a cross-chain crossing each time — to correct a breach
 * worth a hundredth of its daily funding income.
 */

/**
 * What one unwind's overhead comes to for the default fixture, times the payoff
 * multiple. Derived from the fixture rather than written in dollars, so the
 * tests keep measuring the rule when a gas or bridge estimate is retuned.
 */
const UNWIND_FLOOR = economicFloor(
	costOf("unwind", 0n, {
		spotImpactPercent: market().spotImpactPercent,
		spotGasUsdc: BigInt(Math.round(market().spotGasUsd * 1e6)),
		withdrawalFeeUsdc: snapshot().venueWithdrawalFeeUsdc,
	}),
);

/** Breached, at the figure the live vault reported: `LeverageExceedsMandate(10025, 10000)`. */
const BREACHED_BPS = 10_025n;

/**
 * A vault that is breached, fully committed, and has nothing to top up with.
 *
 * `deployableAmount` is zero because there is no free balance and no withdrawal
 * allowance left, and there is no idle USDC at the agent — which is what a vault
 * that deployed successfully looks like. So the cheap correction is unavailable
 * and `deleverage` is the only thing left.
 */
function wedgedAt(position: bigint, overrides: Partial<VaultSnapshot> = {}): VaultSnapshot {
	const equity = (position * 10_000n) / BREACHED_BPS;
	return snapshot({
		perpNotionalUsdc: position,
		perpEquityUsdc: equity,
		markets: [market({ spotValueUsdc: position, spotUnits: 10n ** 18n, perpUnits: 10n ** 18n })],
		freeAssets: 0n,
		idleOnBase: 0n,
		withdrawWindowRemaining: 0n,
		totalAssets: position + equity,
		deployedAssets: position + equity,
		...overrides,
	});
}

describe("a breach the vault cannot afford to correct", () => {
	/**
	 * The production scenario, and the thing the whole change is for. The
	 * arithmetic that says "close $0.49" is right; acting on it is still wrong,
	 * because closing it commits the same flat costs as closing fifty dollars and
	 * leaves the vault holding nothing but the breach it started with.
	 */
	it("refuses to unwind a position smaller than one unwind costs", () => {
		const kinds = permittedActions(wedgedAt(UNWIND_FLOOR / 2n), NOW).map((o) => o.kind);
		expect(kinds).not.toContain("UNWIND");
	});

	it("holds instead, and is not asked to deliberate about it", () => {
		const options = permittedActions(wedgedAt(UNWIND_FLOOR / 2n), NOW);
		expect(options).toHaveLength(1);
		expect(options[0].kind).toBe("HOLD");
		expect(options[0].forced).toBe(true);
	});

	/**
	 * Loudly, because doing nothing here leaves the NAV stale — which stops
	 * deposits and stops redemptions being paid. An operator has to be able to
	 * tell that from a quiet tick, and the only cures are outside the agent:
	 * add margin, or close the vault.
	 */
	it("says that no correction pays for itself, rather than going quiet", () => {
		const hold = permittedActions(wedgedAt(UNWIND_FLOOR / 2n), NOW)[0];
		expect(hold.reason).toContain("no correction here pays for itself");
		expect(hold.reason).toContain("stale");
	});

	/** The unwind is what costs money, so it is the unwind that is refused. */
	it("moves no money at all while it holds", () => {
		expect(permittedActions(wedgedAt(UNWIND_FLOOR / 2n), NOW)[0].amount).toBe(0n);
	});
});

describe("a breach worth correcting but not worth correcting cheaply", () => {
	/**
	 * A $50 position at 1.0025x needs about $1.62 closed. That is a real
	 * correction and a bad trade: the four transactions, the crossing and the
	 * withdrawal cost the same whether the trip moves $1.62 or $3, so the
	 * correction is rounded up to something worth the trip.
	 */
	const fifty = () => wedgedAt(50n * USDC);

	it("rounds the correction up to what the trip costs rather than closing the bare excess", () => {
		const unwind = permittedActions(fifty(), NOW).find((o) => o.kind === "UNWIND");
		expect(unwind?.amount).toBe(UNWIND_FLOOR);
	});

	/**
	 * Strictly better than the minimum, and this is why: closing more lands the
	 * account below its ceiling with room to drift into, rather than back on the
	 * line where the next tick finds it again.
	 */
	it("lands the account below the leverage it was opened at, not on the line", () => {
		const s = fifty();
		const sold = permittedActions(s, NOW).find((o) => o.kind === "UNWIND")?.amount ?? 0n;
		const after = Number(((s.perpNotionalUsdc - sold) * 10_000n) / s.perpEquityUsdc);
		expect(after).toBeLessThan(sizingLeverageBps(s));
	});

	it("says it is closing more than the breach strictly needs, and why", () => {
		const unwind = permittedActions(fifty(), NOW).find((o) => o.kind === "UNWIND");
		expect(unwind?.reason ?? "").toContain("strictly needed");
		expect(unwind?.forced).toBe(true);
	});

	/** Never more than the routable legs hold — the floor is a floor, not a licence. */
	it("still never asks for more than can actually be sold", () => {
		const s = fifty();
		const sold = permittedActions(s, NOW).find((o) => o.kind === "UNWIND")?.amount ?? 0n;
		expect(sold).toBeLessThanOrEqual(s.markets[0].spotValueUsdc);
	});
});

/**
 * The safety property the whole change must not break.
 *
 * A redemption is an obligation with a person on the other end of it. Every
 * economic gate above is about preferences — a tidy-up that can wait, a breach
 * that will still be there next tick — and none of them may ever stand between a
 * depositor and money they have already asked for.
 */
describe("a redemption is never gated on what it costs", () => {
	/** Owed $10, holding $9.99: a one-cent shortfall against a $3 unwind floor. */
	const owed = (overrides: Partial<VaultSnapshot> = {}) =>
		withMarket(
			{ spotValueUsdc: 100n * USDC },
			{
				freeAssets: 9_990_000n,
				deployedAssets: 100n * USDC,
				ripeRedeemAssets: 10n * USDC,
				...overrides,
			},
		);

	it("offers the unwind however far below the cost floor the shortfall is", () => {
		const unwind = permittedActions(owed(), NOW).find((o) => o.kind === "UNWIND");
		expect(unwind).toBeDefined();
		expect(unwind?.amount).toBeLessThan(UNWIND_FLOOR);
	});

	it("sizes it at the shortfall and its buffer, not rounded up to a worthwhile trip", () => {
		// One cent short, plus the 0.5% slack every unwind carries.
		expect(permittedActions(owed(), NOW).find((o) => o.kind === "UNWIND")?.amount).toBe(10_050n);
	});

	it("still forces it inside the deadline, with nothing else on offer", () => {
		const options = permittedActions(owed({ earliestDeadline: NOW + 3600 }), NOW);
		expect(options).toHaveLength(1);
		expect(options[0].kind).toBe("UNWIND");
		expect(options[0].forced).toBe(true);
	});

	/** A single unit is still somebody's money. */
	it("offers an unwind for a shortfall of one USDC unit", () => {
		const s = owed({ freeAssets: 10n * USDC - 1n });
		expect(permittedActions(s, NOW).map((o) => o.kind)).toContain("UNWIND");
	});

	/**
	 * The two new refusals meeting, which is where this could most easily have
	 * gone wrong. The vault is breached *and* too small for any correction to pay
	 * for itself, so `deleverage` answers with a forced HOLD — and a forced
	 * correction is otherwise returned as the sole option, which would have
	 * discarded the redemption unwind pushed above it. A vault that cannot afford
	 * to fix its own leverage is still perfectly able to pay somebody out.
	 */
	it("is still offered by a vault too small to correct its own leverage", () => {
		const position = UNWIND_FLOOR / 2n;
		const s = wedgedAt(position, { ripeRedeemAssets: 1n * USDC });

		const options = permittedActions(s, NOW);

		expect(options.map((o) => o.kind)).toContain("UNWIND");
		// One dollar short, plus the 0.5% slack — sized by the obligation, not
		// rounded up to a trip that pays for itself.
		expect(options.find((o) => o.kind === "UNWIND")?.amount).toBe(1_005_000n);
	});

	/** The explanation still stands beside it, rather than in place of it. */
	it("keeps the breach explanation on the list without letting it outrank the queue", () => {
		const options = permittedActions(
			wedgedAt(UNWIND_FLOOR / 2n, { ripeRedeemAssets: 1n * USDC }),
			NOW,
		);
		expect(options.map((o) => o.kind)).toEqual(["UNWIND", "HOLD"]);
		expect(options[1].reason).toContain("no correction here pays for itself");
	});
});

describe("an operator's close order is never gated on what it costs", () => {
	/** A position worth a fraction of one close, under a standing order to close it. */
	it("offers CLOSE_ALL on a position far below any economic floor", () => {
		const s = snapshot({
			closeRequested: true,
			deployedAssets: UNWIND_FLOOR / 100n,
			markets: [
				market({
					spotValueUsdc: UNWIND_FLOOR / 100n,
					spotUnits: 10n ** 12n,
					perpUnits: 10n ** 12n,
				}),
			],
		});
		const options = permittedActions(s, NOW);
		expect(options.map((o) => o.kind)).toEqual(["CLOSE_ALL"]);
		expect(options[0].forced).toBe(true);
	});
});

/**
 * Whether the venue would take the order, asked before it is offered.
 *
 * A correction can clear the drift threshold, sit exactly on the lot grid, and
 * still be worth less than the venue's minimum order notional — at which point
 * placing it is not a risk to be managed but an outcome that cannot happen.
 * Offering it anyway meant choosing it, logging it, sending it, and failing, on
 * every tick, for as long as the drift stood.
 */
describe("a rebalance the venue would refuse", () => {
	/**
	 * The live numbers. NVDA drifted 2.89% off neutral, which on that position is
	 * a $0.45 correction, against a venue that will not take an order under $10.
	 */
	const tooSmall = () =>
		withMarket({
			spotUnits: 155_700_000_000_000_000n,
			perpUnits: 151_200_000_000_000_000n,
			markPriceUsd: 100,
			lotSize: 0.001,
			minOrderUsd: 10,
		});

	it("is not offered when the correction is worth less than the venue's minimum order", () => {
		// The drift is real and well past the threshold — this is not a quiet tick.
		expect(driftBps(155_700_000_000_000_000n, 151_200_000_000_000_000n)).toBe(289);
		expect(permittedActions(tooSmall(), NOW).map((o) => o.kind)).not.toContain("REBALANCE");
	});

	/** Not an emergency either: the vault carries on doing everything else. */
	it("leaves the rest of the tick alone rather than forcing a hold", () => {
		const kinds = permittedActions(tooSmall(), NOW).map((o) => o.kind);
		expect(kinds).toContain("DEPLOY");
		expect(kinds).toContain("HOLD");
	});

	/**
	 * The other floor, in the other unit. A correction finer than one lot cannot
	 * be expressed at all, so the legs are already as close as this market allows
	 * — however many dollars the difference happens to be worth.
	 */
	it("is not offered when the correction rounds to nothing on the venue's lot grid", () => {
		const s = withMarket({
			spotUnits: 5n * 10n ** 18n,
			perpUnits: 4_500_000_000_000_000_000n,
			// Half a unit off, on a grid of whole units.
			lotSize: 1,
			// Worth $500, so the minimum order size is nowhere near the reason.
			markPriceUsd: 1_000,
			minOrderUsd: 10,
		});
		expect(driftBps(5n * 10n ** 18n, 4_500_000_000_000_000_000n)).toBe(1_000);
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("REBALANCE");
	});

	it("is not offered when the perp leg has no mark to size the correction against", () => {
		const s = withMarket({
			spotUnits: 100n * 10n ** 18n,
			perpUnits: 98n * 10n ** 18n,
			markPriceUsd: 0,
		});
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("REBALANCE");
	});

	/**
	 * A missing figure is "no floor", not a reason to refuse. Neither limit is a
	 * safety rule — they are the venue's own, and inventing a stricter one here
	 * would stop a hedge being maintained to enforce a constraint that does not
	 * exist.
	 */
	it("is offered when the venue has stated no minimum at all", () => {
		const s = withMarket({
			spotUnits: 155_700_000_000_000_000n,
			perpUnits: 151_200_000_000_000_000n,
			markPriceUsd: 100,
			lotSize: 0,
			minOrderUsd: 0,
		});
		expect(permittedActions(s, NOW).map((o) => o.kind)).toContain("REBALANCE");
	});

	// -- and the case that should go through --------------------------------

	it("is offered when the drift clears the threshold and the venue would take it", () => {
		const s = withMarket({ spotUnits: 100n * 10n ** 18n, perpUnits: 98n * 10n ** 18n });
		const rebalance = permittedActions(s, NOW).find((o) => o.kind === "REBALANCE");
		expect(rebalance?.market).toBe("NVDA");
		// Two units at $100, which clears the $10 minimum many times over.
		expect(rebalance?.reason ?? "").toContain("$200.00");
	});
});

/**
 * The threshold is the vault's, not a constant.
 *
 * The right answer depends on the position's size against the venue's minimum
 * order notional: a threshold that suits a large vault has a small one placing
 * corrections the venue will not accept, forever.
 */
describe("a rebalance asked for by hand", () => {
	/**
	 * Drift well inside any sensible threshold, on a position large enough that
	 * the correction clears the venue's minimum. Untouched, this tick has nothing
	 * to do; asked for, it has one thing to do.
	 */
	const barelyDrifted = (rebalanceRequested: boolean) =>
		withMarket(
			{ spotUnits: 100n * 10n ** 18n, perpUnits: 99_800_000_000_000_000_000n },
			{ rebalanceDriftBps: 100, rebalanceRequested },
		);

	it("does nothing about drift under the threshold when nobody asked", () => {
		expect(permittedActions(barelyDrifted(false), NOW).map((o) => o.kind)).not.toContain(
			"REBALANCE",
		);
	});

	it("corrects that same drift when an operator asks", () => {
		expect(permittedActions(barelyDrifted(true), NOW).map((o) => o.kind)).toContain("REBALANCE");
	});

	it("says it was asked for, rather than quoting a threshold it did not use", () => {
		const reason = permittedActions(barelyDrifted(true), NOW).find(
			(o) => o.kind === "REBALANCE",
		)?.reason;
		expect(reason).toContain("An operator asked");
		expect(reason).not.toContain("threshold");
	});

	it("takes the advisor out of the loop, because an instruction is not a suggestion", () => {
		const option = permittedActions(barelyDrifted(true), NOW).find((o) => o.kind === "REBALANCE");
		expect(option?.forced).toBe(true);
	});

	/**
	 * The case that sent an operator here in the first place: a $16 position 20%
	 * off neutral, needing a $3.45 correction against a $10 minimum. Asking does
	 * not make the venue take the order, and the request must not turn a refusal
	 * into an attempt that fails every tick.
	 */
	it("still cannot place a correction the venue would refuse", () => {
		const dust = withMarket(
			{
				spotUnits: 72_087_700_000_000_000n,
				perpUnits: 57_000_000_000_000_000n,
				markPriceUsd: 228.37,
				minOrderUsd: 10,
			},
			{ rebalanceRequested: true },
		);
		const kinds = permittedActions(dust, NOW).map((o) => o.kind);
		expect(kinds).not.toContain("REBALANCE");
	});

	it("says why it could not, rather than going quiet about it", () => {
		const dust = withMarket(
			{
				spotUnits: 72_087_700_000_000_000n,
				perpUnits: 57_000_000_000_000_000n,
				markPriceUsd: 228.37,
				minOrderUsd: 10,
			},
			{ rebalanceRequested: true },
		);
		const hold = permittedActions(dust, NOW).find((o) => o.kind === "HOLD");
		expect(hold?.reason).toContain("minimum order");
	});
});

describe("the rebalance threshold", () => {
	/** 2.89% off neutral on a position where the correction is comfortably placeable. */
	const drifted = (rebalanceDriftBps: number) =>
		withMarket(
			{ spotUnits: 100n * 10n ** 18n, perpUnits: 97_110_000_000_000_000_000n },
			{ rebalanceDriftBps },
		);

	it("allows a rebalance the vault's own threshold sits below", () => {
		expect(permittedActions(drifted(100), NOW).map((o) => o.kind)).toContain("REBALANCE");
	});

	it("suppresses the same drift once the vault's threshold is raised past it", () => {
		expect(permittedActions(drifted(500), NOW).map((o) => o.kind)).not.toContain("REBALANCE");
	});

	it("quotes the vault's threshold in the reason, not the constant", () => {
		expect(
			permittedActions(drifted(100), NOW).find((o) => o.kind === "REBALANCE")?.reason,
		).toContain("1.0% threshold");
	});

	/**
	 * Five percent is where a modest position produces a placeable correction. It
	 * is only a fallback: a large vault should set it back down, because on a
	 * large position 1% of drift is real directional exposure.
	 */
	it("falls back to the shipped default when a vault names none", () => {
		expect(DEFAULT_REBALANCE_DRIFT_BPS).toBe(500);
		expect(permittedActions(drifted(0), NOW).map((o) => o.kind)).not.toContain("REBALANCE");
	});
});

/**
 * Will this position earn back what it costs to open?
 *
 * The dollar floor is a backstop, not an answer: it says a $30 spot leg is big
 * enough to be worth a swap, and says nothing at all about what the position
 * *earns*. A hedge opened into a market paying no funding is a loss from the
 * first block, at any size.
 */
describe("a deployment that would not pay for itself", () => {
	it("is refused in a market whose short side pays no funding at all", () => {
		const s = withMarket({ fundingShortPercentPerHour: 0 });
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("DEPLOY");
	});

	it("is refused in a market whose short side costs money to hold", () => {
		const s = withMarket({ fundingShortPercentPerHour: -0.01 });
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("DEPLOY");
	});

	/**
	 * Funding this thin takes about ninety days to recover a round trip, against a
	 * ceiling of thirty. Below that horizon a position is a loss dressed up as one.
	 */
	it("is refused when the round trip takes longer to earn back than the vault will wait", () => {
		const s = withMarket({ fundingShortPercentPerHour: 0.0001 });
		expect(permittedActions(s, NOW).map((o) => o.kind)).not.toContain("DEPLOY");
	});

	it("is allowed once the same market pays enough to clear the horizon", () => {
		// Enough funding that the entry is back inside the thirty-day ceiling.
		const s = withMarket({ fundingShortPercentPerHour: 0.002 });
		expect(MAX_BREAKEVEN_DAYS).toBeGreaterThan(0);
		expect(permittedActions(s, NOW).map((o) => o.kind)).toContain("DEPLOY");
	});

	it("says what the entry costs and when it is paid back", () => {
		const deploy = permittedActions(snapshot(), NOW).find((o) => o.kind === "DEPLOY");
		expect(deploy?.reason ?? "").toContain("to open, paid back in");
	});

	/**
	 * Skipped rather than returned. A market that cannot pay for itself must not
	 * hide one further down the list that can — otherwise one dead market stops
	 * the whole vault deploying.
	 */
	it("does not let a market that cannot pay for itself hide one that can", () => {
		const s = snapshot({
			markets: [
				market({ ticker: "BTC", targetWeightBps: 5_000, fundingShortPercentPerHour: 0 }),
				market({ ticker: "ETH", targetWeightBps: 5_000, fundingShortPercentPerHour: 0.002 }),
			],
		});
		expect(permittedActions(s, NOW).find((o) => o.kind === "DEPLOY")?.market).toBe("ETH");
	});
});

/**
 * Draining a retired market is a preference, not an obligation. An operator
 * would rather the capital sat somewhere else, and nothing breaks while it does
 * — so unlike a redemption, it has to be worth the trip.
 */
describe("unwinding a market an operator has retired", () => {
	const retiredHolding = (value: bigint) =>
		snapshot({
			markets: [
				market({ ticker: "BTC", targetWeightBps: 10_000 }),
				market({ ticker: "NVDA", targetWeightBps: 0, spotValueUsdc: value }),
			],
		});

	it("is left alone when it holds less than one unwind costs", () => {
		expect(
			permittedActions(retiredHolding(UNWIND_FLOOR / 2n), NOW).map((o) => o.kind),
		).not.toContain("UNWIND");
	});

	/**
	 * And that is not a problem: a tidy-up that can wait must not stop the vault
	 * deploying and rebalancing in the meantime. The next unwind that happens for
	 * a real reason takes this market first anyway — a zero target weight makes it
	 * the most overweight market the vault has.
	 */
	it("does not stop the vault working while it waits", () => {
		const kinds = permittedActions(retiredHolding(UNWIND_FLOOR / 2n), NOW).map((o) => o.kind);
		expect(kinds).toContain("DEPLOY");
		expect(kinds).toContain("HOLD");
	});

	it("is drained once it holds enough to be worth the trip", () => {
		const unwind = permittedActions(retiredHolding(UNWIND_FLOOR * 2n), NOW).find(
			(o) => o.kind === "UNWIND",
		);
		expect(unwind?.amount).toBe(UNWIND_FLOOR * 2n);
		expect(unwind?.forced).toBe(false);
		expect(unwind?.reason ?? "").toContain("Costs about");
	});
});
