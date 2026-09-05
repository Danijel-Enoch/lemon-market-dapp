import type { AdlRisk } from "@lemon/core";
import type { Advisor, VaultSnapshot } from "./policy";
import { decide, driftBps, splitDeployment } from "./policy";
import { type Valuation, ValuationError } from "./valuation";
import type { ActivityInput, VaultClient } from "./vault";

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
 * Reporting before acting matters. A stale NAV blocks deposits and fulfilments
 * on-chain, so an agent that traded first and reported afterwards would be
 * holding its own vault shut for the duration of every trade — and if the trade
 * hung, indefinitely.
 *
 * One action per tick, deliberately. Ticks are cheap and MPC signatures are
 * serialised anyway, so batching several decisions buys nothing and makes a
 * partial failure much harder to reason about.
 */

/** Everything the worker needs from the outside world, so it can be tested without one. */
export interface VenueAdapter {
	/** Read venue state and price the position. Throws `ValuationError` if unpriceable. */
	observe(): Promise<{
		valuation: Valuation;
		spotUnits: bigint;
		perpUnits: bigint;
		fundingShortPercentPerHour: number;
		spotBuyable: boolean;
		spotSellable: boolean;
		symbol: string;
		/**
		 * Where the short sits in the venue's auto-deleveraging queue.
		 *
		 * Observed rather than acted on. The agent has no action that reduces it —
		 * leverage is the vault's mandate, not the agent's choice — so this exists
		 * to be logged, shown, and handed to the advisor as the one risk that can
		 * remove the hedge without either the agent or the depositor doing
		 * anything. When it fires, it arrives as drift on the next tick.
		 */
		adl: AdlRisk;
	}>;

	/** Buy the spot leg and open the matching short. Returns what it did. */
	deploy(params: {
		spotNotional: bigint;
		perpMargin: bigint;
		leverageBps: number;
	}): Promise<ActivityInput[]>;

	/** Close enough of both legs to free `amount` USDC, and send it back. */
	unwind(params: { amount: bigint }): Promise<ActivityInput[]>;

	/** Trade the perp leg back to the spot leg's size. */
	rebalance(params: { targetUnits: bigint }): Promise<ActivityInput[]>;
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
	now: () => number;
	log: (level: "info" | "warn" | "error", message: string, extra?: unknown) => void;
}

export interface TickResult {
	action: string;
	rationale: string;
	advised: boolean;
	navReported: boolean;
	activityReported: number;
	fulfilled: number;
	error?: string;
}

export async function tick(deps: WorkerDeps): Promise<TickResult> {
	const { vault, venue, advisor, log } = deps;
	const now = deps.now();

	const state = await vault.read();

	// --- 1. observe -------------------------------------------------------

	let observation: Awaited<ReturnType<VenueAdapter["observe"]>>;
	try {
		observation = await venue.observe();
	} catch (error) {
		if (error instanceof ValuationError) {
			// Deliberately not reported. Posting a NAV that omits an unpriceable
			// leg would mark every holder down by its full value; letting the NAV
			// go stale blocks deposits and fulfilments until a human looks, which
			// is the honest outcome even though it is the noisier one.
			log("error", `Cannot price ${vault.address}; letting the NAV go stale.`, error);
			return {
				action: "NONE",
				rationale: error.message,
				advised: false,
				navReported: false,
				activityReported: 0,
				fulfilled: 0,
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
		try {
			await vault.reportNav(
				observation.valuation.deployedAssets,
				observation.valuation.leverageBps,
				observedAt,
			);
			navReported = true;
		} catch (error) {
			// A rejected report is a signal, not a nuisance: it means the value
			// claimed is outside the bounds the vault was configured with, or the
			// leverage is outside its mandate. Trading on top of that would be
			// acting on a position the contract has just refused to believe.
			log("error", `NAV report rejected for ${vault.address}`, error);
			return {
				action: "NONE",
				rationale: `NAV report rejected: ${message(error)}`,
				advised: false,
				navReported: false,
				activityReported: 0,
				fulfilled: 0,
				error: message(error),
			};
		}
	}

	// --- 3. act -----------------------------------------------------------

	const queue = await deps.queue();
	const ripe = queue.filter((q) => q.eligibleAt <= now);

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
		ripeRedeemAssets: sum(ripe.map((q) => q.pendingAssets)),
		pendingRedeemAssets: sum(queue.filter((q) => q.eligibleAt > now).map((q) => q.pendingAssets)),
		earliestDeadline: ripe.length ? Math.min(...ripe.map((q) => q.fulfillBy)) : null,
		spotUnits: observation.spotUnits,
		perpUnits: observation.perpUnits,
		fundingShortPercentPerHour: observation.fundingShortPercentPerHour,
		spotBuyable: observation.spotBuyable && !fresh.paused && !fresh.emergencyExit,
		spotSellable: observation.spotSellable,
		adl: observation.adl,
	};

	// Logged before the decision, not after, so the reason a tick chose what it
	// chose is already in the record when the choice is read back. Three lamps is
	// where the position is near enough the front of the queue that a cascade on
	// the other side would reach it.
	if (observation.adl.lamps >= 3) {
		log("warn", `${vault.address}: auto-deleveraging risk — ${observation.adl.summary}`);
	}

	const decision = await decide(snapshot, now, advisor);
	log("info", `${vault.address}: ${decision.kind} — ${decision.rationale}`);

	let activity: ActivityInput[] = [];

	try {
		if (decision.kind === "DEPLOY") {
			const split = splitDeployment(decision.amount, fresh.targetLeverageBps);
			await vault.agentWithdraw(decision.amount);
			activity = await venue.deploy({ ...split, leverageBps: fresh.targetLeverageBps });
		} else if (decision.kind === "UNWIND") {
			activity = await venue.unwind({ amount: decision.amount });
		} else if (decision.kind === "REBALANCE") {
			activity = await venue.rebalance({ targetUnits: observation.spotUnits });
		}
	} catch (error) {
		log("error", `${decision.kind} failed for ${vault.address}`, error);
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
			rationale: decision.rationale,
			advised: decision.advised,
			navReported,
			activityReported: activity.length,
			fulfilled: 0,
			error: message(error),
		};
	}

	// --- 4. publish, then settle the queue --------------------------------

	if (activity.length) await safeReport(vault, activity, log);

	const fulfilled = await settleQueue(vault, ripe, log);

	return {
		action: decision.kind,
		rationale: decision.rationale,
		advised: decision.advised,
		navReported,
		activityReported: activity.length,
		fulfilled,
	};
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
		} catch (error) {
			log("warn", `Could not fulfil ${entry.controller} on ${vault.address}`, error);
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
		log("error", `Activity report failed for ${vault.address}; trades already executed.`, error);
	}
}

function sum(values: bigint[]): bigint {
	return values.reduce((a, b) => a + b, 0n);
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export { driftBps };
