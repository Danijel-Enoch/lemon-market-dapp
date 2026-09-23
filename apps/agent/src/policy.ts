import { BPS } from "@lemon/contracts";
import type { AdlRisk } from "@lemon/core";
import {
	breakevenHours,
	costOf,
	describeBreakeven,
	economicFloor,
	MAX_BREAKEVEN_DAYS,
	type TradeFrictions,
	usdcFromEnv,
} from "./economics";
import { leverageBps } from "./valuation";

/**
 * What the agent does next, and who decides.
 *
 * The split here is the whole design. A deterministic policy decides *what is
 * permissible* — how much may be deployed, how much must be unwound to clear the
 * queue, whether the hedge has drifted far enough to be worth a trade. A
 * language model decides only *whether now is a good moment* among options that
 * are already safe.
 *
 * Every number that moves money is computed in this file, in integer arithmetic,
 * from on-chain state. The model never produces an amount. It picks from an
 * enum, and its answer is checked against the same policy before anything is
 * signed. A compromised or hallucinating model can therefore make the vault
 * *idle*, or make it act at a poor moment — it cannot make it act outside the
 * mandate, and it cannot invent a size.
 */

export type ActionKind =
	/**
	 * Move idle vault USDC into one market's position — which means *adding to*
	 * the legs already there, not opening new ones. A deposit deepens the book
	 * the vault already runs.
	 */
	| "DEPLOY"
	/** Close part of the position and return USDC so redemptions can be paid. */
	| "UNWIND"
	/** Trade one market's perp leg back to its spot leg's size. */
	| "REBALANCE"
	/**
	 * Send more margin to the perp venue, to put observed leverage back under the
	 * vault's ceiling with room to spare. See `MARGIN_BUFFER_BPS`.
	 */
	| "TOP_UP_MARGIN"
	/**
	 * Close every position in every market and send all of it back to the vault.
	 *
	 * Only ever reached under an operator's standing close order, and never
	 * chosen by the advisory model — see `permittedActions`.
	 */
	| "CLOSE_ALL"
	/** Report NAV and nothing else. */
	| "HOLD";

/**
 * One market the vault runs, as the policy sees it.
 *
 * A vault used to be one market and the fields below sat directly on the
 * snapshot. They are per-market now because the two that decide anything —
 * hedge drift and routability — are properties of a market rather than of a
 * vault, and a vault-level answer to either is a lie as soon as there is more
 * than one: averaging drift across markets can report a neutral position made of
 * two badly-mismatched legs pointing opposite ways, and a single `spotBuyable`
 * flag cannot say which market is the one that cannot be routed.
 */
export interface MarketSnapshot {
	/** The market's ticker, e.g. "NVDA". Identifies it in every decision. */
	ticker: string;
	/** The Base token's own symbol, e.g. "NVDAc". For the operator's benefit. */
	symbol: string;
	/**
	 * The share of the vault's spot notional this market should carry, in bps.
	 *
	 * Zero for a market an operator has disabled, which is what drains it: a
	 * target of zero makes it the most overweight market the vault has, so it is
	 * both the first place an unwind takes from and never a place a deployment
	 * goes.
	 */
	targetWeightBps: number;
	/** What this market's spot leg is currently worth, in USDC. */
	spotValueUsdc: bigint;

	/** Units held on each leg, scaled to 1e18. Neutral means these match. */
	spotUnits: bigint;
	perpUnits: bigint;

	/** Short-side funding, percent per hour. Positive means the position earns. */
	fundingShortPercentPerHour: number;
	/** Whether this market's spot leg can currently be routed in and out. */
	spotBuyable: boolean;
	spotSellable: boolean;

	/** Live mark from the perp venue, in USD. Zero when it cannot be priced. */
	markPriceUsd: number;
	/** The venue's quantity grid, in units of the underlying. Zero when unknown. */
	lotSize: number;
	/**
	 * The venue's minimum order value, in USD. Zero when unknown.
	 *
	 * The constraint that makes a small vault's rebalance impossible rather than
	 * merely expensive, and the reason the drift threshold cannot be a single
	 * number for every vault. It is a floor on the order's dollar notional, so no
	 * amount of snapping to the lot grid satisfies it.
	 */
	minOrderUsd: number;
	/** What the aggregator estimates this market's spot swap costs in gas, USD. */
	spotGasUsd: number;
	/** What crossing this market's pool costs, as a positive percent of notional. */
	spotImpactPercent: number;

	/** Auto-deleveraging exposure on this market's short. See `VaultSnapshot.adl`. */
	adl: AdlRisk;
}

export interface VaultSnapshot {
	address: `0x${string}`;
	riskTier: "CONSERVATIVE" | "LEVERAGED";
	targetLeverageBps: number;
	maxLeverageBps: number;

	/** USDC in the vault contract that is neither deployed nor owed to a claim. */
	freeAssets: bigint;
	totalAssets: bigint;
	deployedAssets: bigint;
	maxDeployedBps: number;
	/** What remains of the agent's withdrawal allowance this window. */
	withdrawWindowRemaining: bigint;
	/**
	 * USDC sitting in the agent's own Base wallet, outside any venue.
	 *
	 * Ordinarily zero — a deployment draws capital down and spends it in the same
	 * tick. It is non-zero exactly when a deployment failed between the two, and
	 * that money is stuck in a way no other field describes: it is part of
	 * `deployedAssets` because it has left the vault, so it occupies the
	 * deployment ceiling, but it is not `freeAssets`, so nothing can withdraw it.
	 *
	 * Base only, deliberately. Idle USDC on Solana is in the valuation and not
	 * here, because a spot leg is bought on Base and margin is bridged from Base
	 * — Solana-side idle cannot fund either, and counting it would size a
	 * deployment against money the swap cannot reach.
	 */
	idleOnBase: bigint;
	/**
	 * Margin at the perp venue that is not backing any open position.
	 *
	 * Ordinarily zero: margin arrives and the short opens against it in the same
	 * call. It is non-zero when a deployment got its margin across and then failed
	 * before the short — capital that is fully committed, earning nothing, and
	 * hedging nothing.
	 *
	 * The vault cannot fix that by deploying more. What the position needs is its
	 * *spot* leg, and sizing a fresh `spot + margin` split against the remaining
	 * idle USDC would bridge yet more margin instead — which is why this is a
	 * field rather than something the deployment split could infer.
	 *
	 * A bound on what a deployment may spend, not the whole answer: margin the
	 * *venue* would let the agent spend can still be margin this vault is
	 * deliberately holding back as its buffer. See `spareMargin`.
	 */
	unallocatedMargin: bigint;

	/**
	 * The perp account's open notional and its equity, in USDC.
	 *
	 * The ratio of the two is the leverage reported on-chain, and both halves are
	 * marked to market — see `leverageBps` in `valuation.ts`. They are carried
	 * separately rather than as that ratio because a ratio cannot be turned back
	 * into the dollars of margin that would move it, and sizing a top-up is
	 * exactly that arithmetic.
	 *
	 * Account-level, across every market. Pacifica margins the account rather than
	 * the symbol, and so does the vault's mandate.
	 */
	perpNotionalUsdc: bigint;
	perpEquityUsdc: bigint;

	/** Shares queued whose delay has elapsed, and what they are worth now. */
	ripeRedeemAssets: bigint;
	/** Queued but not yet eligible. Advance warning, not yet an obligation. */
	pendingRedeemAssets: bigint;
	/** The earliest `fulfillBy` among ripe requests, as a unix timestamp. */
	earliestDeadline: number | null;

	/** Every market the vault holds or may deploy into. Never empty. */
	markets: MarketSnapshot[];

	/**
	 * Whether an operator has ordered every position closed and all capital
	 * returned to the vault.
	 *
	 * Outranks everything, including a redemption deadline — an order to return
	 * *all* of the capital already covers every redemption in the queue, so there
	 * is nothing the deadline would additionally ask for.
	 */
	closeRequested: boolean;

	/**
	 * An operator asked for the hedge to be corrected on this tick.
	 *
	 * Lowers the drift threshold to zero and nothing else. It does not bypass the
	 * venue's minimum order notional — that is a fact about Pacifica, not a
	 * policy this app sets — and it does not outrank an obligation: someone
	 * waiting to be paid still comes before a tidier hedge. What it does buy is
	 * the ordinary case, where the drift is real, correctable, and simply has not
	 * crossed a threshold chosen for a quieter market.
	 */
	rebalanceRequested: boolean;

