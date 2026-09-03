import type { Candle } from "@lemon/core";
import { clients } from "../config";

/**
 * Chart resolutions.
 *
 * The app's resolution codes are TradingView-style ("1", "60", "D"); Pacifica
 * expects a suffixed interval ("1m", "1h", "1d"). The mapping lives here so the
 * chart component keeps its existing vocabulary, and so the market chart and
 * the basket index cannot drift apart on what a resolution means.
 */
export const INTERVALS = {
	"1": "1m",
	"5": "5m",
	"15": "15m",
	"30": "30m",
	"60": "1h",
	"240": "4h",
	D: "1d",
	W: "1w",
} as const;

export type Resolution = keyof typeof INTERVALS;

export const RESOLUTIONS = Object.keys(INTERVALS) as Resolution[];

/** How far back to fetch by default, per resolution, in seconds. */
export const DEFAULT_LOOKBACK: Record<Resolution, number> = {
	"1": 6 * 3600,
	"5": 24 * 3600,
	"15": 3 * 24 * 3600,
	"30": 7 * 24 * 3600,
	"60": 14 * 24 * 3600,
	"240": 60 * 24 * 3600,
	D: 365 * 24 * 3600,
	W: 3 * 365 * 24 * 3600,
};

export function isResolution(value: string | undefined): value is Resolution {
	return value !== undefined && value in INTERVALS;
}

/**
 * OHLCV for one market, oldest first.
 *
 * Sorted ascending because lightweight-charts requires it and silently renders
 * nothing when given an unsorted series — a failure that looks like missing
 * data rather than a bug.
 */
export async function getCandles(
	pacificaSymbol: string,
	resolution: Resolution,
	startTime?: number,
): Promise<Candle[]> {
	const from = startTime ?? Date.now() - DEFAULT_LOOKBACK[resolution] * 1000;
	const raw = await clients.pacifica.candles(pacificaSymbol, INTERVALS[resolution], from);

	return raw
		.map((candle) => ({
			time: candle.t,
			open: Number(candle.o),
			high: Number(candle.h),
			low: Number(candle.l),
			close: Number(candle.c),
			volume: Number(candle.v),
		}))
		.filter((candle) => Number.isFinite(candle.close))
		.sort((a, b) => a.time - b.time);
}
