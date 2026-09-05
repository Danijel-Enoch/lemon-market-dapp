/**
 * Auto-deleveraging risk for one leg of a basis position.
 *
 * ADL is the venue's last resort. When a trader is liquidated at a price worse
 * than their bankruptcy price and the insurance fund cannot absorb the
 * shortfall, the exchange does not eat the loss — it force-closes *profitable*
 * positions on the opposite side at the bankruptcy price until the book is
 * whole again. Nobody is asked and nothing can be done about it once it starts.
 *
 * For a delta-neutral vault this is the single worst thing the venue can do,
 * and the reason is worth stating plainly because it is counterintuitive:
 *
 *   The vault is short the perp. A short is only eligible for ADL while it is
 *   *in profit* — which, for a short, means the price has fallen. But a falling
 *   price is exactly what liquidates the longs whose bankruptcy triggers ADL in
 *   the first place. The two conditions are not independent; they are the same
 *   event seen from two sides.
 *
 *   So ADL takes away the winning leg precisely when the losing leg is at its
 *   worst. The vault is left holding spot that is down, with nothing hedging it,
 *   at the moment it most needed the hedge. That is the opposite of what the
 *   position was constructed to do, and it is not a tail case — it is the
 *   ordinary behaviour of the mechanism.
 *
 * There is no Pacifica endpoint for any of this. Venues that show an ADL
 * indicator rank open positions by the same quantity used here — unrealised
 * profit as a fraction of entry, multiplied by effective leverage — and process
 * the queue from the top. This module reproduces that quantity from public
 * position and price data.
 *
 * **What the number is not.** The ranking is *relative to every other position
 * in the book*, and the rest of the book is not visible from here. A high score
 * says this position sits near the front of the queue if the queue is ever
 * processed; it does not say the queue will be processed, and it is not a
 * probability. It is treated throughout as an exposure measure, never as a
 * forecast, and the UI copy is written to say so.
 *
 * The one input the vault actually controls is leverage: score is linear in it,
 * so a 3x vault sits three times deeper in the queue than a 1x vault at the same
 * drawdown. That is the lever, and it is chosen at vault creation.
 */

/** How near the front of the ADL queue a position sits. */
export type AdlBand = "none" | "low" | "elevated" | "high" | "severe" | "critical";

/**
 * Score thresholds for each band, and the lit-lamp count that goes with it.
 *
 * Real venues cut their five lamps at quintiles of the live queue, which needs
 * every open position on the book. These are fixed cut points instead, chosen so
 * that a vault at its mandated leverage lights lamps at drawdowns that matter
 * for that leverage: a 3x short crosses "elevated" around a 2% adverse move and
 * "severe" around 10%. Fixed thresholds are the honest choice here — a made-up
 * quintile would look like the real indicator while measuring something else.
 */
export const ADL_BANDS: ReadonlyArray<{ band: AdlBand; lamps: number; minScore: number }> = [
	{ band: "low", lamps: 1, minScore: 0 },
	{ band: "elevated", lamps: 2, minScore: 0.05 },
	{ band: "high", lamps: 3, minScore: 0.15 },
	{ band: "severe", lamps: 4, minScore: 0.3 },
	{ band: "critical", lamps: 5, minScore: 0.5 },
];

export interface AdlInputs {
	/** The side actually held. A basis vault is "short". */
	side: "long" | "short";
	entryPrice: number | null;
	markPrice: number | null;
	/** Position size in base units. Sign is ignored; `side` decides direction. */
	size: number;
	/** Equity backing the position, in USD. Leverage is notional over this. */
	equityUsd: number | null;
	/** Venue oracle, when known. Mark below oracle is forced selling in progress. */
	oraclePrice?: number | null;
	/** Close 24h ago, when known. Context for whether the queue is under load. */
	price24hAgo?: number | null;
}