	/**
	 * How far the legs may drift before a rebalance is worth making, in bps.
	 *
	 * Configuration rather than a constant, because the right answer depends on
	 * the size of the position relative to the venue's minimum order notional. A
	 * $32 position drifting 1% needs a $0.32 correction, which no venue will
	 * accept — so a vault that small must let drift run further before it is
	 * worth, or even possible, to act on. See `VaultConfig.rebalanceDriftBps`.
	 */
	rebalanceDriftBps: number;

	/** Pacifica's flat fee for moving margin home, in USDC. Part of unwind cost. */
	venueWithdrawalFeeUsdc: bigint;

	/**
	 * The worst auto-deleveraging exposure across the vault's markets.
	 *
	 * Carried in the snapshot but deliberately *not* gated on by
	 * `permittedActions`. There is no safe rule to write here: the score rises as
	 * the hedge wins, so refusing to deploy on a high score would stop the vault
	 * working precisely during the drawdowns when its funding is usually best,
	 * and there is no "reduce leverage" action that would help — `TOP_UP_MARGIN`
	 * moves the account's leverage but not its place in this queue, which is
	 * scored on unrealised profit rather than on margin. So it is surfaced to the
	 * advisor as judgement material and to the operator as a warning, and left
	 * there.
	 */
	adl: AdlRisk;
}

export interface Decision {
	kind: ActionKind;
	/** USDC for DEPLOY and UNWIND; zero otherwise. Always computed here. */
	amount: bigint;
	/**
	 * The market this action is aimed at, or null when it is not aimed at one.
	 *
	 * Null for HOLD and CLOSE_ALL, which are about the vault, for UNWIND, which
	 * takes from whichever markets are furthest above their target weight rather
	 * than from one the policy picked, and for TOP_UP_MARGIN, which pays into the
	 * one account that backs every market's short. Set for DEPLOY and REBALANCE,
	 * which cannot be executed without knowing which market they mean.
	 */
	market: string | null;
	reason: string;
	/** True when the policy left no room for judgement. */
	forced: boolean;
	/**
	 * Where a DEPLOY's or a TOP_UP_MARGIN's capital comes from. Null otherwise.
	 *
	 * `VAULT` is the ordinary case and draws the amount down with
	 * `agentWithdraw`. `AGENT` spends USDC the agent already holds on Base and
	 * withdraws nothing — see `resumableAmount` for why that is a case at all.
	 */
	fundedFrom: "VAULT" | "AGENT" | null;
	/**
	 * How a DEPLOY's capital divides between the two legs. Null for every other kind.
	 *
	 * Carried rather than re-derived downstream, because the split is no longer a
	 * function of the amount and the leverage. A deployment resuming against
	 * margin already sitting at the venue spends its whole budget on spot and
	 * bridges nothing; halving it again would send margin after margin while the
	 * spot leg it is supposed to hedge never gets bought.
	 */
	legs: DeploymentLegs | null;
	/**
	 * Which leg a REBALANCE moves. Null for every other kind.
	 *
	 * Carried rather than re-derived in the adapter because the choice is an
	 * economic one and this file is where those are made: `PERP` is the ordinary
	 * correction and `SPOT` is the fallback for one the venue will not accept.
	 * An adapter that decided for itself would have to re-read the venue's floors
	 * and re-price the swap, and could reach a different answer than the reason
	 * string the operator was shown. See `rebalancePlan`.
	 */
	rebalanceSide: RebalanceSide | null;
}

/** A deployment's two halves, as the amounts each venue is actually given. */
export interface DeploymentLegs {
	/** USDC to spend buying the spot leg on Base. */
	spotNotional: bigint;
	/** USDC to bridge to the perp venue as margin. Zero when it is already there. */
	perpMargin: bigint;
}

/**
 * The drift threshold a vault falls back to when its configuration names none.
 *
 * It used to be 1%, on the reasoning that below that the correction costs more
 * in fees than the drift costs in exposure. That reasoning is sound and the
 * number was still wrong, because it left out the constraint that actually
 * binds: the venue will not accept an order worth less than about ten dollars,
 * whatever the fees would have been. A 1% drift on a small position produces a
 * correction the venue rejects — so the agent decided to rebalance, placed the
 * order, was refused, and did the whole thing again sixty seconds later.
 *
 * Five percent is the floor at which a modest position produces a placeable
 * correction. It is only a default: the real value is per vault, and a large
 * vault should set it back down, because on a large position 1% of drift is real
 * directional exposure and the correction is comfortably placeable.
 *
 * See `VaultSnapshot.rebalanceDriftBps` and `VaultConfig.rebalanceDriftBps`.
 */
export const DEFAULT_REBALANCE_DRIFT_BPS = 500; // 5%

/**
 * How far below its ceiling a hedge is opened, so it has somewhere to drift.
 *
 * The leverage the contract stores is marked to market on both sides: notional
 * is `size × mark` and equity nets unrealised P&L, so a short whose underlying
 * rises gains notional and loses equity at once. A position opened at exactly
 * its ceiling reads `(1 + p) / (1 - p)` after a move of `p` — over the line on a
 * rise of a fraction of a percent, and over it from the taker fee on the opening
 * order before the price has moved at all.
 *
 * The vault it bites is the conservative one, where the contract requires target
 * and ceiling to be the same 10_000 and there is no headroom to drift into
 * (`_validateRiskProfile`). A NAV report over the ceiling reverts, and a vault
 * that cannot report goes stale — which stops deposits and stops redemptions
 * being paid. So an unlevered vault whose hedge is sized at exactly 1x cannot
 * post a valid NAV for as long as its market is above where it opened.
 *
 * The fix is in the sizing rather than in the measurement. Backing `N` of
 * notional with `N / (1 - b)` of margin opens the position at `1 - b` of the
 * ceiling, and it stays inside the mandate until
 *
 *     p  =  b / (2 * (1 - b))
 *
 * At 3% that is a 1.55% adverse move, which is a normal day for a tokenised
 * equity and several ticks' warning at a minute apiece — long enough for
 * `TOP_UP_MARGIN` to restore the buffer before the ceiling is reached.
 *
 * It is not free: the same dollar deployed buys 3% less spot leg, and funding is
 * earned on the spot leg. That is the trade — a few percent of yield for a
 * mandate the vault can actually report against.
 *
 * A vault whose ceiling already sits above its target has this headroom by
 * construction and is left alone; see `sizingLeverageBps`.
 *
 * Set `MARGIN_BUFFER_BPS` in the environment to move it. How much room a hedge
 * needs depends on how far its market moves between ticks, which is a fact about
 * the market rather than about this code.
 */
export const MARGIN_BUFFER_BPS = bpsFromEnv("MARGIN_BUFFER_BPS", 300); // 3%

/**
 * The leverage a deployment actually sizes its hedge at.
 *
 * The vault's target, unless that would leave the position with nowhere to
 * drift. A conservative vault targets 10_000 against a ceiling of 10_000, so it
 * is sized at `10_000 - MARGIN_BUFFER_BPS`; a leveraged vault targets 2x against
 * a 3x ceiling and is already 33% clear of it, so its target stands unchanged.
 *
 * Derived from the *ceiling* rather than the target, because the ceiling is what
 * rejects the report. Taking the buffer off a target that already sits well
 * below the ceiling would give up yield to buy room the vault had anyway.
 */
export function sizingLeverageBps(snapshot: {
	targetLeverageBps: number;
	maxLeverageBps: number;
}): number {
	const buffered = Math.floor((snapshot.maxLeverageBps * (BPS - MARGIN_BUFFER_BPS)) / BPS);
	return Math.min(snapshot.targetLeverageBps, buffered);
}

/**
 * The margin the open notional needs in order to sit at the sizing leverage.
 *
 * What the position is *supposed* to be backed by, as opposed to what it happens
 * to be backed by after the market moved. The difference between this and equity
 * is the whole of `spareMargin` and `marginTopUp`.
 */
function requiredMargin(snapshot: VaultSnapshot): bigint {
	if (snapshot.perpNotionalUsdc <= 0n) return 0n;
	return (snapshot.perpNotionalUsdc * BigInt(BPS)) / BigInt(sizingLeverageBps(snapshot));
}

