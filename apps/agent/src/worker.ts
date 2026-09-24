import {
	type AdlRisk,
	crossedFundingSettlement,
	formatDuration,
	type LogLevel,
	nextFundingSettlement,
} from "@lemon/core";
import type { Address } from "viem";
import { type ActionCooldown, cooldownKey } from "./cooldown";
import { type FundingSettlements, fundingSettlements } from "./funding";
import type { Advisor, MarketSnapshot, RebalanceSide, VaultSnapshot } from "./policy";
import { decide, driftBps, isFlat, sizingLeverageBps } from "./policy";
import { leverageBps, type Valuation, ValuationError } from "./valuation";
import { type ActivityInput, isRevert, type VaultClient, type VaultState } from "./vault";

/**
 * One vault's loop.
 *
 * Every tick does the same four things in the same order, and the order is the
 * design:
 *
 *  1. **Observe** — read the vault and the venues.
 *  2. **Report** — post the NAV, once per funding period, before acting.
 *  3. **Act** — one action per tick, chosen by the policy.
 *  4. **Publish** — record what was done to the public feed.
 *
 * Ahead of all four is the case where none of them has anything to say: a vault
 * nobody has deposited into. See `isDormant`.
 *
 * Reporting before acting matters. A stale NAV blocks deposits and fulfilments
 * on-chain, so an agent that traded first and reported afterwards would be
 * holding its own vault shut for the duration of every trade — and if the trade
 * hung, indefinitely.
 *
 * Ticking faster than the report is also deliberate. The tick is how quickly
 * the agent can *react* — to drift, to a ripe redemption, to a close order —
 * and the report is how often it has something new to *say*, which is once a
 * funding settlement has moved money. See `navReportDue`.
 *
 * One action per tick, deliberately. Ticks are cheap and MPC signatures are
 * serialised anyway, so batching several decisions buys nothing and makes a
 * partial failure much harder to reason about.
 */

/**
 * One market, as the venue reports it.
 *
 * Everything the policy needs to reason about a market, plus the shape the
 * snapshot is built from. Note what is *not* here: equity, idle USDC and
 * in-flight capital are all shared across a vault's markets — one Pacifica
 * account, one Base wallet, one Solana wallet — so they live on the valuation
 * and are counted once. See `valuation.ts`.
 */
export interface MarketObservation {
	ticker: string;
	symbol: string;
	perpSymbol: string;
	targetWeightBps: number;
	/** What this market's spot leg would fetch if sold now, in USDC. */
	spotValueUsdc: bigint;
	spotUnits: bigint;
	perpUnits: bigint;
	fundingShortPercentPerHour: number;
	/**
	 * Funding the venue has paid this position since it opened, in signed USDC
	 * base units. Null when there is no position to have accrued any.
	 *
	 * A running total, not a payment — it is the same number a settlement grows
	 * and a close resets. `funding.ts` turns two readings into the payment
	 * between them; nothing else should read it, because on its own it says
	 * nothing about any particular period.
	 */
	fundingAccruedUsdc: bigint | null;
	/** The short's notional at the current mark, in USDC. */
	perpNotionalUsdc: bigint;
	/**
	 * The venue's own timestamp for when this position was opened, or null when
	 * there is no position. Identity, not history: it is how a reset is told
	 * apart from a negative funding period.
	 */
	positionOpenedAt: number | null;
	spotBuyable: boolean;
	spotSellable: boolean;
	/** Live mark from the perp venue, in USD. Zero when it cannot be priced. */
	markPriceUsd: number;
	/**
	 * The venue's quantity grid, in units of the underlying. Zero when unknown.
	 *
	 * An order off this grid is rejected outright rather than filled
	 * approximately, so it bounds what a correction can be.
	 */
	lotSize: number;
	/**
	 * The venue's minimum order value, in USD. Zero when unknown.
	 *
	 * Separate from `lotSize` and not interchangeable with it — one bounds the
	 * quantity, the other bounds the dollar notional. A correction can sit
	 * exactly on the lot grid and still be refused for being worth too little,
	 * which is what happens to every small position's rebalance.
	 */
	minOrderUsd: number;
	/** The aggregator's gas estimate for this market's spot leg, in USD. */
	spotGasUsd: number;
	/** What crossing this market's pool costs, as a positive percent. */
	spotImpactPercent: number;
	/**
	 * Where this market's short sits in the venue's auto-deleveraging queue.
	 *
	 * Observed rather than acted on. The agent has no action that reduces it —
	 * leverage is the vault's mandate, not the agent's choice — so this exists
	 * to be logged, shown, and handed to the advisor as the one risk that can
	 * remove the hedge without either the agent or the depositor doing
	 * anything. When it fires, it arrives as drift on the next tick.
	 */
	adl: AdlRisk;
}

