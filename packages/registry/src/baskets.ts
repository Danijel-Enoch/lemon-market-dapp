import type { Candle } from "@lemon/avantis";

export interface BasketLeg {
	/** Avantis market symbol, e.g. "BTC/USD". */
	marketSymbol: string;
	/** Base ticker, used to resolve the spot token. */
	ticker: string;
}

export interface BasketDefinition {
	id: string;
	name: string;
	description: string;
	assetClass: "crypto" | "equity";
	legs: BasketLeg[];
}

/**
 * Curated baskets: enter several correlated markets in one flow.
 *
 * Legs are **equal weight by notional** — $1,000 into a four-leg basket puts
 * $250 into each. That keeps the position consistent with how the index is
 * computed below.
 */
export const BASKETS: readonly BasketDefinition[] = [
	{
		id: "blue-chip",
		name: "Blue Chip",
		description: "The majors: Bitcoin, Ethereum, Solana and XRP, equally weighted.",
		assetClass: "crypto",
		legs: [
			{ marketSymbol: "BTC/USD", ticker: "BTC" },
			{ marketSymbol: "ETH/USD", ticker: "ETH" },
			{ marketSymbol: "SOL/USD", ticker: "SOL" },
			{ marketSymbol: "XRP/USD", ticker: "XRP" },
		],
	},
	{
		id: "big-tech",
		name: "Big Tech",
		description: "Tokenized US mega-cap tech: Nvidia, Apple, Meta and Alphabet.",
		assetClass: "equity",
		legs: [
			{ marketSymbol: "NVDA/USD", ticker: "NVDA" },
			{ marketSymbol: "AAPL/USD", ticker: "AAPL" },
			{ marketSymbol: "META/USD", ticker: "META" },
			{ marketSymbol: "GOOG/USD", ticker: "GOOGL" },
		],
	},
] as const;

export function findBasket(id: string): BasketDefinition | undefined {
	return BASKETS.find((basket) => basket.id === id);
}

export interface IndexPoint {
	/** Unix milliseconds. */
	time: number;
	/** Index level, rebased to 100 at the start of the window. */
	value: number;
}

/**
 * Build an equal-weighted index from the constituents' candles.
 *
 * Averaging raw prices would be meaningless here: Bitcoin near $77,000 and
 * Solana near $100 in the same arithmetic mean is simply Bitcoin's chart with
 * rounding error. So each series is rebased to 100 at the start of the window
 * and the *normalised* levels are averaged — every leg then contributes its
 * percentage move equally, which is what "equal weight" has to mean for a
 * combined chart.
 *
 * Only timestamps present in every series are used. Interpolating across a
 * missing leg would invent price action, and these markets keep different
 * sessions — crypto is 24/7 while equities close — so gaps are expected rather
 * than exceptional.
 */
export function buildIndexSeries(series: Candle[][]): IndexPoint[] {
	const usable = series.filter((candles) => candles.length > 0);
	if (usable.length === 0) return [];

	// Intersect timestamps so every point averages the same set of legs.
	const [first, ...rest] = usable;
	let times = first.map((candle) => candle.time);
	for (const candles of rest) {
		const available = new Set(candles.map((candle) => candle.time));
		times = times.filter((time) => available.has(time));
	}
	if (times.length === 0) return [];

	const byTime = usable.map(
		(candles) => new Map(candles.map((candle) => [candle.time, candle.close])),
	);

	const bases = byTime.map((map) => map.get(times[0]) ?? 0);
	if (bases.some((base) => !base)) return [];

	return times.map((time) => {
		let total = 0;
		for (const [index, map] of byTime.entries()) {
			const close = map.get(time) ?? bases[index];
			total += (close / bases[index]) * 100;
		}
		return { time, value: total / byTime.length };
	});
}

/** Equal-weighted percentage change of the index over the window. */
export function indexChangePercent(points: IndexPoint[]): number {
	if (points.length < 2) return 0;
	const first = points[0].value;
	const last = points[points.length - 1].value;
	return first === 0 ? 0 : ((last - first) / first) * 100;
}

/** Notional per leg for an equal-weighted entry. */
export function splitEqually(totalUsd: number, legCount: number): number {
	return legCount > 0 ? totalUsd / legCount : 0;
}