/**
 * The part of the required margin the venue does not require for itself.
 *
 * Pacifica reserves the notional at the account's 1x setting; this vault holds
 * `notional * BPS / L` — so the difference is the buffer, and it is exactly the
 * amount the venue will report as free while this vault considers it spoken for.
 *
 * The mirror of `retainedMargin` in `venue.ts`, which keeps the same quantity
 * back when an unwind frees margin. Deployment and withdrawal have to agree on
 * it or they undo each other.
 */
function bufferMargin(snapshot: VaultSnapshot): bigint {
	const required = requiredMargin(snapshot);
	return required > snapshot.perpNotionalUsdc ? required - snapshot.perpNotionalUsdc : 0n;
}

/**
 * Margin at the venue that is genuinely free to carry more hedge.
 *
 * Not the venue's own figure. Pacifica reports what is spendable against *its*
 * margin requirement, which is the position at 1x — it knows nothing about the
 * buffer this vault holds on top, so its number counts the buffer as spare and a
 * deployment sized against it would spend the buffer on more notional and put
 * the account straight back at its ceiling.
 *
 * So it is the venue's own figure less the buffer this vault holds on top of it.
 * Taken off the venue's number rather than derived from equity on purpose: with
 * nothing open there is no buffer to hold, and the whole balance reads spare —
 * which is the case that matters most, because a deployment that bridged its
 * margin and then failed before the short is exactly the state the resumption in
 * `deploymentSources` exists to get out of, and it must not depend on an equity
 * reading agreeing with the venue's free balance to see it.
 */
export function spareMargin(snapshot: VaultSnapshot): bigint {
	const buffer = bufferMargin(snapshot);
	return snapshot.unallocatedMargin > buffer ? snapshot.unallocatedMargin - buffer : 0n;
}

/**
 * The smallest margin top-up worth bridging.
 *
 * A top-up is a bridge and a deposit with no swap on the end, so it is cheaper
 * than a deployment — but it is not free, and the shortfall that triggers one is
 * often cents. Restoring a buffer eaten by a 0.2% move on a $50 hedge is a
 * fifteen-cent transfer, and doing that on every tick would spend more in fees
 * than the vault earns in funding.
 *
 * So a top-up sends at least this much even when less would do. Overshooting
 * costs nothing that matters: the excess is equity, the valuation counts it, it
 * lands the position further below its ceiling rather than above it — which the
 * contract accepts and treats as reportable — and `spareMargin` hands it to the
 * next deployment rather than stranding it.
 */
export const MIN_TOP_UP_USDC = usdcFromEnv("MIN_TOP_UP_USDC", 5_000_000n); // $5

/**
 * The smallest spot leg worth opening.
 *
 * Measured on the *spot leg*, not on the deployment that funds it, because the
 * spot leg is what the venue has to route: below this a Kyber swap pays more in
 * fees and pool slippage than the hedge it buys can earn back in funding.
 *
 * The distinction is not pedantry. A deployment splits into `spot + margin`, so
 * a $100 deployment at 1x buys a $50 spot leg — and a gate written against the
 * total would wave through deployments the venue adapter then rejects at
 * `venue.ts`, *after* the margin has bridged to Solana. That failure strands
 * capital on the wrong chain to enforce a minimum the policy layer could have
 * enforced for free. So both layers now measure the same leg.
 *
 * Set `MIN_DEPLOY_USDC` in the environment, in dollars, to move it. The floor a
 * deployment has to clear depends on what a swap costs and on how much funding
 * the resulting hedge earns, and both are venue and market conditions rather
 * than facts about this code — so the number is a deployment choice.
 */
export const MIN_DEPLOY_USDC = usdcFromEnv("MIN_DEPLOY_USDC", 30_000_000n); // $30

/**
 * Read a basis-point setting from the environment.
 *
 * Bounded to a fraction strictly under one whole. A buffer of zero is a hedge
 * opened at its ceiling, which is the bug this exists to prevent; a buffer of
 * 10_000 or more sizes every hedge at nothing. Throws at import rather than
 * defaulting, for the reason in `usdcFromEnv`.
 */
function bpsFromEnv(name: string, fallback: number): number {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;

	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed >= BPS) {
		throw new Error(
			`${name} must be a whole number of basis points between 1 and ${BPS - 1}, got "${raw}".`,
		);
	}
	return parsed;
}

/** Unwinding is never skipped for being small — someone is waiting on it. */
export const MIN_UNWIND_USDC = 1n;

/**
 * Unwind slightly more than is owed.
 *
 * An unwind is priced when it executes and the redemption is priced when it is
 * fulfilled, and the two are minutes apart. Returning exactly the amount owed
 * means any adverse tick in between leaves the vault a few cents short and the
 * fulfilment reverts — after the position has already been closed, which is the
 * worst of both outcomes. The buffer is small enough to cost nothing and large
 * enough that this does not happen.
 */
export const UNWIND_BUFFER_BPS = 50; // 0.5%

/**
 * How close to the SLA the agent gets before it stops deliberating.
 *
 * Inside this window the queue outranks everything, including a model that
 * thinks the funding rate makes waiting attractive. A withdrawal promised in
 * seven days is a promise, not a preference.
 */
export const DEADLINE_URGENCY_SECONDS = 24 * 3600;

/**
 * Below this, a vault under a close order counts as flat.
 *
 * A position never closes to exactly zero: a perp lot grid rounds, a swap leaves
 * dust, and a bridge takes a cut nobody quotes in advance. Insisting on zero
 * would leave a close order permanently unsatisfied, and the agent trying to
 * sell a few cents of spot on every tick forever — each attempt costing more in
 * gas than the dust is worth.
 *
 * A dollar is well below the deploy minimum, so nothing this small is capital
 * the vault could put back to work anyway.
 */
export const CLOSE_DUST_USDC = 1_000_000n; // $1

/**
 * Everything the agent is *allowed* to do right now, most urgent first.
 *
 * This is the complete option set. Anything not returned here cannot happen,
 * whatever any model says — which is what makes the model's role advisory in
 * fact and not just in intention.
 */