/** Everything the worker needs from the outside world, so it can be tested without one. */
export interface VenueAdapter {
	/** Read venue state and price the position. Throws `ValuationError` if unpriceable. */
	observe(): Promise<{
		valuation: Valuation;
		/** One entry per market the vault runs. Never empty. */
		markets: MarketObservation[];
		/** The worst auto-deleveraging exposure across those markets. */
		adl: AdlRisk;
		/**
		 * USDC in the agent's Base wallet, separate from the valuation's total.
		 *
		 * The valuation adds both chains' idle balances together because for NAV
		 * they are the same thing. The policy needs the Base half on its own: it is
		 * the only part that can fund a spot swap or a bridge, so it is the only
		 * part a deployment can be sized against.
		 */
		idleOnBase: bigint;
		/** Margin at the perp venue backing no open position. See `VaultSnapshot`. */
		unallocatedMargin: bigint;
		/**
		 * The venue's flat fee for moving margin out, in USDC.
		 *
		 * Account-level rather than per market, because one withdrawal serves every
		 * leg an unwind closed. Part of the fixed cost of unwinding at all.
		 */
		venueWithdrawalFeeUsdc: bigint;
	}>;

	/**
	 * Buy one market's spot leg and open the matching short. Returns what it did.
	 *
	 * `leverageBps` is the policy's sizing leverage, not the vault's raw target —
	 * see `sizingLeverageBps`. It decides how much margin backs the hedge, so a
	 * caller that passed the bare mandate here would open every position at its
	 * ceiling.
	 */
	deploy(params: {
		/** The market's ticker. The adapter refuses one it has no configuration for. */
		market: string;
		spotNotional: bigint;
		perpMargin: bigint;
		leverageBps: number;
	}): Promise<ActivityInput[]>;

	/**
	 * Close enough of the position to free `amount` USDC, and send it back.
	 *
	 * Which markets it comes out of is the adapter's decision, not the policy's:
	 * it takes from whichever are furthest above their target weight, which needs
	 * live quotes the policy does not have and would leave stale by the time the
	 * order was placed.
	 *
	 * `leverageBps` is what the *surviving* position should be left backed at. An
	 * unwind frees margin, and the venue would hand back every dollar it no longer
	 * requires — including the buffer the remaining hedge still needs.
	 */
	unwind(params: { amount: bigint; leverageBps: number }): Promise<ActivityInput[]>;

	/**
	 * Add margin to the perp account, without touching the position.
	 *
	 * What restores the buffer when mark-to-market drift has eaten it. Deliberately
	 * separate from `deploy`: this opens no notional and buys no spot, so it lowers
	 * the account's leverage rather than holding it constant.
	 */
	topUpMargin(params: { amount: bigint }): Promise<ActivityInput[]>;

	/**
	 * Trade one market's legs back to neutral, moving whichever side `side` names.
	 *
	 * `targetUnits` is always the size the *other* leg is already at, and so the
	 * size the named leg is being moved to. `PERP` is the ordinary correction and
	 * trades the hedge; `SPOT` sells the holding down instead, and exists for a
	 * correction the perp venue refuses as too small. The policy picks between
	 * them — see `rebalancePlan`.
	 */
	rebalance(params: {
		market: string;
		targetUnits: bigint;
		side: RebalanceSide;
	}): Promise<ActivityInput[]>;

	/**
	 * Sell everything, in every market, and send all of it back to the vault.
	 *
	 * Not `unwind` with a large number. An unwind is sized against a quote and
	 * stops when it has raised what it was asked for; this closes each position in
	 * full, sweeps the margin account, and does not stop early because a leg
	 * happened to fetch more than expected. It is what an operator's close order
	 * means.
	 */
	closeAll(): Promise<ActivityInput[]>;

	/**
	 * The four steps `closeAll` takes, each callable on its own.
	 *
	 * An operator unwinding a vault by hand needs them apart. `closeAll` is one
	 * call that sells every spot leg, closes every short, sweeps the margin
	 * account and returns the lot — and when one of those fails halfway, the only
	 * tool for the remainder is the same all-or-nothing call, which starts again
	 * from the top. Separating them lets the operator pick up exactly where it
	 * stopped: a vault whose spot legs are already sold needs the perp closed and
	 * the margin brought home, not a fresh attempt at a sale with nothing left to
	 * sell.
	 *
	 * They are steps rather than alternatives, and the order matters — each one
	 * leaves the vault somewhere the next one starts from:
	 *
	 *   closeSpot  → tokens become USDC in the agent's own wallet
	 *   closePerp  → the shorts close; the margin stays with the venue
	 *   bridgeHome → that margin crosses back to the agent's wallet
	 *   returnIdle → the wallet's whole USDC balance goes back to the vault
	 *
	 * Nothing here is `closeAll` internally — it closes both legs of a market
	 * together, short first, which is the right thing for an automatic close and
	 * the wrong thing for a person taking one step at a time. What they do share
	 * is every venue call underneath, so the token a hand-run step sells is the
	 * token the agent would have sold.
	 *
	 * **Each leaves the position one-sided while it runs.** Selling the spot
	 * before closing the short leaves the vault short and directionally exposed
	 * until the second step; doing it the other way round leaves it long. That is
	 * inherent in taking them separately and is the operator's to judge — the
	 * agent's own close never leaves that window open for longer than one Base
	 * transaction.
	 */
	closeSpot(): Promise<ActivityInput[]>;

