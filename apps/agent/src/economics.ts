import { VENUE_FEES } from "@lemon/core";

/**
 * What an action costs to run, so the policy can refuse the ones that lose money.
 *
 * The agent's thresholds used to be fixed dollar amounts — deploy above $30,
 * top up above $5, unwind above a millionth of a cent. None of them consulted a
 * fee, a gas price or a quote, so none of them could answer the only question
 * that matters before a trade: *does this earn back what it costs?* A vault
 * holding $32 was closing $0.49 of position every sixty seconds, paying four
 * Base transactions and a cross-chain crossing each time, to correct a breach
 * worth a hundredth of its daily funding income.
 *
 * Every cost here is split into two halves, and the split is the point.
 *
 * **Fixed costs do not shrink with the trade.** Gas is the same whether a swap
 * moves ten dollars or ten thousand; a bridge charges per crossing; the venue's
 * withdrawal fee is flat. These are what make a small action uneconomic, and
 * they are why "trade a smaller amount" is never the answer to "this trade costs
 * too much" — it makes the ratio worse, not better.
 *
 * **Variable costs scale with notional.** Taker fees on both legs and the price
 * impact of crossing a thin pool. These do not decide whether to act; they
 * decide how long the position has to be held.
 *
 * Nothing here is a hidden constant. The venue fee schedule comes from
 * `@lemon/core`, the price impact and gas come from the Kyber quote the tick
 * already fetches, and the two figures that genuinely cannot be read from
 * anywhere — Base gas per transaction and the bridge's flat cut — are named,
 * defaulted conservatively, and overridable from the environment.
 */

/**
 * What one Base transaction costs, in USDC.
 *
 * An estimate, and deliberately a visible one. The agent sends its vault writes
 * through `simulateContract` and its swaps through a router, and neither path
 * prices the gas it is about to spend — viem estimates at send time and the
 * receipt is only readable afterwards, by which point the decision has been
 * made. So this is the one number in the cost model that is assumed rather than
 * quoted, and the whole model is only as honest as it is.
 *
 * Base is cheap and this is set above what a simple transfer costs, because the
 * failure mode of guessing low is an agent that churns fees believing they are
 * free, while guessing high only makes it wait for a better moment.
 *
 * Set `BASE_TX_GAS_USDC` to move it.
 */
export const BASE_TX_GAS_USDC = usdcFromEnv("BASE_TX_GAS_USDC", 10_000n); // $0.01

/**
 * What one bridge crossing costs beyond the relayer's proportional cut, in USDC.
 *
 * Relay's fee is taken out of the amount in transit and is only knowable once
 * the transfer fills — `bridge.ts` measures it as `sent - landed` and records it
 * on the activity row, which is the truth but arrives far too late to decide
 * anything. What can be said in advance is that a crossing has a floor: the
 * relayer's minimum, the destination-chain fee it fronts, and the Solana
 * signature on this side.
 *
 * This is that floor. It is the single largest reason a small unwind is a bad
 * trade, and the reason `unwindCost` charges it once per action rather than once
 * per market.
 *
 * Set `BRIDGE_CROSSING_USDC` to move it.
 */
export const BRIDGE_CROSSING_USDC = usdcFromEnv("BRIDGE_CROSSING_USDC", 250_000n); // $0.25

/**
 * How many times over an action must pay for itself before it is worth doing.
 *
 * Applied to the *fixed* half of the cost only. A trade that recovers exactly
 * what it cost has achieved nothing — it has moved the vault's money into two
 * venues' fee accounts and left the depositors where they started — so an action
 * has to clear its overhead by a margin wide enough that the estimate being
 * somewhat wrong does not flip the answer.
 *
 * Ten is deliberately conservative. The costs above are estimates, and the one
 * that matters most (Base gas) is the least certain of them; a multiple this
 * size means the decision survives being wrong by an order of magnitude in the
 * direction that costs money.
 *
 * Set `ACTION_PAYOFF_MULTIPLE` to move it.
 */
export const ACTION_PAYOFF_MULTIPLE = numberFromEnv("ACTION_PAYOFF_MULTIPLE", 10);