export interface AdlRisk {
	/**
	 * Whether the position is in the queue at all. A losing position is never
	 * auto-deleveraged — only profitable ones are taken — so this is false for
	 * most of a position's life and flips exactly when the hedge starts winning.
	 */
	eligible: boolean;
	/** Profit fraction times effective leverage. Zero when not eligible. */
	score: number;
	/** 0–5. Zero means not in the queue; five means near the front of it. */
	lamps: number;
	band: AdlBand;
	/** Unrealised profit on this leg as a percent of entry. Negative is a loss. */
	profitPercent: number;
	effectiveLeverage: number | null;
	/**
	 * How much further the mark must move, in the direction that profits this
	 * leg, to reach the next band — as a percent of the current mark. This is
	 * the "how close is it" number: 1.2% means a 1.2% further fall puts a short
	 * into the next band.
	 *
	 * Null when there is no band above, and also — which is the interesting
	 * case — when the next band cannot be reached at any price. See
	 * `nextBandReachable`.
	 */
	headroomPercent: number | null;
	nextBand: AdlBand | null;
	/**
	 * False when no price move reaches the next band.
	 *
	 * Not a rounding artefact — it is how the score behaves. Profit adds equity
	 * and an adverse move shrinks notional, so effective leverage *falls* as the
	 * position wins, and the score, being profit times leverage, rises to a
	 * maximum and then declines. A position can be structurally incapable of
	 * reaching the top bands, which is worth saying plainly rather than showing
	 * a depositor an empty headroom field.
	 */
	nextBandReachable: boolean;
	/**
	 * Conditions that make the queue more likely to be *processed*, as opposed
	 * to where this position sits in it. Context only — deliberately kept apart
	 * from the score so the two are never read as one number.
	 */
	stress: {
		/** Mark minus oracle, as a percent of oracle. Negative is selling pressure. */
		markVsOraclePercent: number | null;
		change24hPercent: number | null;
	};
	/** One sentence for a tooltip or a log line. */
	summary: string;
}

const NONE: Omit<AdlRisk, "stress" | "summary"> = {
	eligible: false,
	score: 0,
	lamps: 0,
	band: "none",
	profitPercent: 0,
	effectiveLeverage: null,
	headroomPercent: null,
	nextBand: null,
	nextBandReachable: false,
};

export function adlRisk(inputs: AdlInputs): AdlRisk {
	const { side, entryPrice, markPrice, equityUsd } = inputs;
	const size = Math.abs(inputs.size);
	const stress = {
		markVsOraclePercent:
			markPrice !== null && inputs.oraclePrice != null && inputs.oraclePrice > 0
				? ((markPrice - inputs.oraclePrice) / inputs.oraclePrice) * 100
				: null,
		change24hPercent:
			markPrice !== null && inputs.price24hAgo != null && inputs.price24hAgo > 0
				? ((markPrice - inputs.price24hAgo) / inputs.price24hAgo) * 100
				: null,
	};

	if (
		entryPrice === null ||
		markPrice === null ||
		!(entryPrice > 0) ||
		!(markPrice > 0) ||
		size <= 0
	) {
		return {
			...NONE,
			stress,
			summary: "There is no open perp position to be auto-deleveraged.",
		};
	}

	// A short profits as the mark falls; a long as it rises.
	const profitRatio =
		side === "short"
			? (entryPrice - markPrice) / entryPrice
			: (markPrice - entryPrice) / entryPrice;
	const profitPercent = profitRatio * 100;

	const notional = size * markPrice;
	const equity = equityUsd !== null && equityUsd > 0 ? equityUsd : null;
	const leverage = equity !== null ? notional / equity : null;

	// Losing positions are not taken. This is the common case, and saying so
	// explicitly is more useful than a zero with no explanation.
	if (profitRatio <= 0 || equity === null || leverage === null || !Number.isFinite(leverage)) {
		return {
			...NONE,
			profitPercent,
			effectiveLeverage: leverage,
			stress,
			summary:
				profitRatio <= 0
					? `Not in the queue: only profitable positions are auto-deleveraged, and this ${side} is ${Math.abs(profitPercent).toFixed(2)}% down.`
					: "Not scored: the equity backing the position could not be read, so leverage is unknown.",
		};
	}

	const score = profitRatio * leverage;
	const index = lastIndexAtOrBelow(score);
	const current = ADL_BANDS[index];
	const next = ADL_BANDS[index + 1] ?? null;

	// How much further the mark must travel to reach the next band.
	//
	// Not `nextScore / leverage`. Leverage is not constant as the mark moves: the
	// profit that puts this position in the queue is *added to the equity* that
	// leverage is measured against, and the same move shrinks the notional. Held
	// fixed, it reports the next band as nearer than it is — on every position,
	// always in the alarming direction.
	const targetMark = next
		? markForScore(inputs, next.minScore, entryPrice, markPrice, size, equity)
		: null;
	const headroomPercent =
		targetMark === null
			? null
			: Math.max(
					0,
					((side === "short" ? markPrice - targetMark : targetMark - markPrice) / markPrice) * 100,
				);

	return {
		eligible: true,
		score,
		lamps: current.lamps,
		band: current.band,
		profitPercent,
		effectiveLeverage: leverage,
		headroomPercent,
		nextBand: next?.band ?? null,
		nextBandReachable: targetMark !== null,
		stress,
		summary: summarise(
			side,
			profitPercent,
			leverage,
			current.band,
			next?.band ?? null,
			headroomPercent,
		),
	};
}