	/**
	 * Close every market's short, and leave the margin where it is.
	 *
	 * Reduce-only, so it closes what is open and cannot flip a leg long. The
	 * freed margin stays in the Pacifica account rather than being swept, because
	 * bringing it home is the next step and a separate decision — a bridge takes
	 * minutes and can fail on its own, and folding it in here would mean an
	 * operator who wanted the shorts closed could not tell which half went wrong.
	 */
	closePerp(): Promise<ActivityInput[]>;

	/**
	 * Bring the venue's free margin back to the agent's wallet on this chain.
	 *
	 * Withdraws whatever Pacifica says is free — which with the shorts closed is
	 * all of it — and sweeps any USDC stranded in the Solana wallet by an earlier
	 * failure, in one crossing. Run before the shorts are closed it withdraws only
	 * what the open positions are not backing, which is a smaller number and not a
	 * failure.
	 *
	 * The slow step: a venue withdrawal settles on Pacifica's schedule and a Relay
	 * fill takes minutes, so this can run for the better part of an hour before it
	 * gives up. Nothing is lost when it does — the USDC is in the agent's Solana
	 * wallet or recorded as in flight, and running it again sweeps it.
	 */
	bridgeHome(): Promise<ActivityInput[]>;

	/**
	 * Send every USDC the agent holds on this chain back to the vault.
	 *
	 * The whole balance, not an amount: this is the end of an unwind, and USDC
	 * left at the agent still counts toward the vault's reported NAV as deployed
	 * capital. It is also the only step that makes money `freeAssets` again —
	 * everything above it moves value between accounts the agent controls, and a
	 * depositor cannot be paid out of any of them.
	 */
	returnIdle(): Promise<ActivityInput[]>;
}

/**
 * A venue action that failed part-way, carrying the legs that did land.
 *
 * A multi-leg action has no atomic form: the bridge, the perp order and the
 * swap settle on two different chains and a third venue's matching engine.
 * When one of them fails the earlier ones have already moved real money, and
 * the depositor's record has to show them. A plain `Error` loses that — the
 * worker's `activity` is still empty at the point the throw lands — so the
 * legs are carried on the error itself.
 */
export class VenueExecutionError extends Error {
	readonly activity: ActivityInput[];

	constructor(message: string, activity: ActivityInput[], options?: { cause?: unknown }) {
		super(message, options);
		this.name = "VenueExecutionError";
		this.activity = activity;
	}
}

export interface QueueEntry {
	controller: `0x${string}`;
	pendingShares: bigint;
	pendingAssets: bigint;
	eligibleAt: number;
	fulfillBy: number;
}

export interface WorkerDeps {
	vault: VaultClient;
	venue: VenueAdapter;
	advisor: Advisor | null;
	/** Ripe and pending redemptions, from the indexer. */
	queue: () => Promise<QueueEntry[]>;
	/**
	 * Whether an operator has ordered every position closed and the capital
	 * returned. See `VaultConfig.closeRequestedAt`.
	 */
	closeRequested: boolean;

	/**
	 * An operator asked for the hedge to be corrected on this tick.
	 *
	 * Passed straight through to the policy, which lowers the drift threshold to
	 * zero for it. The worker's only extra job is reporting what became of it —
	 * see `rebalanceOutcome` on the tick result.
	 */
	rebalanceRequested: boolean;
	/**
	 * How far the two legs may drift before a rebalance is worth its fee.
	 *
	 * Per vault rather than a constant, because the answer depends on the
	 * position's size against the venue's minimum order notional — a threshold
	 * that suits a large vault has a small one attempting a correction the venue
	 * will not accept, on every tick, forever.
	 */
	rebalanceDriftBps: number;
	/**
	 * Backoff for actions that have just failed, shared across this vault's ticks.
	 *
	 * Optional so a test can leave it out and get the old always-try behaviour.
	 * The running agent always supplies one.
	 */
	cooldown?: ActionCooldown;
	now: () => number;
	log: (level: LogLevel, message: string, extra?: unknown) => void;
}

export interface TickResult {
	/**
	 * The policy's decision, or `IDLE` for a vault with nothing in it.
	 *
	 * `IDLE` is not a decision and is deliberately not recorded as one — see
	 * `isDormant`. An `IDLE` result that also carries an `error` is still
	 * recorded, because a keepalive that could not land is news.
	 */
	action: string;
	/** The market the action was aimed at, when it was aimed at one. */
	market: string | null;
	rationale: string;
	advised: boolean;
	navReported: boolean;
	activityReported: number;
	fulfilled: number;
	/**
	 * True when a close order stands and the position is now flat.
	 *
	 * Reported rather than acted on here, because the flag it stamps lives in the
	 * database and the worker has no business writing there — it is the one part
	 * of a tick that is bookkeeping for an operator rather than a step in running
	 * the vault. Read by the caller, which records it.
	 */
	closeSatisfied: boolean;
	error?: string;
}

/** Whether this tick owes the chain a NAV, and why — or when the next one is due. */
export type NavReportDecision = { due: true; because: string } | { due: false; nextAt: number };