/**
 * The longest a deployment may take to earn back its own round trip.
 *
 * A basis position pays funding by the hour and pays its fees once, so every
 * deployment has a break-even horizon. Below that horizon it is a loss dressed
 * as a position. The web app already warns a human at thirty days
 * (`planBasis` in `@lemon/registry`); this is the agent refusing to enter one at
 * all, which is the same judgement made earlier and without a person watching.
 *
 * Set `MAX_BREAKEVEN_DAYS` to move it.
 */
export const MAX_BREAKEVEN_DAYS = numberFromEnv("MAX_BREAKEVEN_DAYS", 30);

/**
 * Transactions and crossings each action commits to, counted from `venue.ts`.
 *
 * Written down rather than folded into a single dollar figure so that a reader
 * can check them against the adapter. Approvals are counted as one because they
 * fire only when an allowance has run out, which is occasionally rather than
 * never — counting zero would understate every first trade into a market.
 */
const SHAPE = {
	/** agentWithdraw, relay approve + deposit, router approve, swap, reportActivity. */
	deploy: { baseTxs: 5, crossings: 1, withdrawals: 0 },
	/** router approve, spot sell, agentReturn, reportActivity. */
	unwind: { baseTxs: 4, crossings: 1, withdrawals: 1 },
	/** agentWithdraw, relay approve + deposit, reportActivity. */
	topUp: { baseTxs: 4, crossings: 1, withdrawals: 0 },
	/** One signed API call to Pacifica. No chain, no bridge, no gas. */
	rebalance: { baseTxs: 0, crossings: 0, withdrawals: 0 },
} as const;

export interface ActionCost {
	/** Everything this action costs, in USDC base units. */
	totalUsdc: bigint;
	/** The part that does not shrink with the trade: gas, bridge, withdrawal fee. */
	fixedUsdc: bigint;
	/** The part proportional to notional: taker fees and pool impact. */
	variableUsdc: bigint;
	/** One line naming the parts, for a decision's `reason`. */
	breakdown: string;
}

/** What the venue and the pool take, as a fraction of the notional traded. */
export interface TradeFrictions {
	/** Absolute price impact of the spot leg, percent. Zero for a perp-only action. */
	spotImpactPercent: number;
	/** The Kyber quote's own gas figure for the spot leg, USDC base units. */
	spotGasUsdc: bigint;
	/** Pacifica's flat withdrawal fee, USDC base units. */
	withdrawalFeeUsdc: bigint;
}

export const NO_FRICTIONS: TradeFrictions = {
	spotImpactPercent: 0,
	spotGasUsdc: 0n,
	withdrawalFeeUsdc: 0n,
};

/**
 * Price one action against the notional it would trade.
 *
 * `notionalUsdc` is what actually crosses a venue, not what the vault holds: an
 * unwind of $500 out of a $10,000 position pays fees on $500. Both legs are
 * charged where both legs move — an unwind closes a short *and* sells the spot
 * behind it, which is two taker fills, not one.
 */
export function costOf(
	kind: "deploy" | "unwind" | "topUp" | "rebalance",
	notionalUsdc: bigint,
	frictions: TradeFrictions = NO_FRICTIONS,
): ActionCost {
	const shape = SHAPE[kind];

	// A rebalance trades the perp leg and nothing else: no swap, no approval, no
	// Base transaction at all. So it pays no spot gas either — charging it the
	// aggregator's swap estimate would price a chain it never touches, and the
	// advisor is handed exactly these frictions for every option including this
	// one. `shape.baseTxs` is the honest test of whether a spot leg moves.
	const touchesSpot = shape.baseTxs > 0;
	const gas =
		BASE_TX_GAS_USDC * BigInt(shape.baseTxs) + (touchesSpot ? frictions.spotGasUsdc : 0n);
	const bridge = BRIDGE_CROSSING_USDC * BigInt(shape.crossings);
	const withdrawal = frictions.withdrawalFeeUsdc * BigInt(shape.withdrawals);
	const fixedUsdc = gas + bridge + withdrawal;

	// A rebalance moves the perp leg only, so it pays one taker fee and no pool
	// impact. Everything else crosses both venues.
	const takerPercent = touchesSpot
		? VENUE_FEES.perpTakerPercent + VENUE_FEES.spotTakerPercent
		: VENUE_FEES.perpTakerPercent;
	const impactPercent = touchesSpot ? Math.abs(frictions.spotImpactPercent) : 0;

	const notional = notionalUsdc > 0n ? notionalUsdc : 0n;
	const variableUsdc = percentOf(notional, takerPercent + impactPercent);

	const txs: number = shape.baseTxs;
	const parts = [`${txs} Base tx${txs === 1 ? "" : "s"}`];
	if (shape.crossings > 0) parts.push("1 crossing");
	if (shape.withdrawals > 0) parts.push("withdrawal fee");

	return {
		totalUsdc: fixedUsdc + variableUsdc,
		fixedUsdc,
		variableUsdc,
		breakdown: `${fmt(fixedUsdc)} fixed (${parts.join(", ")}) + ${fmt(variableUsdc)} on ${fmt(notional)} of notional`,
	};
}

