import { requestJson } from "@lemon/core";

export const DEFAULT_FEED_URL = "https://feed-v3.avantisfi.com";
export const TESTNET_FEED_URL = "https://feed-v3-testnet.avantisfi.com";

/** TradingView-style resolutions the shim accepts. */
export type Resolution = "1" | "5" | "15" | "30" | "60" | "240" | "D" | "W";

export interface Candle {
	/** Unix milliseconds. */
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
}

interface RawCandle {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	source?: number;
}

interface RawLastPrice {
	t: number;
	c: number;
	pairIndex: number;
}

/**
 * Price and OHLCV feed.
 *
 * Candles are keyed by the *Pyth* symbol ("Equity.US.NVDA/USD"), not the
 * Avantis trading symbol ("NVDA/USD") — passing the trading symbol returns an
 * empty array rather than an error, which reads as "no data" instead of "wrong
 * identifier". The Pyth symbol comes from the pair catalog's feed attributes.
 */
export class AvantisFeedClient {
	private readonly baseUrl: string;
	private readonly timeoutMs: number;

	constructor(options: { baseUrl?: string; timeoutMs?: number } = {}) {
		this.baseUrl = options.baseUrl ?? DEFAULT_FEED_URL;
		this.timeoutMs = options.timeoutMs ?? 20_000;
	}

	async getCandles(params: {
		pythSymbol: string;
		resolution: Resolution;
		/** Unix seconds. */
		from: number;
		to: number;
	}): Promise<Candle[]> {
		const raw = await requestJson<RawCandle[]>(
			"avantis-feed",
			this.baseUrl,
			"/v1/shims/tradingview/history",
			{
				query: {
					symbol: params.pythSymbol,
					resolution: params.resolution,
					from: params.from,
					to: params.to,
				},
				timeoutMs: this.timeoutMs,
			},
		);

		if (!Array.isArray(raw)) return [];
		return raw
			.filter((candle) => Number.isFinite(candle.close))
			.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
			.sort((a, b) => a.time - b.time);
	}

	/** Latest price for every pair, keyed by pair index. */
	async getLastPrices(): Promise<Map<number, { price: number; at: number }>> {
		const raw = await requestJson<RawLastPrice[]>(
			"avantis-feed",
			this.baseUrl,
			"/v1/price-feeds/last-price",
			{ timeoutMs: this.timeoutMs },
		);

		const prices = new Map<number, { price: number; at: number }>();
		for (const entry of raw ?? []) {
			prices.set(entry.pairIndex, { price: entry.c, at: entry.t });
		}
		return prices;
	}
}