/**
 * When to post a NAV.
 *
 * The cadence is the venue's funding period, not the contract's floor. A
 * hedged book has one source of return and it arrives at a settlement; between
 * two settlements the spot leg and the perp leg move against each other and
 * cancel by construction. Reporting four times an hour against an hourly
 * settlement therefore publishes the same funding four times over, and the
 * three extra points differ only by where the two marks happened to sit — mark
 * noise, drawn as a share price and paid for in gas.
 *
 * So a report is due once a settlement has landed since the last one. That
 * makes every point in the series a whole funding period's realised outcome,
 * which is what the chart claims to be showing and what every APY on the site
 * is computed from.
 *
 * Two guards bracket it:
 *
 *  - The contract's `minNavReportInterval` is a hard floor — a report inside it
 *    reverts — so nothing above matters until it has passed. At production
 *    limits it is fifteen minutes against an hourly period and never binds; it
 *    is checked because a vault may be configured with a longer one.
 *  - `maxNavStaleness` is the ceiling. A vault whose staleness window is
 *    shorter than two funding periods would go stale waiting for a boundary —
 *    blocking deposits and fulfilments — so half the window forces a report
 *    regardless, the same margin `idle` keeps for an empty vault.
 */
export function navReportDue(
	state: Pick<VaultState, "lastNavReportAt" | "minNavReportInterval" | "maxNavStaleness">,
	now: number,
): NavReportDecision {
	const floorAt = state.lastNavReportAt + state.minNavReportInterval;
	const keepaliveAt = state.lastNavReportAt + Math.floor(state.maxNavStaleness / 2);
	const settlementAt = nextFundingSettlement(state.lastNavReportAt);

	if (now < floorAt) {
		return { due: false, nextAt: Math.max(floorAt, Math.min(settlementAt, keepaliveAt)) };
	}

	if (crossedFundingSettlement(state.lastNavReportAt, now)) {
		return { due: true, because: "a funding settlement has landed since the last report" };
	}

	if (now >= keepaliveAt) {
		return {
			due: true,
			because:
				"the NAV is halfway to stale and the next funding settlement will not arrive in time",
		};
	}

	return { due: false, nextAt: Math.min(settlementAt, keepaliveAt) };
}