export function permittedActions(snapshot: VaultSnapshot, now: number): Decision[] {
	const options: Decision[] = [];

	// --- the operator's standing order ------------------------------------
	//
	// First, and on its own. A close order is not a preference to be weighed
	// against a funding rate, and it is the one instruction that outranks the
	// redemption deadline — returning *all* of the capital already satisfies
	// every request in the queue, so there is nothing an urgent unwind would
	// additionally do.
	//
	// Returned as the only option in both branches, which means `decide` never
	// consults the advisory model here. A model that could talk the agent out of
	// an operator's order would make it something other than an order.

	if (snapshot.closeRequested) {
		if (!isFlat(snapshot)) {
			return [
				{
					kind: "CLOSE_ALL",
					amount: 0n,
					market: null,
					reason: `An operator has ordered every position closed. ${describeOpenMarkets(snapshot)} to sell, and ${fmt(snapshot.deployedAssets)} to bring home.`,
					forced: true,
					fundedFrom: null,
					legs: null,
					rebalanceSide: null,
				},
			];
		}

		return [
			{
				kind: "HOLD",
				amount: 0n,
				market: null,
				reason:
					"An operator's close order stands and the vault is flat. Reporting NAV and settling the queue; no capital is deployed until the order is lifted.",
				forced: true,
				fundedFrom: null,
				legs: null,
				rebalanceSide: null,
			},
		];
	}

	// --- obligations ------------------------------------------------------

	const owed = snapshot.ripeRedeemAssets;
	if (owed > 0n) {
		const shortfall = owed > snapshot.freeAssets ? owed - snapshot.freeAssets : 0n;
		if (shortfall > 0n) {
			const withBuffer = shortfall + (shortfall * BigInt(UNWIND_BUFFER_BPS)) / BigInt(BPS);
			// Capped by what can actually be sold, not by what is deployed. A market
			// whose pool has dried up holds value the NAV still counts and an unwind
			// cannot reach, and sizing against the total would ask the venue adapter
			// for more than every routable leg put together contains.
			const reachable = min(snapshot.deployedAssets, sellableValue(snapshot));
			const amount = withBuffer > reachable ? reachable : withBuffer;
			if (amount >= MIN_UNWIND_USDC) {
				const urgent =
					snapshot.earliestDeadline !== null &&
					snapshot.earliestDeadline - now <= DEADLINE_URGENCY_SECONDS;
				options.push({
					kind: "UNWIND",
					amount,
					market: null,
					fundedFrom: null,
					legs: null,
					rebalanceSide: null,
					reason: urgent
						? `${fmt(owed)} of redemptions are due within a day and the vault holds ${fmt(snapshot.freeAssets)}.`
						: `${fmt(owed)} of redemptions are eligible and the vault holds ${fmt(snapshot.freeAssets)}.`,
					// Inside the urgency window this is the only option returned,
					// so the model is not consulted at all.
					forced: urgent,
				});
				if (urgent) return options;
			}
		}
	}

	// --- markets an operator has retired ----------------------------------
	//
	// A disabled market that still holds capital is a position nobody wants any
	// more. Draining it is an ordinary unwind: the money lands back in the vault
	// and the next deployment puts it into a market that is still wanted. It is
	// offered rather than forced, because the timing is a judgement call — this
	// is not an emergency, and selling into a bad hour to satisfy a preference
	// costs the depositors real money.

	const retired = snapshot.markets.filter(
		(m) => m.targetWeightBps === 0 && m.spotValueUsdc > 0n && m.spotSellable,
	);
	if (retired.length > 0 && !options.some((o) => o.kind === "UNWIND")) {
		const amount = sum(retired.map((m) => m.spotValueUsdc));
		// Draining a retired market is a preference, not an obligation — an
		// operator would rather the capital sat somewhere else, and nothing breaks
		// while it does not. So unlike a redemption, it has to be worth the trip.
		// A retired market holding less than one unwind costs is left alone; the
		// next unwind that happens for a real reason takes it first anyway, because
		// a zero target weight makes it the most overweight market the vault has.
		const cost = costOf("unwind", amount, unwindFrictions(snapshot));

		// Below the floor there is no option at all — not a forced HOLD. This is
		// not a problem, it is a tidy-up that can wait, and the vault should carry
		// on deploying and rebalancing while it does.
		if (amount >= economicFloor(cost)) {
			options.push({
				kind: "UNWIND",
				amount,
				market: null,
				reason: `${retired.map((m) => m.ticker).join(", ")} ${retired.length === 1 ? "has" : "have"} been retired but still ${retired.length === 1 ? "holds" : "hold"} ${fmt(amount)}; unwinding returns it to the vault for the markets that are still wanted. Costs about ${fmt(cost.totalUsdc)}.`,
				forced: false,
				fundedFrom: null,
				legs: null,
				rebalanceSide: null,
			});
		}
	}

	// --- the mandate ------------------------------------------------------
	//
	// Ahead of drift and ahead of growth, because this is the one condition that
	// stops the vault reporting at all. A NAV report above the ceiling reverts,
	// and a vault whose NAV is stale takes no deposits and pays no redemptions —
	// so while this stands there is nothing else worth doing with a tick.

	const correction = mandateCorrection(snapshot);
	if (correction) {
		// A forced correction outranks everything — with one exception, and getting
		// it wrong would have been the worst kind of bug this change could
		// introduce.
		//
		// `deleverage` can now answer with a HOLD: the mandate is breached, no
		// correction pays for itself, and the honest thing is to stop churning fees
		// and say so. That is an *explanation*, not an action. Returning it as the
		// sole option the way a real correction is returned would discard the
		// redemption unwind pushed above it — so a vault too small to fix its own
		// leverage would also stop paying people who had asked for their money out,
		// which it is perfectly able to do.
		//
		// So a forced HOLD joins the list instead of replacing it. It still sits
		// ahead of drift and growth, and it is still the answer when nothing else
		// is on the list; it simply cannot outrank an obligation.
		if (correction.forced && correction.kind !== "HOLD") return [correction];
		options.push(correction);
	}

	// --- hedge health -----------------------------------------------------
	//
	// Per market, worst first. Drift is a property of a pair of legs, and there
	// is no such thing as the vault's drift: two markets a percent out in
	// opposite directions average to neutral and are both wrong.

	// Zero when an operator asked, so every drifted market is considered and the
	// venue's own limits are the only thing left to refuse it.
	const threshold = snapshot.rebalanceRequested
		? 0
		: snapshot.rebalanceDriftBps || DEFAULT_REBALANCE_DRIFT_BPS;
	/** Markets drifted past the threshold that the venue will not let us correct. */
	const blocked: string[] = [];
	const drifted = snapshot.markets
		.map((market) => ({ market, drift: driftBps(market.spotUnits, market.perpUnits) }))
		.filter(({ drift }) => Math.abs(drift) >= threshold)
		.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

	for (const { market, drift } of drifted) {
		// Whether the venue would actually take this order, asked before the action
		// is offered rather than discovered as a rejection afterwards.
		//
		// This is the difference between an agent that knows its own venue and one
		// that finds out by being refused. A correction can clear the drift
		// threshold, sit exactly on the lot grid, and still be worth less than the
		// venue's minimum order notional — at which point placing it is not a risk
		// to be managed but an outcome that cannot happen. Offering it anyway meant
		// choosing it, logging it as the tick's action, sending it, and failing, on
		// every tick, for as long as the drift stood.
		const placeable = rebalancePlan(market);
		if (!placeable.ok) {
			// Not an option, and not silent either. The drift is real, and an
			// operator reading a tick has to be able to tell "nothing is wrong" from
			// "something is wrong and the venue will not let me fix it" — which look
			// identical if this just drops the market on the floor.
			blocked.push(
				`${market.ticker} is ${(drift / 100).toFixed(2)}% off neutral but ${placeable.why}`,
			);
			continue;
		}

		// Named in the reason, because the two corrections do different things to
		// the depositor's position: one trades the hedge, the other sells part of
		// the holding the hedge is against.
		const move =
			placeable.side === "PERP"
				? `its perp leg needs to move ${placeable.correctionUsd} to match its spot leg`
				: `the venue will not accept a correction that small on the perp leg, so ${placeable.correctionUsd} of spot is sold down to match the short instead`;

		options.push({
			kind: "REBALANCE",
			amount: 0n,
			market: market.ticker,
			reason: snapshot.rebalanceRequested
				? `An operator asked for a correction: the ${market.ticker} hedge is ${(drift / 100).toFixed(2)}% off neutral, and ${move}.`
				: `The ${market.ticker} hedge is ${(drift / 100).toFixed(2)}% off neutral against a ${(threshold / 100).toFixed(1)}% threshold; ${move}.`,
			// Forced when asked for by hand, which takes the advisor out of the loop:
			// an operator's instruction is not a suggestion for a model to weigh
			// against doing nothing. It still cannot outrank the obligations above,
			// which have already returned by the time this runs.
			forced: snapshot.rebalanceRequested,
			fundedFrom: null,
			legs: null,
			rebalanceSide: placeable.side,
		});
	}

	// --- growth -----------------------------------------------------------

	const deploy = nextDeployment(snapshot);
	if (deploy) options.push(deploy);

	// The catch-all, unless something above already answered "do nothing" for a
	// specific reason. A breached vault that cannot afford to correct itself
	// pushes its own HOLD explaining exactly that, and appending this one after it
	// would put two HOLDs on the list whose reasons contradict each other — "the
	// NAV is stale and no correction pays for itself" followed by "nothing needs
	// doing". The first is true and the second is not.
	if (!options.some((o) => o.kind === "HOLD")) {
		options.push({
			kind: "HOLD",
			amount: 0n,
			market: null,
			// A hold with a blocked rebalance behind it is not the same event as a
			// quiet tick, and the tick log prints this line. Saying so here is what
			// stops a vault whose hedge the venue refuses to let it maintain from
			// reading, minute after minute, as a vault with nothing to do.
			// Deliberately not "this clears itself as the position grows", which is
			// what it used to say and was not true. A gap the venue will not let
			// the perp leg close is fixed in *units*: deployments add matched legs
			// either side of it, so growth leaves its dollar value untouched and
			// only a move in the underlying can lift it over the floor. Every
			// other refusal above — an unroutable pool, a correction not worth its
			// gas — does clear on its own, so neither reading is safe to assume
			// and the honest line names none.
			reason: blocked.length
				? `Nothing can be done this tick: ${blocked.join("; ")}. Reporting NAV and waiting.`
				: "Nothing needs doing; report NAV and wait.",
			forced: false,
			fundedFrom: null,
			legs: null,
			rebalanceSide: null,
		});
	}

	return options;
}

/** Which leg a correction is made on. See `rebalancePlan`. */
export type RebalanceSide = "PERP" | "SPOT";