function summarise(
	side: "long" | "short",
	profitPercent: number,
	leverage: number,
	band: AdlBand,
	next: AdlBand | null,
	headroom: number | null,
): string {
	const head = `This ${side} is ${profitPercent.toFixed(2)}% in profit at ${leverage.toFixed(2)}x, putting it in the "${band}" band of the auto-deleveraging queue`;
	if (!next) {
		return `${head} — the front of it. A liquidation cascade on the other side could close it without warning.`;
	}
	if (headroom === null) {
		return `${head}. "${next}" is not reachable from here: profit adds equity faster than it adds rank, so the score peaks below that band.`;
	}
	return `${head}. A further ${headroom.toFixed(2)}% ${side === "short" ? "fall" : "rise"} would reach "${next}".`;
}

/**
 * The mark at which this position's score first reaches `target`.
 *
 * Solved numerically rather than algebraically. The score is not monotonic in
 * the mark — it climbs, peaks, then falls away as accumulating profit dilutes
 * leverage — so the closed form has two roots and a sign case per side, and
 * picking the wrong root silently reports a price on the far side of the peak.
 * Scanning outward from the current mark and bisecting the first crossing finds
 * the *nearest* qualifying price, which is what "how close is it" means.
 *
 * Returns null when the target is never reached, which is a real answer.
 */
function markForScore(
	inputs: AdlInputs,
	target: number,
	entry: number,
	mark: number,
	size: number,
	equity: number,
): number | null {
	const short = inputs.side === "short";

	const at = (m: number): number => {
		// Equity moves with the mark: unrealised profit on this leg is part of it.
		const eq = equity + size * (short ? mark - m : m - mark);
		if (!(eq > 0) || !(m > 0)) return Number.NEGATIVE_INFINITY;
		const ratio = short ? (entry - m) / entry : (m - entry) / entry;
		if (ratio <= 0) return 0;
		return ratio * ((size * m) / eq);
	};

	// Walk outward in the profitable direction and take the first crossing. The
	// far bound is the mark reaching zero for a short, and five times entry for
	// a long — past any move worth planning around.
	const far = short ? 0 : Math.max(entry, mark) * 5;
	const STEPS = 400;
	let lo = mark;

	for (let i = 1; i <= STEPS; i += 1) {
		const hi = mark + ((far - mark) * i) / STEPS;
		if (at(hi) >= target) {
			// Bisect the bracket. Fifty halvings is far past double precision on
			// any realistic price, and bounded so a pathological input cannot spin.
			let a = lo;
			let b = hi;
			for (let k = 0; k < 50; k += 1) {
				const mid = (a + b) / 2;
				if (at(mid) >= target) b = mid;
				else a = mid;
			}
			return b;
		}
		lo = hi;
	}

	return null;
}

function lastIndexAtOrBelow(score: number): number {
	let index = 0;
	for (let i = 0; i < ADL_BANDS.length; i += 1) {
		if (score >= ADL_BANDS[i].minScore) index = i;
	}
	return index;
}