export async function tick(deps: WorkerDeps): Promise<TickResult> {
	const { vault, venue, advisor, log } = deps;
	const now = deps.now();

	const state = await vault.read();
	log(
		"debug",
		`Read the vault — ${usd(state.totalAssets)} total, ${usd(state.freeAssets)} free, ${usd(state.deployedAssets)} deployed${state.paused ? ", paused" : ""}${state.emergencyExit ? ", emergency exit" : ""}.`,
	);

	// --- 0. nothing to run ------------------------------------------------

	if (isDormant(state)) return idle(deps, state, now);

	// --- 1. observe -------------------------------------------------------

	log("debug", `1/4 observe — reading the venues.`);
	let observation: Awaited<ReturnType<VenueAdapter["observe"]>>;
	try {
		observation = await venue.observe();
		log(
			"info",
			`Observed ${observation.markets.length} market(s) — ${usd(observation.valuation.deployedAssets)} deployed at ${(observation.valuation.leverageBps / 10_000).toFixed(2)}x (spot ${usd(observation.valuation.components.spot)}, margin ${usd(observation.valuation.components.perpEquity)}, idle ${usd(observation.valuation.components.idleAtAgent)}, in flight ${usd(observation.valuation.components.inFlight)}).`,
		);
	} catch (error) {
		if (error instanceof ValuationError) {
			// Deliberately not reported. Posting a NAV that omits an unpriceable
			// leg would mark every holder down by its full value; letting the NAV
			// go stale blocks deposits and fulfilments until a human looks, which
			// is the honest outcome even though it is the noisier one.
			log("error", "Cannot price this vault; letting the NAV go stale.", error);
			return {
				action: "NONE",
				market: null,
				rationale: error.message,
				advised: false,
				navReported: false,
				activityReported: 0,
				fulfilled: 0,
				closeSatisfied: false,
				error: error.message,
			};
		}
		throw error;
	}

	// --- 2. report --------------------------------------------------------

	// Read before the NAV is posted, because it is part of what the NAV is
	// reporting. The rows themselves go out with whatever else this tick
	// publishes — funding is the one thing that accrues on a tick where the
	// agent correctly does nothing, so it cannot wait for an action to carry it.
	const funding = await readFunding(vault.address, observation.markets, now, log);

	const observedAt = deps.now();
	let navReported = false;
	const report = navReportDue(state, now);

	if (report.due) {
		log("debug", `2/4 report — ${report.because}; posting the NAV on-chain.`);
		try {
			await vault.reportNav(
				observation.valuation.deployedAssets,
				observation.valuation.leverageBps,
				observedAt,
			);
			navReported = true;
			log("info", `NAV reported at ${usd(observation.valuation.deployedAssets)}.`);
		} catch (error) {
			// A rejected report is a signal, not a nuisance — but which signal decides
			// whether the tick goes on.
			//
			// A *deviation* rejection means the contract disputes the number itself.
			// Trading on top of that would be acting on a position the chain has just
			// refused to believe, so the tick stops here.
			//
			// A *mandate* rejection is the opposite: the contract believes the
			// valuation and objects to the leverage, which is a thing the agent can
			// actually fix — and the fix lives in the act stage below. Returning here
			// would leave the agent posting the same rejected report every tick with
			// no way to reach the one action that cures it, while the NAV goes stale
			// and the vault stops taking deposits and paying redemptions. That is the
			// loop this branch exists to break.
			if (!isRevert(error, "LeverageExceedsMandate")) {
				log("error", "NAV report rejected.", error);
				return {
					action: "NONE",
					market: null,
					rationale: `NAV report rejected: ${message(error)}`,
					advised: false,
					navReported: false,
					activityReported: 0,
					fulfilled: 0,
					closeSatisfied: false,
					error: message(error),
				};
			}

			log(
				"error",
				`NAV report rejected: ${(observation.valuation.leverageBps / 10_000).toFixed(4)}x is outside the vault's mandate. Continuing the tick so the position can be brought back inside it; the NAV is stale until it is.`,
				error,
			);
		}
	}

	if (!report.due) {
		log(
			"debug",
			`2/4 report — the funding period this NAV already covers runs for another ${formatDuration((report.nextAt - now) * 1000)}; skipping.`,
		);
	}

	// --- 3. act -----------------------------------------------------------

	const queue = await deps.queue();
	const ripe = queue.filter((q) => q.eligibleAt <= now);
	log(
		"debug",
		`3/4 act — ${ripe.length} ripe and ${queue.length - ripe.length} waiting redemption(s).`,
	);

	const fresh = await vault.read();
	const snapshot: VaultSnapshot = {
		address: fresh.address,
		riskTier: fresh.riskTier,
		targetLeverageBps: fresh.targetLeverageBps,
		maxLeverageBps: fresh.maxLeverageBps,
		freeAssets: fresh.freeAssets,
		totalAssets: fresh.totalAssets,
		deployedAssets: fresh.deployedAssets,
		maxDeployedBps: fresh.maxDeployedBps,
		withdrawWindowRemaining: await vault.withdrawWindowRemaining(),
		idleOnBase: observation.idleOnBase,
		unallocatedMargin: observation.unallocatedMargin,
		// The two halves of the leverage that was just reported, so the policy can
		// size a margin top-up in dollars rather than by scaling a rounded ratio.
		perpNotionalUsdc: observation.valuation.perp.notional,
		perpEquityUsdc: observation.valuation.perp.equity,
		ripeRedeemAssets: sum(ripe.map((q) => q.pendingAssets)),
		pendingRedeemAssets: sum(queue.filter((q) => q.eligibleAt > now).map((q) => q.pendingAssets)),
		earliestDeadline: ripe.length ? Math.min(...ripe.map((q) => q.fulfillBy)) : null,
		markets: observation.markets.map(
			(market): MarketSnapshot => ({
				ticker: market.ticker,
				symbol: market.symbol,
				targetWeightBps: market.targetWeightBps,
				spotValueUsdc: market.spotValueUsdc,
				spotUnits: market.spotUnits,
				perpUnits: market.perpUnits,
				fundingShortPercentPerHour: market.fundingShortPercentPerHour,
				// A paused or exiting vault buys nothing anywhere. Applied per market
				// rather than once, because it has to survive the policy looking at
				// each market on its own.
				spotBuyable: market.spotBuyable && !fresh.paused && !fresh.emergencyExit,
				spotSellable: market.spotSellable,
				markPriceUsd: market.markPriceUsd,
				lotSize: market.lotSize,
				minOrderUsd: market.minOrderUsd,
				spotGasUsd: market.spotGasUsd,
				spotImpactPercent: market.spotImpactPercent,
				adl: market.adl,
			}),
		),
		closeRequested: deps.closeRequested,
		rebalanceRequested: deps.rebalanceRequested,
		rebalanceDriftBps: deps.rebalanceDriftBps,
		venueWithdrawalFeeUsdc: observation.venueWithdrawalFeeUsdc,
		adl: observation.adl,
	};

	// Logged before the decision, not after, so the reason a tick chose what it
	// chose is already in the record when the choice is read back. Three lamps is
	// where the position is near enough the front of the queue that a cascade on
	// the other side would reach it.
	if (observation.adl.lamps >= 3) {
		log("warn", `auto-deleveraging risk — ${observation.adl.summary}`);
	}

	const decision = await decide(snapshot, now, advisor);
	log(
		"info",
		`${decision.kind}${decision.market ? ` ${decision.market}` : ""} — ${decision.rationale}`,
	);

	// --- 3a. is this action still cooling off? ----------------------------
	//
	// Checked after the decision rather than before it, so the log still records
	// what the agent wanted to do and why. The tick then carries on to publish and
	// settle: a suppressed action must not suppress the NAV report or the
	// redemption queue, which are the parts a depositor depends on.
	//
	// HOLD is never suppressed. It costs nothing, and backing off from doing
	// nothing would be a way of doing nothing more slowly.
	const key = cooldownKey(decision.kind, decision.market);
	const blockedFor = decision.kind === "HOLD" ? 0 : (deps.cooldown?.blockedFor(key) ?? 0);
	if (blockedFor > 0) {
		const failures = deps.cooldown?.failures(key) ?? 0;
		log(
			"warn",
			`Holding off ${decision.kind}${decision.market ? ` on ${decision.market}` : ""} for another ${formatDuration(blockedFor * 1000)} after ${failures} consecutive failure${failures === 1 ? "" : "s"}. Reporting NAV and settling the queue as usual.`,
		);
		const fulfilledWhileWaiting = await settleQueue(vault, ripe, log);
		return {
			action: decision.kind,
			market: decision.market,
			rationale: `${decision.rationale} (Backing off for ${formatDuration(blockedFor * 1000)} after ${failures} failure${failures === 1 ? "" : "s"}.)`,
			advised: decision.advised,
			navReported,
			// A suppressed action must not suppress the funding either. The vault
			// went on being paid while the agent waited, and a cooling-off period
			// that swallowed a settlement would leave a permanent hole in the feed.
			activityReported: await publish(vault, funding, [], log),
			fulfilled: fulfilledWhileWaiting,
			closeSatisfied: false,
		};
	}

	let activity: ActivityInput[] = [];
	const actionStartedAt = performance.now();

	// The one line worth having when an operator is watching a tick that has not
	// come back: it names the action, the market and the size that everything
	// after it is waiting on. Deployments and unwinds cross a chain, so "started"
	// and "finished" can be twenty minutes apart.
	if (decision.kind !== "HOLD") {
		log(
			"info",
			`Executing ${decision.kind}${decision.market ? ` on ${decision.market}` : ""}${decision.amount > 0n ? ` for ${usd(decision.amount)}` : ""}.`,
		);
	}

	try {
		if (decision.kind === "DEPLOY") {
			// `decision.market` is set for every DEPLOY the policy produces; the
			// check is here because the adapter cannot act on a deployment that does
			// not say where it goes, and failing before `agentWithdraw` keeps the
			// capital in the vault rather than at an agent with nothing to do.
			if (!decision.market) throw new Error("A deployment named no market.");
			// The policy's split, not one recomputed here. A resuming deployment
			// spends everything on spot and bridges nothing, and re-deriving the
			// halves from the total would undo exactly that.
			if (!decision.legs) throw new Error("A deployment named no legs.");
			const split = decision.legs;
			// Only a vault-funded deployment draws anything down. An agent-funded
			// one is spending capital a previous deployment already withdrew and
			// failed to place, so withdrawing again would take a second helping out
			// of the vault to place the first one.
			if (decision.fundedFrom === "AGENT") {
				log(
					"info",
					`Resuming with ${usd(decision.amount)} already in the agent's Base wallet; nothing is drawn from the vault.${
						split.perpMargin === 0n
							? " Margin is already at the venue, so this buys the spot leg only."
							: ""
					}`,
				);
			} else {
				await vault.agentWithdraw(decision.amount);
			}
			activity = await venue.deploy({
				...split,
				market: decision.market,
				// The policy's sizing leverage, not the vault's raw target. The two
				// differ by the margin buffer, and handing the venue the target would
				// open the hedge at exactly the ceiling its NAV report is checked
				// against — see `MARGIN_BUFFER_BPS`.
				leverageBps: sizingLeverageBps(snapshot),
			});
		} else if (decision.kind === "TOP_UP_MARGIN") {
			// Same funding rule as a deployment: `AGENT` spends capital that has
			// already left the vault, `VAULT` draws it down. Withdrawing for an
			// agent-funded top-up would take a second helping to do one transfer.
			if (decision.fundedFrom === "VAULT") await vault.agentWithdraw(decision.amount);
			activity = await venue.topUpMargin({ amount: decision.amount });
		} else if (decision.kind === "UNWIND") {
			activity = await venue.unwind({
				amount: decision.amount,
				leverageBps: sizingLeverageBps(snapshot),
			});
		} else if (decision.kind === "REBALANCE") {
			if (!decision.market) throw new Error("A rebalance named no market.");
			const target = observation.markets.find((m) => m.ticker === decision.market);
			if (!target) throw new Error(`No observation for ${decision.market} to rebalance against.`);
			// Defaulting rather than throwing: an older decision replayed from a
			// cooldown or a test fixture predates the field, and the perp side is
			// what every one of those meant.
			const side = decision.rebalanceSide ?? "PERP";
			activity = await venue.rebalance({
				market: decision.market,
				// The leg being moved is the one given a target, so the target is
				// always the leg that is staying put: a perp correction is sized
				// against the holding, a spot correction against the short.
				targetUnits: side === "PERP" ? target.spotUnits : target.perpUnits,
				side,
			});
		}
	} catch (error) {
		// Recorded before anything else, so the next tick knows not to repeat this
		// immediately. The whole point is that a failure which will fail again
		// costs one attempt rather than one attempt every minute.
		deps.cooldown?.failed(key);
		log("error", `${decision.kind} failed.`, error);
		// Whatever legs did land are still published. A failed deployment that
		// opened the short and could not buy the spot is exactly the state a
		// depositor most needs to see, and swallowing it because the overall
		// action failed would hide the only half that moved their money.
		//
		// The adapter has to hand those legs over deliberately: `activity` is
		// still the empty array it was initialised with, because the assignment
		// above never ran.
		if (error instanceof VenueExecutionError) activity = error.activity;
		const publishedOnFailure = await publish(vault, funding, activity, log);
		return {
			action: decision.kind,
			market: decision.market,
			rationale: decision.rationale,
			advised: decision.advised,
			navReported,
			activityReported: publishedOnFailure,
			fulfilled: 0,
			closeSatisfied: false,
			error: message(error),
		};
	}

	// Cleared on success rather than decayed. A backoff describes one action being
	// stuck, and an action that has just worked is not stuck — carrying a residual
	// wait forward would throttle a vault that had already recovered.
	deps.cooldown?.succeeded(key);

	if (decision.kind !== "HOLD") {
		log(
			"info",
			`${decision.kind} completed in ${formatDuration(performance.now() - actionStartedAt)} — ${activity.length} leg(s): ${activity.map((a) => a.kind).join(", ") || "none"}.`,
		);
	}

	// --- 4. publish, then settle the queue --------------------------------

	log(
		"debug",
		`4/4 publish — ${activity.length} activity row(s), ${funding.entries.length} funding settlement(s), ${ripe.length} redemption(s) to settle.`,
	);

	const published = await publish(vault, funding, activity, log);

	const fulfilled = await settleQueue(vault, ripe, log);

	return {
		action: decision.kind,
		market: decision.market,
		rationale: decision.rationale,
		advised: decision.advised,
		navReported,
		activityReported: published,
		fulfilled,
		// Read off the snapshot this tick acted on, which means the tick *after*
		// the close is the one that reports it satisfied — the legs have to be
		// observed empty and the NAV reported at zero before the position is flat
		// by any measure a depositor could check. Claiming it on the closing tick
		// itself would be recording an intention rather than an outcome.
		closeSatisfied: deps.closeRequested && isFlat(snapshot),
	};
}