/**
 * Why the perp venue would refuse this correction, or null if it would take it.
 *
 * Two floors, in two different units, and an order has to clear both. The lot
 * grid bounds the *quantity*: a correction finer than one lot cannot be
 * expressed, so the legs are already as close as this market allows. The minimum
 * order size bounds the *dollar notional*: a correction can be a clean multiple
 * of the lot grid and still be refused for being worth too little.
 *
 * A missing figure is read as "no floor" rather than as a reason to refuse.
 * Neither is a safety limit — they are the venue's own rules, and if the venue
 * has not stated one, inventing a stricter one here would stop a hedge being
 * maintained to enforce a constraint that does not exist.
 */
function perpRefusal(market: MarketSnapshot, correctionUnits: number, correctionUsd: number) {
	if (market.lotSize > 0 && Math.floor(correctionUnits / market.lotSize) < 1) {
		return `a ${correctionUnits} correction is finer than the venue's ${market.lotSize} lot grid`;
	}
	if (market.minOrderUsd > 0 && correctionUsd < market.minOrderUsd) {
		return `the correction is worth $${correctionUsd.toFixed(2)}, under the venue's $${market.minOrderUsd} minimum order`;
	}
	return null;
}

/**
 * Which leg, if either, can express this market's correction.
 *
 * **The perp leg first, and the spot leg only when it cannot.** Correcting on
 * the perp is one signed API call: no chain, no pool, no gas, and the spot
 * holding — which is what earns the funding — is left alone. Correcting on the
 * spot side sells the holding down instead, which costs a swap and shrinks the
 * position. So it is a fallback, not a choice, and it is offered only once the
 * venue has refused the cheaper correction outright.
 *
 * The fallback exists because the venue's refusal is permanent, not a wait. A
 * correction under Pacifica's minimum order notional does not become placeable
 * by sitting there: the gap is fixed in *units*, so growth does not raise its
 * dollar value and the drift stands until the price of the underlying moves far
 * enough to lift it over the floor on its own. A vault left in that state holds
 * unhedged delta indefinitely — which is exactly what a half-executed unwind
 * produces, where the short was reduced and the spot sale behind it failed.
 * `closeLeg` already promises the operator that "the next tick rebalances it";
 * without this that promise cannot be kept for any gap under ten dollars.
 *
 * **Sell-only.** The fallback handles an excess of *spot*, which is the drift a
 * failed close leaves behind and the direction lot-snapping biases towards.
 * The mirror case — more short than spot — would have to *buy* spot, which
 * spends capital the vault may not have and which `nextDeployment` already
 * sizes properly when it does. Refusing it here leaves that to the path that
 * can fund it.
 */
function rebalancePlan(
	market: MarketSnapshot,
): { ok: true; side: RebalanceSide; correctionUsd: string } | { ok: false; why: string } {
	const deltaUnits = market.spotUnits - market.perpUnits;
	const magnitude = deltaUnits < 0n ? -deltaUnits : deltaUnits;
	if (magnitude === 0n) return { ok: false, why: "the legs already match" };

	if (market.markPriceUsd <= 0) {
		return { ok: false, why: "the perp leg has no mark to size the correction against" };
	}

	// Units here are the 1e18 basis the two legs are made comparable in, which is
	// what the venue adapter also places the order in.
	const correctionUnits = Number(magnitude) / 1e18;
	const correctionUsd = correctionUnits * market.markPriceUsd;
	const refusal = perpRefusal(market, correctionUnits, correctionUsd);
	if (!refusal) {
		return { ok: true, side: "PERP", correctionUsd: `$${correctionUsd.toFixed(2)}` };
	}

	// Only an excess of spot can be corrected by selling it, and only if there is
	// a pool to sell into. An unroutable leg is not a smaller problem than a
	// refused order, it is the same one.
	if (deltaUnits < 0n) return { ok: false, why: refusal };
	if (!market.spotSellable) {
		return { ok: false, why: `${refusal}, and its spot leg cannot be routed either` };
	}

	// Valued at the *spot* price rather than the mark, because a spot sale is
	// what this would be. The two differ by the basis the vault exists to earn,
	// and on a tokenised equity that is routinely a percent or more.
	if (market.spotUnits <= 0n) return { ok: false, why: refusal };
	const correctionUsdc = (market.spotValueUsdc * magnitude) / market.spotUnits;

	// Worth the trip, on the same test every other action faces. A swap's cost is
	// flat, so below this floor the correction is mostly fee — and unlike the
	// venue's minimum, this one really does clear as the position grows.
	const cost = costOf("rebalanceSpot", correctionUsdc, {
		spotImpactPercent: market.spotImpactPercent,
		spotGasUsdc: BigInt(Math.round(market.spotGasUsd * 1e6)),
		withdrawalFeeUsdc: 0n,
	});
	const floor = economicFloor(cost);
	if (correctionUsdc < floor) {
		return {
			ok: false,
			why: `${refusal}, and selling ${fmt(correctionUsdc)} of spot instead costs about ${fmt(cost.fixedUsdc)} in fixed fees, so it is not worth the trip either`,
		};
	}

	return { ok: true, side: "SPOT", correctionUsd: fmt(correctionUsdc) };
}

/**
 * Bring the account back inside the mandate, if it has left it — or nothing.
 *
 * Two corrections, and the cheap one is tried first. Adding margin leaves the
 * position alone and costs a bridge; shrinking the position costs slippage and
 * taker fees on both legs and gives up the funding the closed part was earning.
 * So the second only runs when the first cannot be funded *and* the ceiling is
 * genuinely breached — a warning the vault cannot afford to act on is left as a
 * warning, because the buffer still has room in it.
 *
 * Mark-to-market drift eats the buffer that `sizingLeverageBps` opened the hedge
 * with, and the only thing that puts it back without touching the position is
 * more margin. Notional is left alone deliberately: selling spot and buying back
 * perp would lower leverage too, but it also shrinks the position the depositors
 * are paid funding on, and it pays two sets of trading fees to do what one
 * transfer does.
 *
 * **Half the buffer, not all of it.** Waiting until the ceiling is actually
 * breached means every tick between the breach and the margin landing is a tick
 * with a stale NAV, and a bridge is minutes. Acting at the halfway line keeps
 * the correction ahead of the failure, and the half that remains is what covers
 * the crossing.
 *
 * Forced once the ceiling is genuinely breached, because at that point the
 * report is already reverting and no other action restores it.
 */
function mandateCorrection(snapshot: VaultSnapshot): Decision | null {
	// Nothing open is nothing to be over-levered on. This also keeps a vault that
	// has bridged margin but not yet opened its short — equity with no notional,
	// which reads as infinitely under-levered — out of this branch entirely.
	if (snapshot.perpNotionalUsdc <= 0n) return null;

	const sized = sizingLeverageBps(snapshot);
	const ceiling = snapshot.maxLeverageBps;
	const observed = leverageBps(snapshot.perpNotionalUsdc, snapshot.perpEquityUsdc);

	// Midway between where the hedge was sized and where the report fails. On a
	// vault whose ceiling already sits above its target this is a long way up,
	// which is correct: that vault was never short of room.
	const actAt = sized + Math.floor((ceiling - sized) / 2);
	if (observed <= actAt) return null;

	const breached = observed > ceiling;

	const topUp = marginTopUp(snapshot, { sized, ceiling, observed, breached });
	if (topUp) return topUp;

	// Nothing to top up with. While the mandate still holds that is simply a
	// warning the vault cannot act on yet — the buffer has room left and the next
	// deployment or unwind will restore it in passing.
	if (!breached) return null;

	// Once it is actually breached, doing nothing is not available: the report is
	// reverting and the vault is stale. If the margin cannot go up, the notional
	// has to come down.
	return deleverage(snapshot, { sized, ceiling, observed });
}

/**
 * Restore the buffer by adding margin — the cheap correction, when it is funded.
 */
