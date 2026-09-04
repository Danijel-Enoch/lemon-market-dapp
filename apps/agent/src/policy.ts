import { BPS } from "@lemon/contracts";

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
	 * Move idle vault USDC into the position — which means *adding to* the
	 * existing legs, not opening new ones. A deposit deepens the book the vault
	 * already runs.
	 */
	| "DEPLOY"
	/** Close part of the position and return USDC so redemptions can be paid. */
	| "UNWIND"
	/** Trade the perp leg back to the spot leg's size. */
	| "REBALANCE"
	/** Report NAV and nothing else. */
	| "HOLD";

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

	/** Shares queued whose delay has elapsed, and what they are worth now. */
	ripeRedeemAssets: bigint;
	/** Queued but not yet eligible. Advance warning, not yet an obligation. */
	pendingRedeemAssets: bigint;
	/** The earliest `fulfillBy` among ripe requests, as a unix timestamp. */
	earliestDeadline: number | null;

	/** Units held on each leg, scaled to 1e18. Neutral means these match. */
	spotUnits: bigint;
	perpUnits: bigint;

	/** Short-side funding, percent per hour. Positive means the position earns. */
	fundingShortPercentPerHour: number;
	/** Whether the spot leg can currently be routed in and out. */
	spotBuyable: boolean;
	spotSellable: boolean;
}

export interface Decision {
	kind: ActionKind;
	/** USDC for DEPLOY and UNWIND; zero otherwise. Always computed here. */
	amount: bigint;
	reason: string;
	/** True when the policy left no room for judgement. */
	forced: boolean;
}

/** Below 1% the correction costs more in fees than the drift costs in exposure. */
export const REBALANCE_DRIFT_BPS = 100;

/** Deploying dust burns two round trips of fees to earn funding on nothing. */
export const MIN_DEPLOY_USDC = 100_000_000n; // $100

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
 * Everything the agent is *allowed* to do right now, most urgent first.
 *
 * This is the complete option set. Anything not returned here cannot happen,
 * whatever any model says — which is what makes the model's role advisory in
 * fact and not just in intention.
 */
export function permittedActions(snapshot: VaultSnapshot, now: number): Decision[] {
	const options: Decision[] = [];

	// --- obligations ------------------------------------------------------

	const owed = snapshot.ripeRedeemAssets;
	if (owed > 0n) {
		const shortfall = owed > snapshot.freeAssets ? owed - snapshot.freeAssets : 0n;
		if (shortfall > 0n) {
			const withBuffer = shortfall + (shortfall * BigInt(UNWIND_BUFFER_BPS)) / BigInt(BPS);
			const amount = withBuffer > snapshot.deployedAssets ? snapshot.deployedAssets : withBuffer;
			if (amount >= MIN_UNWIND_USDC) {
				const urgent =
					snapshot.earliestDeadline !== null &&
					snapshot.earliestDeadline - now <= DEADLINE_URGENCY_SECONDS;
				options.push({
					kind: "UNWIND",
					amount,
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

	// --- hedge health -----------------------------------------------------

	const drift = driftBps(snapshot.spotUnits, snapshot.perpUnits);
	if (Math.abs(drift) >= REBALANCE_DRIFT_BPS) {
		options.push({
			kind: "REBALANCE",
			amount: 0n,
			reason: `The hedge is ${(drift / 100).toFixed(2)}% off neutral; the perp leg needs to move to match the spot leg.`,
			forced: false,
		});
	}

	// --- growth -----------------------------------------------------------

	const deployable = deployableAmount(snapshot);
	if (deployable >= MIN_DEPLOY_USDC && snapshot.spotBuyable) {
		options.push({
			kind: "DEPLOY",
			amount: deployable,
			reason: `${fmt(deployable)} is idle and the market pays ${(snapshot.fundingShortPercentPerHour * 24 * 365).toFixed(1)}% annualised.`,
			forced: false,
		});
	}

	options.push({
		kind: "HOLD",
		amount: 0n,
		reason: "Nothing needs doing; report NAV and wait.",
		forced: false,
	});

	return options;
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

// ---------------------------------------------------------------------------
// The advisory layer
// ---------------------------------------------------------------------------

export interface Advice {
	kind: ActionKind;
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
		const chosen = options.find((o) => o.kind === advice.kind);
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

function fmt(usdc: bigint): string {
	return `$${(Number(usdc) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