/**
 * A vault holding nothing, for nobody.
 *
 * No shares outstanding, no assets, nothing deployed and nothing owed — so
 * there is no position to observe, no value to restate, and nobody to restate
 * it for. Every number this tick would produce is zero, and the chain already
 * holds those zeros: `reportNav` on a vault with nothing deployed is only
 * allowed to say zero at all (`CannotReportNavWithNothingDeployed`), so the
 * report carries no information, and the trade decision above it can only be
 * HOLD. What the full tick would produce instead is cost — a round of venue
 * quotes, a transaction every report interval, and a run in the operator's
 * agent log every minute, all of it saying nothing happened to nothing.
 *
 * All four measures rather than just `totalAssets`, because any one of them
 * non-zero means something is there to be looked after: a donated balance, a
 * share left over from a redemption, capital still out at the venue, or a
 * claim waiting to be collected. In any of those cases the full tick runs.
 */
function isDormant(state: VaultState): boolean {
	return (
		state.totalAssets === 0n &&
		state.totalSupply === 0n &&
		state.deployedAssets === 0n &&
		state.claimableAssets === 0n
	);
}

/**
 * The tick an empty vault gets: a keepalive, and nothing else.
 *
 * The one thing such a vault still needs from its agent is a NAV fresh enough
 * that the first deposit is possible at all — `maxDeposit` returns zero while
 * the report is stale, so an agent that went completely silent here would have
 * quietly closed the vault against the depositor it is waiting for.
 *
 * So the clock is kept, and only the clock: once per staleness window rather
 * than once per report interval, which at production limits is a couple of
 * transactions a day instead of ninety-odd. Half the window is the margin —
 * whatever ticking is worth doing at all is worth doing with hours of slack
 * against a restart, a stuck RPC or a reorg.
 */