function marginTopUp(
	snapshot: VaultSnapshot,
	state: { sized: number; ceiling: number; observed: number; breached: boolean },
): Decision | null {
	const { sized, ceiling, observed, breached } = state;

	const shortfall = requiredMargin(snapshot) - snapshot.perpEquityUsdc;
	if (shortfall <= 0n) return null;

	// The same ordering a deployment uses, and for the same reason: capital that
	// has already left the vault is spent before any more is drawn out of it.
	//
	// A breach also outranks the reason `resumableAmount` holds idle USDC back.
	// That rule keeps the cheapest capital available for the redemption queue —
	// but a vault that cannot report its NAV cannot fulfil a redemption at all, so
	// hoarding the money for the queue is what keeps the queue unpaid.
	//
	// Tried in turn rather than picked once. The vault source is bounded by the
	// deployment ceiling, and a vault at that ceiling with capital stranded at its
	// agent is exactly the state where the second source is zero and the first is
	// not — choosing between them up front would find nothing to spend.
	const sources: Array<{ fundedFrom: "AGENT" | "VAULT"; available: bigint }> = [
		{
			fundedFrom: "AGENT",
			available: breached ? snapshot.idleOnBase : resumableAmount(snapshot),
		},
		{ fundedFrom: "VAULT", available: deployableAmount(snapshot) },
	];

	// Only a top-up that actually clears the shortfall is worth making. A partial
	// one pays the bridge, leaves the report still reverting, and comes back next
	// tick asking for the rest.
	const source = sources.find((s) => s.available >= shortfall);
	if (!source) return null;

	// At least the floor, so a fifteen-cent correction does not cost a bridge.
	// Capped at what is there, which is never below the shortfall by the line above.
	const amount = min(source.available, shortfall > MIN_TOP_UP_USDC ? shortfall : MIN_TOP_UP_USDC);

	return {
		kind: "TOP_UP_MARGIN",
		amount,
		market: null,
		reason: breached
			? `The perp account is at ${(observed / 10_000).toFixed(4)}x against a ${(ceiling / 10_000).toFixed(2)}x ceiling, so the NAV report is being rejected and the vault is going stale. ${fmt(amount)} of margin puts it back at ${(sized / 10_000).toFixed(2)}x.`
			: `The perp account has drifted to ${(observed / 10_000).toFixed(4)}x, more than half way from the ${(sized / 10_000).toFixed(2)}x it was opened at to its ${(ceiling / 10_000).toFixed(2)}x ceiling. ${fmt(amount)} of margin restores the buffer before a report is rejected.`,
		forced: breached,
		fundedFrom: source.fundedFrom,
		legs: null,
		rebalanceSide: null,
	};
}

/**
 * Bring the mandate back by shrinking the position, when margin cannot be added.
 *
 * The case that makes this necessary is the ordinary end state of a healthy
 * vault: fully deployed. `deployableAmount` is then zero because the deployment
 * ceiling is full, and there is no idle USDC at the agent because a working
 * deployment leaves none — so a breach at that moment has nothing to fund a
 * top-up with, and without this the vault would stay stale until someone
 * deposited into it.
 *
 * An unwind cures it from the other side. Closing part of the position takes the
 * notional down while equity stays where it is — the loss it realises was
 * already marked — so the ratio falls. It also returns capital to the vault,
 * which refills `freeAssets` and reopens the deployment ceiling, so the cheap
 * correction is available again next time.
 *
 * Sized to land back at the sizing leverage rather than just inside the ceiling.
 * Closing only enough to scrape under the line pays a full set of trading fees
 * to buy no room at all, and the next tick would be here again.
 *
 * Deliberately last. This is the expensive correction — it pays spot slippage
 * and a taker fee on both legs, and it shrinks the position the depositors are
 * paid funding on. It exists because the alternative is a vault that has stopped
 * working, not because it is a good trade.
 */
function deleverage(
	snapshot: VaultSnapshot,
	state: { sized: number; ceiling: number; observed: number },
): Decision | null {
	const { sized, ceiling, observed } = state;

	// The notional that equity can carry at the sizing leverage, and so how much
	// of it has to go. Equity at or below zero carries nothing, which is a
	// position being liquidated rather than one being rebalanced — the whole
	// sellable holding is the most this can ask for either way.
	const carriable =
		snapshot.perpEquityUsdc > 0n ? (snapshot.perpEquityUsdc * BigInt(sized)) / BigInt(BPS) : 0n;
	const excess = snapshot.perpNotionalUsdc > carriable ? snapshot.perpNotionalUsdc - carriable : 0n;
	if (excess <= 0n) return null;

	// The same slack an ordinary unwind carries, for the same reason: the close is
	// priced when it executes and the position is measured again on the next tick,
	// and landing a cent short leaves the report still reverting after the trade
	// has already been paid for.
	const withBuffer = excess + (excess * BigInt(UNWIND_BUFFER_BPS)) / BigInt(BPS);

	// Only what can actually be sold. A market whose pool has dried up holds
	// notional this cannot reach, and asking the adapter for more than every
	// routable leg contains would size an order against value it cannot raise.
	const reachable = sellableValue(snapshot);

	// **Round the correction up to something worth the trip.**
	//
	// This is where a $32 vault was closing $0.49 of position every sixty seconds.
	// The arithmetic above is right — $0.49 is exactly what the breach needs — and
	// acting on it was still wrong, because the amount a correction *needs* to be
	// and the amount it is *worth making* are different questions. Closing $0.49
	// commits four Base transactions, a Pacifica withdrawal and a cross-chain
	// crossing, all of whose costs are flat: they are the same whether the trip
	// moves fifty cents or fifty dollars.
	//
	// So the fixed cost sets a floor, and the correction is rounded up to clear
	// it. That is strictly better than doing the minimum: closing more takes the
	// account further below its ceiling, which buys room to drift rather than
	// landing back on the line, and returns more capital to the vault — which
	// refills `freeAssets` and reopens the cheap correction for next time.
	const cost = costOf("unwind", withBuffer, unwindFrictions(snapshot));
	const floor = economicFloor(cost);
	const worthwhile = withBuffer > floor ? withBuffer : floor;
	const amount = min(worthwhile, reachable);

	if (amount < MIN_UNWIND_USDC) return null;

	// The whole sellable position is smaller than one economic trip. Selling it
	// would cost more than the breach is worth and leave the vault holding
	// nothing — so the honest answer is to stop, and to say why loudly enough
	// that an operator closes the position or funds it properly. Doing nothing
	// leaves the NAV stale, which is bad; churning the last of the capital into
	// fees to avoid that is worse, and it does not fix the breach either.
	if (amount < floor) {
		return {
			kind: "HOLD",
			amount: 0n,
			market: null,
			reason: `The perp account is at ${(observed / 10_000).toFixed(4)}x against a ${(ceiling / 10_000).toFixed(2)}x ceiling, but the whole sellable position is ${fmt(reachable)} and one unwind costs about ${fmt(cost.fixedUsdc)} in fixed fees — so no correction here pays for itself. The NAV stays stale until margin is added or an operator closes the vault. Cost: ${cost.breakdown}.`,
			forced: true,
			fundedFrom: null,
			legs: null,
			rebalanceSide: null,
		};
	}

	return {
		kind: "UNWIND",
		amount,
		market: null,
		reason: `The perp account is at ${(observed / 10_000).toFixed(4)}x against a ${(ceiling / 10_000).toFixed(2)}x ceiling and there is nothing spare to add as margin, so the NAV report is being rejected and the vault is going stale. Closing ${fmt(amount)}${amount > withBuffer ? ` — more than the ${fmt(withBuffer)} strictly needed, because a smaller close costs the same ${fmt(cost.fixedUsdc)} in fixed fees and would be back next tick` : ""} takes the notional down to what the margin already there can carry at ${(sized / 10_000).toFixed(2)}x, and returns the proceeds to the vault.`,
		forced: true,
		fundedFrom: null,
		legs: null,
		rebalanceSide: null,
	};
}

/**
 * What an unwind's spot leg will cost, taken from the market it will sell into.
 *
 * The worst sellable market rather than an average: an unwind takes from
 * whichever legs are furthest above their target weight, the policy does not
 * know in advance which those are, and pricing the cheapest one would understate
 * the cost of every unwind that turns out to touch a thin pool.
 */
function unwindFrictions(snapshot: VaultSnapshot): TradeFrictions {
	const sellable = snapshot.markets.filter((m) => m.spotSellable);
	return {
		spotImpactPercent: sellable.reduce((worst, m) => Math.max(worst, m.spotImpactPercent), 0),
		spotGasUsdc: BigInt(
			Math.round(sellable.reduce((worst, m) => Math.max(worst, m.spotGasUsd), 0) * 1e6),
		),
		withdrawalFeeUsdc: snapshot.venueWithdrawalFeeUsdc,
	};
}

