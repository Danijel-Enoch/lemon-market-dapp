import { BPS } from "@lemon/contracts";
import { toUnits } from "./valuation";

/**
 * Pricing a spot leg on the perp's clock instead of the pool's.
 *
 * The vault holds two legs that are meant to cancel: tokenized equity on Base and
 * a short on Pacifica. They only cancel if they are priced off the same thing.
 * They were not. The perp leg marks continuously off the venue's mark, while the
 * spot leg was an executable Kyber quote — and a thin Aerodrome pool only
 * reprices when somebody happens to trade it. So the spot leg held a stale number
 * while the perp leg moved, and the vault was marked as a naked short for minutes
 * at a time: NVDA up, share price down; NVDA down, share price up. Then the pool
 * traded, the quote caught up in one step, and the share price snapped back.
 *
 * Measured on the live vault at hourly reports, that artifact was moving NAV more
 * in five minutes (0.11%) than the whole day of real profit and loss (0.096%).
 *
 * **The haircut was never the problem.** Quoting the whole holding rather than a
 * unit price scaled up is correct and stays: a tokenized equity on a thin pool
 * shows a mid several percent above what a sale would actually clear, and a NAV
 * built on mids reports a vault richer than it can liquidate. What was wrong was
 * the *clock*, not the *level*. So the level is kept — as a ratio measured against
 * the mark, held steady across ticks — and only the timing changes:
 *
 *     spot value  =  units × mark × settled execution ratio
 *
 * Both legs now move on one feed and cancel by construction. Pool depth still
 * marks the vault down, but only when depth actually changes rather than when
 * nobody happens to be trading.
 *
 * **Every fallback is the old behaviour exactly.** No pool still refuses, an
 * unreadable mark still uses the raw quote, and so do the warm-up and dislocation
 * paths below. This can only ever replace a quote with a smoothed version of
 * itself; there is no state in which it invents a value the pool never offered.
 */

/** Fixed point for the execution ratio. One unit is "sells for exactly the mark". */
export const RATIO_UNIT = 10n ** 18n;

/**
 * How many ticks the median is taken over.
 *
 * The agent ticks every 60s and reports every funding hour, so sixty samples is
 * about one report period: each report's haircut is the median of the quotes seen
 * since the last one. That is the longest window that still tracks a real change
 * in pool depth within one chart point, and long enough that the handful of
 * distinct levels a quiet pool actually quotes cannot be swung by any one of them.
 */
export const HAIRCUT_WINDOW = 60;

/**
 * How many samples before the median is trusted at all.
 *
 * Below this the raw quote is used, which is where a restarted agent starts. Ten
 * minutes of warm-up is the cost of not persisting this across restarts, and it
 * is the right trade: a haircut recovered from disk is a haircut measured against
 * pool depth that may be hours gone.
 */
export const HAIRCUT_MIN_SAMPLES = 10;

/**
 * How old a sample can be and still count.
 *
 * A count window is only a time window while ticks are regular. An agent that was
 * paused, rate-limited or restarted comes back holding samples measured against
 * depth that has since moved, and taking a median over those is the same staleness
 * bug in a different place.
 */
export const HAIRCUT_MAX_AGE_SECONDS = 2 * 60 * 60;

/**
 * How far the live quote may sit from the settled one before it is believed.
 *
 * Wide on purpose. Ordinary jitter on the live vault is around 16 bps, so this is
 * nearly twenty times the noise it exists to ignore — it is not a smoothing knob,
 * it is the catch for a pool that has genuinely dislocated, where continuing to
 * mark off a comfortable median would report a vault richer than it can liquidate.
 * When it trips, the raw executable quote wins, which is the conservative number
 * and the one this module replaced.
 */
export const HAIRCUT_DISLOCATION_BPS = 300;

/**
 * What a holding is worth at the perp venue's mark, in USDC.
 *
 * The reference the ratio is measured against, and the number that carries the
 * price movement once the ratio is held steady. Zero when the mark cannot be read,
 * which the caller reads as "fall back to the quote" rather than "worth nothing".
 */
export function markValueUsdc(balance: bigint, decimals: number, markPriceUsd: number): bigint {
	if (!Number.isFinite(markPriceUsd) || markPriceUsd <= 0) return 0n;
	if (balance <= 0n) return 0n;
	// The mark is a float from the venue; six decimals of USDC is the precision
	// everything downstream is denominated in anyway.
	const price = BigInt(Math.round(markPriceUsd * 1e6));
	return (toUnits(balance, decimals) * price) / RATIO_UNIT;
}

/**
 * What a sale returns per unit of mark value, as a 1e18 fixed point.
 *
 * Carried at this precision rather than as bps because bps is too coarse to value
 * with: one bps of a $16 leg is $0.0016, which on a $36 vault is 44 ppm of share
 * price — twenty times an hour of management fee. Bps is fine for deciding and
 * for reading; it is not fine for multiplying.
 */
export function executionRatio(sellQuoteUsdc: bigint, referenceUsdc: bigint): bigint | null {
	if (referenceUsdc <= 0n || sellQuoteUsdc < 0n) return null;
	return (sellQuoteUsdc * RATIO_UNIT) / referenceUsdc;
}

/** The ratio applied back to a mark value. */
export function atRatio(referenceUsdc: bigint, ratio: bigint): bigint {
	return (referenceUsdc * ratio) / RATIO_UNIT;
}