async function idle(deps: WorkerDeps, state: VaultState, now: number): Promise<TickResult> {
	const { vault, log } = deps;

	const result: TickResult = {
		action: "IDLE",
		market: null,
		rationale:
			"No shares outstanding and nothing deployed, so there is nothing to price, trade or report.",
		advised: false,
		navReported: false,
		activityReported: 0,
		fulfilled: 0,
		// Flat by every measure the chain has: nothing deployed, nothing owed,
		// nothing held. Unlike the observed case below, there is no venue reading
		// that could disagree, because no capital ever left.
		closeSatisfied: deps.closeRequested,
	};

	// Never sooner than the contract's own floor, whatever the staleness window
	// works out to — a report inside `minNavReportInterval` reverts.
	const keepaliveAfter = Math.max(
		state.minNavReportInterval,
		Math.floor(state.maxNavStaleness / 2),
	);

	if (now < state.lastNavReportAt + keepaliveAfter) {
		log(
			"debug",
			`Empty — no shares and nothing deployed. NAV is good for another ${formatDuration((state.lastNavReportAt + state.maxNavStaleness - now) * 1000)}; skipping the tick.`,
		);
		return result;
	}

	try {
		// Zero, at one times leverage: the value and the leverage of a book that
		// does not exist. The same pair a full tick would compute for it.
		await vault.reportNav(0n, leverageBps(0n, 0n), now);
		log("info", "Empty — posted a keepalive NAV so the vault stays open to deposits.");
		return { ...result, navReported: true };
	} catch (error) {
		// Worth an error rather than a shrug: a keepalive that cannot land means
		// the vault will go stale, and a stale vault cannot take the first deposit.
		log("error", "Keepalive NAV rejected; the vault will go stale to depositors.", error);
		return { ...result, error: message(error) };
	}
}