/**
 * The deployment to make now, into the market that most needs it — or nothing.
 *
 * **One market per tick, not a slice into each.** The obvious alternative is to
 * split the idle capital across every underweight market at once, and it is
 * wrong for a reason that has nothing to do with tidiness: a deployment is a
 * bridge, a leverage change, a perp order and a swap, across two chains and a
 * third venue's matching engine, and there is no atomic form of it. Doing that
 * four times in one tick means four independent ways to end up half-open, and a
 * partial failure whose recovery depends on which of the four got how far.
 *
 * Filling the most underweight market each tick converges on the target weights
 * anyway — ticks are a minute apart and capital arrives over hours — and every
 * tick either completes one clean deployment or fails one, with nothing in
 * between to reason about.
 */
/**
 * The next deployment, from whichever source can fund one.
 *
 * The agent's own idle USDC is tried first. It is capital that has already left
 * the vault, so spending it breaches no limit the vault has — `deployedAssets`
 * counts it either way, and turning it into a spot leg and margin moves nothing
 * across the vault's boundary. Withdrawing more, by contrast, is bounded by
 * three ceilings, and one of them is exhausted by this very money.
 *
 * That ordering is what unwedges a vault whose deployment failed after
 * `agentWithdraw`. The drawn-down capital fills the deployment ceiling while
 * sitting in the agent's wallet doing nothing, so `deployableAmount` is zero and
 * every subsequent tick recomputes the same zero forever. Nothing in the policy
 * used to be able to name that money, so nothing could spend it.
 */
function nextDeployment(snapshot: VaultSnapshot): Decision | null {
	for (const source of deploymentSources(snapshot)) {
		const decision = deploymentFrom(snapshot, source);
		// Falls through rather than returning null: a source can be real and still
		// too small for any market's floor, and that must not stop a later source
		// which is large enough.
		if (decision) return decision;
	}
	return null;
}

/** Capital a deployment could be built from, best first. */
interface DeploymentSource {
	fundedFrom: "VAULT" | "AGENT";
	legs: DeploymentLegs;
	/** The opening clause of the decision's reason, naming where the money is. */
	where: string;
}

/**
 * Every way the vault could fund a deployment right now, in the order to try.
 *
 * Three, and the order is the whole point.
 *
 * **Margin already at the venue comes first.** It is the most committed capital
 * the vault has — bridged, deposited, and hedging nothing — and the only thing
 * that completes it is its spot leg. So that source spends its entire budget on
 * spot and bridges nothing. Splitting it fresh would send *more* margin after
 * the margin already stranded there, and every retry would skew the position
 * further from neutral while never buying the spot it is missing.
 *
 * **Then the agent's own idle USDC**, which has left the vault and occupies the
 * deployment ceiling without being withdrawable — see `resumableAmount`.
 *
 * **Then the vault**, the ordinary case, bounded by the three ceilings in
 * `deployableAmount`.
 */
function deploymentSources(snapshot: VaultSnapshot): DeploymentSource[] {
	const sources: DeploymentSource[] = [];
	// Sized with the buffer, throughout. Splitting at the bare target would open
	// every hedge at its ceiling, which is the state `MARGIN_BUFFER_BPS` exists to
	// keep the vault out of.
	const sizing = sizingLeverageBps(snapshot);
	const leverage = BigInt(sizing);
	const idle = resumableAmount(snapshot);

	const spare = spareMargin(snapshot);
	if (idle > 0n && spare > 0n) {
		// What that margin can hedge at the vault's leverage, capped by the USDC
		// actually on hand to buy it with. Anything left over stays idle for the
		// next tick rather than being bridged into margin nothing is hedging.
		const carriable = (spare * leverage) / BigInt(BPS);
		sources.push({
			fundedFrom: "AGENT",
			legs: { spotNotional: min(idle, carriable), perpMargin: 0n },
			where: `${fmt(spare)} of margin is already at the venue with nothing hedging it`,
		});
	}

	if (idle > 0n) {
		sources.push({
			fundedFrom: "AGENT",
			legs: splitDeployment(idle, sizing),
			where: `${fmt(idle)} drawn down by an earlier deployment is sitting in the agent's Base wallet`,
		});
	}

	const deployable = deployableAmount(snapshot);
	if (deployable > 0n) {
		sources.push({
			fundedFrom: "VAULT",
			legs: splitDeployment(deployable, sizing),
			where: `${fmt(deployable)} is idle`,
		});
	}

	return sources;
}

function deploymentFrom(snapshot: VaultSnapshot, source: DeploymentSource): Decision | null {
	const incoming = source.legs.spotNotional;
	if (incoming <= 0n) return null;

	// Weights are measured on spot notional, which is the exposure they are
	// about. Margin is not divided per market — it is one Pacifica account —
	// so weighting the deployment total instead would make a market's share
	// depend on the vault's leverage rather than on what an operator chose.
	const held = sum(snapshot.markets.map((m) => m.spotValueUsdc));
	const projected = held + incoming;

	const candidates = snapshot.markets
		.filter((market) => market.spotBuyable && market.targetWeightBps > 0)
		.map((market) => {
			const target = (projected * BigInt(market.targetWeightBps)) / BigInt(BPS);
			return { market, room: target > market.spotValueUsdc ? target - market.spotValueUsdc : 0n };
		})
		.filter(({ room }) => room > 0n)
		// Furthest below its share first. Ties go to the higher weight, which
		// keeps the order stable rather than depending on the array's order.
		.sort((a, b) =>
			a.room === b.room
				? b.market.targetWeightBps - a.market.targetWeightBps
				: a.room < b.room
					? 1
					: -1,
		);

	for (const { market, room } of candidates) {
		// Capped at the market's own room so a single tick cannot overshoot the
		// weights, and at what is actually deployable so it cannot overshoot the
		// contract's limits. Whatever is left over stays idle and goes into the
		// next-most-underweight market on the following tick.
		const spend = min(room, incoming);
		if (spend < MIN_DEPLOY_USDC) continue;

		// **Will this position earn back what it costs to open?**
		//
		// The dollar floor above is a backstop, not an answer. It says a $30 spot
		// leg is big enough to be worth a swap, which was only ever a guess about
		// fees, and it says nothing at all about the other half of the trade: what
		// the position *earns*. A hedge opened into a market paying no funding is a
		// loss from the first block, at any size.
		//
		// So the floor stays — an economic model that fails should fail closed —
		// and this asks the question the floor cannot. Both have to pass.
		const cost = costOf("deploy", spend, {
			spotImpactPercent: market.spotImpactPercent,
			spotGasUsdc: BigInt(Math.round(market.spotGasUsd * 1e6)),
			withdrawalFeeUsdc: 0n,
		});
		const payback = breakevenHours(cost.totalUsdc, spend, market.fundingShortPercentPerHour);
		if (payback === null || payback > MAX_BREAKEVEN_DAYS * 24) {
			// Skipped rather than returned, so a market that cannot pay for itself
			// does not hide one further down the list that can.
			continue;
		}

		// Trimming to the market's room shrinks the spot leg, and the margin has to
		// follow it or the position opens over-hedged. A source that bridges
		// nothing stays at zero: there is no margin to scale, and the spot leg is
		// already bounded by what the existing margin can carry.
		const sizing = sizingLeverageBps(snapshot);
		const legs: DeploymentLegs =
			source.legs.perpMargin === 0n
				? { spotNotional: spend, perpMargin: 0n }
				: splitDeployment(deploymentFor(spend, sizing), sizing);

		return {
			kind: "DEPLOY",
			amount: legs.spotNotional + legs.perpMargin,
			market: market.ticker,
			reason: `${source.where}, ${market.ticker} is ${fmt(room)} below its ${(market.targetWeightBps / 100).toFixed(0)}% share, and it pays ${(market.fundingShortPercentPerHour * 24 * 365).toFixed(1)}% annualised — ${fmt(cost.totalUsdc)} to open, paid back in ${describeBreakeven(payback)}.`,
			forced: false,
			fundedFrom: source.fundedFrom,
			legs,
			rebalanceSide: null,
		};
	}

	return null;
}

/**
 * How much of the agent's own idle USDC may be put to work right now.
 *
 * No ceiling applies to it, for the reason in `nextDeployment` — but one
 * condition does. Idle USDC at the agent is a single transfer from being
 * `freeAssets` again; the same money inside a hedge is an unwind away. So while
 * the vault cannot cover what its queue already owes, this is the cheapest
 * capital it has to pay redemptions with, and locking it into a position is the
 * wrong move however good the funding looks.
 */
export function resumableAmount(snapshot: VaultSnapshot): bigint {
	const committed = snapshot.ripeRedeemAssets + snapshot.pendingRedeemAssets;
	if (snapshot.freeAssets < committed) return 0n;
	return snapshot.idleOnBase;
}