/** The same ratio as a haircut in bps, for logs and for the dislocation test. */
export function haircutBps(ratio: bigint): number {
	return Number(((RATIO_UNIT - ratio) * BigInt(BPS)) / RATIO_UNIT);
}

/**
 * The middle sample.
 *
 * A median rather than a mean because the thing being smoothed is a step
 * function, not noise around a level. A quiet pool quotes the same number for
 * minutes and then jumps; a mean would carry every jump partway into the NAV
 * forever, while a median ignores an excursion until it becomes the new normal.
 *
 * An even window takes the lower of the two middles rather than averaging them.
 * Two reasons, and both matter for a number that becomes a share price: the
 * answer is always a ratio the pool actually quoted rather than one interpolated
 * between two it did, and where the two middles differ the lower is the more
 * conservative mark. Averaging also makes the result oscillate by half the gap
 * between the central levels as samples enter and leave the window — which is a
 * smaller version of exactly the artifact this module exists to remove.
 */
export function median(values: bigint[]): bigint | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	return sorted[(sorted.length - 1) >> 1];
}

export interface HaircutOptions {
	window?: number;
	minSamples?: number;
	maxAgeSeconds?: number;
}

export interface HaircutTracker {
	observe(ticker: string, ratio: bigint, at: number): void;
	/** The median of the live window, or null while it is still warming up. */
	settled(ticker: string, at: number): bigint | null;
	/** How many samples currently count, for the log line and the tests. */
	depth(ticker: string, at: number): number;
}

/**
 * Per-market sample windows, held in the adapter's own process.
 *
 * Deliberately not persisted. See `HAIRCUT_MIN_SAMPLES` — an old haircut is worse
 * than no haircut, because the fallback is a correct number and the recovered
 * value may not be.
 */
export function createHaircutTracker(options: HaircutOptions = {}): HaircutTracker {
	const window = options.window ?? HAIRCUT_WINDOW;
	const minSamples = options.minSamples ?? HAIRCUT_MIN_SAMPLES;
	const maxAge = options.maxAgeSeconds ?? HAIRCUT_MAX_AGE_SECONDS;
	const samples = new Map<string, Array<{ ratio: bigint; at: number }>>();

	function live(ticker: string, at: number): Array<{ ratio: bigint; at: number }> {
		const held = samples.get(ticker) ?? [];
		const fresh = held.filter((sample) => at - sample.at <= maxAge);
		if (fresh.length !== held.length) samples.set(ticker, fresh);
		return fresh;
	}

	return {
		observe(ticker, ratio, at) {
			const held = live(ticker, at);
			held.push({ ratio, at });
			while (held.length > window) held.shift();
			samples.set(ticker, held);
		},
		settled(ticker, at) {
			const held = live(ticker, at);
			return held.length < minSamples ? null : median(held.map((sample) => sample.ratio));
		},
		depth(ticker, at) {
			return live(ticker, at).length;
		},
	};
}

export interface SpotMarkInputs {
	ticker: string;
	/** What an executable sale of the whole holding returns. Null is "no pool". */
	sellQuoteUsdc: bigint | null;
	/** The same holding at the perp venue's mark. Zero when the mark is unreadable. */
	referenceUsdc: bigint;
	at: number;
}

/** Which rule produced the value, for the log line and the tests. */
export type SpotMarkBasis = "no-pool" | "unmarked" | "warming" | "dislocated" | "settled";

export interface SpotMark {
	/** Null propagates the refusal: `value()` stales the vault rather than guess. */
	valueUsdc: bigint | null;
	basis: SpotMarkBasis;
	haircutBps: number | null;
}

/**
 * Price one spot leg, and record what the pool said while doing it.
 *
 * The sample is taken before the dislocation test on purpose. A pool that has
 * genuinely thinned should pull the median toward the new level over the next
 * window and settle there — the band is a check on any *one* quote, not a filter
 * that keeps reality out of the average.
 */
export function markSpotLeg(
	tracker: HaircutTracker,
	inputs: SpotMarkInputs,
	dislocationBps: number = HAIRCUT_DISLOCATION_BPS,
): SpotMark {
	const { ticker, sellQuoteUsdc, referenceUsdc, at } = inputs;

	// Unchanged: an unroutable pool is an unknown value, not a cheap one.
	if (sellQuoteUsdc === null) return { valueUsdc: null, basis: "no-pool", haircutBps: null };

	const liveRatio = executionRatio(sellQuoteUsdc, referenceUsdc);
	// No mark to price against — which is also the empty-balance case, where the
	// quote is zero and so is the answer.
	if (liveRatio === null) {
		return { valueUsdc: sellQuoteUsdc, basis: "unmarked", haircutBps: null };
	}

	tracker.observe(ticker, liveRatio, at);
	const settledRatio = tracker.settled(ticker, at);
	const live = haircutBps(liveRatio);

	if (settledRatio === null) {
		return { valueUsdc: sellQuoteUsdc, basis: "warming", haircutBps: live };
	}

	const settled = haircutBps(settledRatio);
	if (Math.abs(live - settled) > dislocationBps) {
		return { valueUsdc: sellQuoteUsdc, basis: "dislocated", haircutBps: live };
	}

	return {
		valueUsdc: atRatio(referenceUsdc, settledRatio),
		basis: "settled",
		haircutBps: settled,
	};
}