/**
 * Pay out every ripe request the vault can currently cover.
 *
 * Oldest first, and one at a time. A partial pass is a good outcome — three of
 * five paid today and the rest tomorrow beats an all-or-nothing attempt that
 * pays nobody because the fifth was short by a dollar.
 */
async function settleQueue(
	vault: VaultClient,
	ripe: QueueEntry[],
	log: WorkerDeps["log"],
): Promise<number> {
	if (ripe.length === 0) return 0;

	let fulfilled = 0;
	const ordered = [...ripe].sort((a, b) => a.eligibleAt - b.eligibleAt);

	for (const entry of ordered) {
		const state = await vault.read();
		if (state.freeAssets === 0n) break;

		try {
			// Scale the fulfilment down to what is actually payable rather than
			// attempting the whole request and reverting. The remainder stays
			// queued and is picked up on a later tick.
			const payable =
				entry.pendingAssets <= state.freeAssets
					? entry.pendingShares
					: (entry.pendingShares * state.freeAssets) / entry.pendingAssets;

			if (payable === 0n) continue;
			await vault.fulfillRedeem(entry.controller, payable);
			fulfilled += 1;
			log(
				"info",
				`Paid ${entry.controller} ${payable === entry.pendingShares ? "in full" : "in part"} (${usd(entry.pendingAssets)} requested, ${usd(state.freeAssets)} free).`,
			);
		} catch (error) {
			log("warn", `Could not fulfil ${entry.controller}.`, error);
		}
	}

	return fulfilled;
}

/**
 * Publishing must never take the tick down with it.
 *
 * The trades have already happened by this point. Losing the audit row is bad;
 * throwing here would additionally skip the redemption settlement below it,
 * which is worse.
 */
async function safeReport(
	vault: VaultClient,
	activity: ActivityInput[],
	log: WorkerDeps["log"],
): Promise<boolean> {
	try {
		await vault.reportActivity(activity);
		return true;
	} catch (error) {
		log("error", "Activity report failed; the trades already executed.", error);
		return false;
	}
}

/**
 * Read what funding has arrived since the last tick.
 *
 * Best-effort, and deliberately so. The watermarks live in Postgres, which the
 * rest of a tick does not need — an agent that can reach the chain and the venue
 * can trade, report a NAV and pay redemptions with no database at all, and
 * stopping it from doing any of that because a funding row could not be prepared
 * would trade the vault's operation for its bookkeeping. A failure here costs one
 * period's row, and the next tick's subtraction picks the money back up.
 */
async function readFunding(
	vaultAddress: Address,
	markets: MarketObservation[],
	now: number,
	log: WorkerDeps["log"],
): Promise<FundingSettlements> {
	try {
		return await fundingSettlements(
			vaultAddress,
			markets.map((market) => ({
				ticker: market.ticker,
				perpSymbol: market.perpSymbol,
				accruedUsdc: market.fundingAccruedUsdc,
				positionOpenedAt: market.positionOpenedAt,
				notionalUsdc: market.perpNotionalUsdc,
			})),
			now,
		);
	} catch (error) {
		log("warn", "Could not read the funding watermarks; this period's funding is deferred.", error);
		return { entries: [], commit: async () => {} };
	}
}

/**
 * Publish this tick's rows, and only then remember the funding among them.
 *
 * The ordering is the point. `commit` moves the watermarks past the payments
 * just reported, and running it against a report that did not land would consume
 * them — the next tick would subtract from the advanced total, find nothing
 * owing, and that funding would never be recorded anywhere. So the watermarks
 * move on a confirmed report and not otherwise, which leaves a failed report
 * costing a retry rather than a permanent gap.
 */
async function publish(
	vault: VaultClient,
	funding: FundingSettlements,
	activity: ActivityInput[],
	log: WorkerDeps["log"],
): Promise<number> {
	// Funding first, so a settlement is on the row above the trade it paid for
	// rather than below it. The sequence is the feed's only ordering.
	const entries = [...funding.entries, ...activity];
	if (entries.length === 0) return 0;

	if (!(await safeReport(vault, entries, log))) return 0;

	if (funding.entries.length > 0) {
		const total = funding.entries.reduce((sum, entry) => sum + entry.pnlAssets, 0n);
		log("info", `Funding settled — ${usd(total)} across ${funding.entries.length} market(s).`);
		try {
			await funding.commit();
		} catch (error) {
			// Reported but not remembered. The next tick will subtract from a stale
			// watermark and report the same payment again, which is a duplicate row
			// in the feed — visible, and far better than the silent loss that
			// committing before the report would risk.
			log("error", "Funding was reported but the watermark did not move.", error);
		}
	}

	return entries.length;
}

function sum(values: bigint[]): bigint {
	return values.reduce((a, b) => a + b, 0n);
}

/** USDC base units as dollars, for a log line rather than for arithmetic. */
function usd(amount: bigint): string {
	return `$${(Number(amount) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export { driftBps };