/**
 * The smallest amount of this action that is worth committing to.
 *
 * Fixed cost times the payoff multiple: below this, the trade is mostly fee. It
 * is expressed as an *amount to move* rather than as a yes/no answer because the
 * right response to "too small" is usually to do more, not to do nothing — a
 * deleverage that has to close $0.49 can close $5 instead, land further inside
 * the mandate, and not be back next tick asking again.
 */
export function economicFloor(cost: ActionCost): bigint {
	return cost.fixedUsdc * BigInt(Math.max(1, Math.round(ACTION_PAYOFF_MULTIPLE)));
}

/**
 * Hours of funding needed to recover a cost, or null when funding will not.
 *
 * Null is not zero and must not be rendered as "free". A market whose short side
 * pays nothing, or costs money, never recovers an entry fee — the position is a
 * loss from the moment it opens, and the honest answer to "when does this pay
 * for itself" is "it does not".
 */
export function breakevenHours(
	costUsdc: bigint,
	notionalUsdc: bigint,
	fundingShortPercentPerHour: number,
): number | null {
	if (fundingShortPercentPerHour <= 0 || notionalUsdc <= 0n) return null;
	const perHourUsdc = percentOf(notionalUsdc, fundingShortPercentPerHour);
	if (perHourUsdc <= 0n) return null;
	return Number(costUsdc) / Number(perHourUsdc);
}

/** `breakevenHours`, phrased for a decision's reason. */
export function describeBreakeven(hours: number | null): string {
	if (hours === null) return "never — the short side is not paying funding";
	if (hours < 48) return `${hours.toFixed(1)} hours`;
	return `${(hours / 24).toFixed(1)} days`;
}

/**
 * A percent of a USDC amount, in integer arithmetic where it matters.
 *
 * The percent is a float because that is what both venues quote, but the amount
 * is money and stays exact until the multiplication. Scaled through basis points
 * rather than multiplied by a fraction, so a 0.1% fee on a large position does
 * not lose its last units to a double's mantissa.
 */
export function percentOf(amountUsdc: bigint, percent: number): bigint {
	if (amountUsdc <= 0n || !Number.isFinite(percent) || percent === 0) return 0n;
	// Percent to hundred-thousandths, which holds 0.001% exactly.
	const scaled = BigInt(Math.round(percent * 100_000));
	return (amountUsdc * scaled) / 10_000_000n;
}

function fmt(usdc: bigint): string {
	const dollars = Number(usdc) / 1e6;
	return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: dollars < 1 ? 4 : 2 })}`;
}

/**
 * Read a dollar amount from the environment as USDC base units.
 *
 * Parsed off the decimal string rather than through `Number`, because a float
 * cannot hold every 6-decimal amount exactly and these values gate money. A
 * malformed setting throws at import: a cost estimate that silently falls back
 * to its default is worse than one that refuses to start.
 */
export function usdcFromEnv(name: string, fallback: bigint): bigint {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;

	const parsed = /^(\d+)(?:\.(\d{1,6}))?$/.exec(raw);
	if (!parsed) {
		throw new Error(
			`${name} must be a dollar amount with at most 6 decimals (e.g. 30, 30.5), got "${raw}".`,
		);
	}
	return BigInt(parsed[1]) * 1_000_000n + BigInt((parsed[2] ?? "").padEnd(6, "0"));
}

/** Read a positive number from the environment, throwing at import on nonsense. */
export function numberFromEnv(name: string, fallback: number): number {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;

	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive number, got "${raw}".`);
	}
	return parsed;
}