/**
 * Whether the vault holds nothing that a close order would still be asking for.
 *
 * Both halves have to be true, and each catches a state the other reads as done.
 * Empty legs with capital still at the agent's wallets is a position sold and
 * not sent home — the depositors' money is out of the vault, and `freeAssets`
 * cannot pay a redemption out of it. Capital back in the vault while a leg is
 * still open is the reverse, and the leg is exposure nobody asked to keep.
 */
export function isFlat(snapshot: VaultSnapshot): boolean {
	const legsOpen = snapshot.markets.some((m) => m.spotUnits > 0n || m.perpUnits > 0n);
	return !legsOpen && snapshot.deployedAssets <= CLOSE_DUST_USDC;
}

/** What every market whose spot leg can currently be sold is worth, together. */
function sellableValue(snapshot: VaultSnapshot): bigint {
	return sum(snapshot.markets.filter((m) => m.spotSellable).map((m) => m.spotValueUsdc));
}

/** "NVDA and BTC hold $12,400" — the open half of a close order, for its reason. */
function describeOpenMarkets(snapshot: VaultSnapshot): string {
	const open = snapshot.markets.filter((m) => m.spotUnits > 0n || m.perpUnits > 0n);
	if (open.length === 0) return "There is nothing left";

	const value = sum(open.map((m) => m.spotValueUsdc));
	const names = open.map((m) => m.ticker);
	const list =
		names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
	return `${list} ${open.length === 1 ? "holds" : "hold"} ${fmt(value)}`;
}

/**
 * How much idle USDC may be deployed right now.
 *
 * Three separate ceilings, and the smallest wins. Two of them are the contract's
 * own limits, recomputed here so the agent does not discover them as a revert —
 * a reverted transaction still costs gas and, more importantly, still counts as
 * a failed tick that the operator has to read a trace to understand.
 */
export function deployableAmount(snapshot: VaultSnapshot): bigint {
	const ceiling = (snapshot.totalAssets * BigInt(snapshot.maxDeployedBps)) / BigInt(BPS);
	const headroom = ceiling > snapshot.deployedAssets ? ceiling - snapshot.deployedAssets : 0n;

	// Money already owed to a fulfilled or ripening redemption is not idle, even
	// though it sits in the same balance.
	const committed = snapshot.ripeRedeemAssets + snapshot.pendingRedeemAssets;
	const uncommitted = snapshot.freeAssets > committed ? snapshot.freeAssets - committed : 0n;

	return min(min(headroom, uncommitted), snapshot.withdrawWindowRemaining);
}

/**
 * Hedge drift in basis points, measured in units rather than dollars.
 *
 * A dollar-denominated check reports fresh drift on every tick — the two legs
 * are priced by different venues that disagree by a few basis points at all
 * times — and would have the agent rebalancing a position that never moved.
 * Measured in units, a neutral position reads as neutral at any price, so a
 * non-zero number here is always real: a rounding to the venue's lot grid, a
 * partial fill, or an ADL.
 */
export function driftBps(spotUnits: bigint, perpUnits: bigint): number {
	if (spotUnits === 0n) return perpUnits === 0n ? 0 : Number(BPS);
	const diff = spotUnits - perpUnits;
	return Number((diff * BigInt(BPS)) / spotUnits);
}

/**
 * Size the perp leg for a given spot notional under this vault's mandate.
 *
 * At 1x the short is fully collateralised and the two legs cost the same. At 3x
 * the same hedge needs a third of the margin, which is where the extra yield
 * comes from and also where the liquidation price appears.
 */
export function perpMarginFor(spotNotional: bigint, leverageBps: number): bigint {
	if (leverageBps <= 0) throw new Error("Leverage must be positive");
	return (spotNotional * BigInt(BPS)) / BigInt(leverageBps);
}

/**
 * Split a deployment between the two legs.
 *
 * The legs must carry equal *notional* to be neutral, but they do not consume
 * equal capital once the perp is levered. Solving `spot + spot/L = total` gives
 * the spot notional that leaves exactly enough for its own hedge:
 *
 *     spot = total * L / (L + 1)
 *
 * Getting this wrong is not a rounding matter. Splitting a levered deployment
 * evenly leaves the position over-hedged on one side and idle capital on the
 * other, and the vault would be paying funding on a position it did not intend.
 */
export function splitDeployment(
	total: bigint,
	leverageBps: number,
): { spotNotional: bigint; perpMargin: bigint } {
	const l = BigInt(leverageBps);
	const one = BigInt(BPS);
	const spotNotional = (total * l) / (l + one);
	return { spotNotional, perpMargin: total - spotNotional };
}

/**
 * The deployment that buys a given spot notional — `splitDeployment` backwards.
 *
 * Needed because a multi-market vault sizes its deployments from the target
 * *weights*, which are shares of spot notional, while the vault is asked for a
 * *total* that then gets split. Rearranging `spot = total * L / (L + 1)`:
 *
 *     total = spot * (L + 1) / L
 *
 * Rounded up, deliberately. Rounding down leaves the resulting split one unit
 * short of the spot notional that was asked for, which is invisible on a single
 * deployment and accumulates into a market that never quite reaches its weight.
 */
export function deploymentFor(spotNotional: bigint, leverageBps: number): bigint {
	if (leverageBps <= 0) throw new Error("Leverage must be positive");
	const l = BigInt(leverageBps);
	const numerator = spotNotional * (l + BigInt(BPS));
	return (numerator + l - 1n) / l;
}

// ---------------------------------------------------------------------------
// The advisory layer
// ---------------------------------------------------------------------------

export interface Advice {
	kind: ActionKind;
	/**
	 * Which market the answer meant, when the option list offered a choice.
	 *
	 * A multi-market vault can have several permitted actions of the same kind —
	 * two markets both drifted past the rebalance threshold, say — and an answer
	 * naming only "REBALANCE" cannot say which. Omitted or unrecognised falls
	 * back to the policy's own ordering for that kind, which is worst-first.
	 */
	market?: string | null;
	rationale: string;
	/** True when the model was not consulted, or could not be reached. */
	fellBack: boolean;
}

export interface AdviceRequest {
	snapshot: VaultSnapshot;
	options: Decision[];
	now: number;
}

export type Advisor = (request: AdviceRequest) => Promise<Advice>;

/**
 * Choose an action, using the model only where it can help.
 *
 * The model is skipped entirely when there is one option, or when the single
 * option is forced. Asking a language model to confirm a foregone conclusion
 * adds latency, cost, and a failure mode, and buys nothing.
 *
 * Its answer is then re-checked against the option list. An answer naming an
 * action that is not permitted is discarded rather than argued with — the
 * fallback is the policy's own first choice, which is the most urgent
 * permitted action.
 */
export async function decide(
	snapshot: VaultSnapshot,
	now: number,
	advisor: Advisor | null,
): Promise<Decision & { rationale: string; advised: boolean }> {
	const options = permittedActions(snapshot, now);
	const fallback = options[0];

	if (!advisor || options.length === 1 || fallback.forced) {
		return { ...fallback, rationale: fallback.reason, advised: false };
	}

	try {
		const advice = await advisor({ snapshot, options, now });
		// Matched on the market when the answer named one and it is on the list,
		// and on the kind alone otherwise. Never on a market the policy did not
		// offer: an answer of "DEPLOY into a market that is fully weighted" is
		// discarded the same way an unpermitted kind is.
		const named = advice.market?.toUpperCase();
		const chosen =
			(named ? options.find((o) => o.kind === advice.kind && o.market === named) : undefined) ??
			options.find((o) => o.kind === advice.kind);
		if (!chosen) {
			return {
				...fallback,
				rationale: `${fallback.reason} (An advisory answer of "${advice.kind}" was not among the permitted actions and was ignored.)`,
				advised: false,
			};
		}
		return { ...chosen, rationale: advice.rationale, advised: !advice.fellBack };
	} catch (error) {
		// An advisor that is down must never stop the agent. The policy already
		// knows what is safe; the model was only ever choosing among safe things.
		return {
			...fallback,
			rationale: `${fallback.reason} (No advisory answer: ${error instanceof Error ? error.message : String(error)})`,
			advised: false,
		};
	}
}

function min(a: bigint, b: bigint): bigint {
	return a < b ? a : b;
}

function sum(values: bigint[]): bigint {
	return values.reduce((a, b) => a + b, 0n);
}

function fmt(usdc: bigint): string {
	return `$${(Number(usdc) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
