import { type AdlRisk, formatDuration, type LogLevel } from "@lemon/core";
import type { Advisor, MarketSnapshot, VaultSnapshot } from "./policy";
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
 *  2. **Report** — post the NAV, always, before acting.
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
	spotBuyable: boolean;
	spotSellable: boolean;
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

	/** Trade one market's perp leg back to its spot leg's size. */
	rebalance(params: { market: string; targetUnits: bigint }): Promise<ActivityInput[]>;

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

	const observedAt = deps.now();
	let navReported = false;
	const dueForReport = now >= state.lastNavReportAt + state.minNavReportInterval;

	if (dueForReport) {
		log("debug", `2/4 report — posting the NAV on-chain.`);
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

	if (!dueForReport) {
		const due = state.lastNavReportAt + state.minNavReportInterval - now;
		log("debug", `2/4 report — not due for another ${due}s; skipping.`);
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
				adl: market.adl,
			}),
		),
		closeRequested: deps.closeRequested,
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
			activity = await venue.rebalance({
				market: decision.market,
				targetUnits: target.spotUnits,
			});
		} else if (decision.kind === "CLOSE_ALL") {
			activity = await venue.closeAll();
		}
	} catch (error) {
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
		if (activity.length) await safeReport(vault, activity, log);
		return {
			action: decision.kind,
			market: decision.market,
			rationale: decision.rationale,
			advised: decision.advised,
			navReported,
			activityReported: activity.length,
			fulfilled: 0,
			closeSatisfied: false,
			error: message(error),
		};
	}

	if (decision.kind !== "HOLD") {
		log(
			"info",
			`${decision.kind} completed in ${formatDuration(performance.now() - actionStartedAt)} — ${activity.length} leg(s): ${activity.map((a) => a.kind).join(", ") || "none"}.`,
		);
	}

	// --- 4. publish, then settle the queue --------------------------------

	log(
		"debug",
		`4/4 publish — ${activity.length} activity row(s), ${ripe.length} redemption(s) to settle.`,
	);

	if (activity.length) await safeReport(vault, activity, log);

	const fulfilled = await settleQueue(vault, ripe, log);

	return {
		action: decision.kind,
		market: decision.market,
		rationale: decision.rationale,
		advised: decision.advised,
		navReported,
		activityReported: activity.length,
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
): Promise<void> {
	try {
		await vault.reportActivity(activity);
	} catch (error) {
		log("error", "Activity report failed; the trades already executed.", error);
	}
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
