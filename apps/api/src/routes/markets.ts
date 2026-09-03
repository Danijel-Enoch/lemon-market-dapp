import { TRADABLE_ASSET_CLASSES } from "@lemon/core";
import { Elysia, t } from "elysia";
import { clients } from "../config";
import { getMarket, getMarkets, getPrices } from "../services/markets";

/**
 * Chart resolutions.
 *
 * The app's resolution codes are TradingView-style ("1", "60", "D"); Pacifica
 * expects a suffixed interval ("1m", "1h", "1d"). The mapping lives here so the
 * chart component keeps its existing vocabulary.
 */
const INTERVALS = {
	"1": "1m",
	"5": "5m",
	"15": "15m",
	"30": "30m",
	"60": "1h",
	"240": "4h",
	D: "1d",
	W: "1w",
} as const;

type Resolution = keyof typeof INTERVALS;

/** How far back to fetch by default, per resolution, in seconds. */
const DEFAULT_LOOKBACK: Record<Resolution, number> = {
	"1": 6 * 3600,
	"5": 24 * 3600,
	"15": 3 * 24 * 3600,
	"30": 7 * 24 * 3600,
	"60": 14 * 24 * 3600,
	"240": 60 * 24 * 3600,
	D: 365 * 24 * 3600,
	W: 3 * 365 * 24 * 3600,
};

export const marketRoutes = new Elysia({ prefix: "/markets" })
	/**
	 * The tradable universe: every market Pacifica lists — crypto, equities, FX,
	 * metals, commodities and indices. `assetClass` narrows it for the UI, but
	 * nothing is filtered out by default, so a new listing appears on its own.
	 */
	.get(
		"/",
		async ({ query }) => {
			const markets = await getMarkets(query.refresh === "true");
			const filtered = query.assetClass
				? markets.filter((market) => market.assetClass === query.assetClass)
				: markets;
			return { markets: filtered, count: filtered.length };
		},
		{
			query: t.Object({
				assetClass: t.Optional(t.Union(TRADABLE_ASSET_CLASSES.map((value) => t.Literal(value)))),
				refresh: t.Optional(t.String()),
			}),
		},
	)

	/** Latest mark price for every market, keyed by display symbol. */
	.get("/prices", async () => {
		return { prices: await getPrices() };
	})

	.get(
		"/:symbol",
		async ({ params, status }) => {
			// Route params cannot contain "/", so BTC-USD style is accepted and
			// normalised on the way through.
			const market = await getMarket(params.symbol);
			if (!market) return status(404, { error: `Unknown market: ${params.symbol}` });
			return market;
		},
		{ params: t.Object({ symbol: t.String() }) },
	)

	/**
	 * OHLCV for the price chart.
	 *
	 * Candle times are normalised to the millisecond `time` the chart expects,
	 * and rows are returned oldest-first — lightweight-charts requires ascending
	 * time and silently renders nothing when given an unsorted series.
	 */
	.get(
		"/:symbol/candles",
		async ({ params, query, status }) => {
			const market = await getMarket(params.symbol);
			if (!market) return status(404, { error: `Unknown market: ${params.symbol}` });

			const resolution = (query.resolution ?? "60") as Resolution;
			const interval = INTERVALS[resolution];
			if (!interval) {
				return status(400, { error: `Unsupported resolution: ${query.resolution}` });
			}

			const lookbackSeconds = DEFAULT_LOOKBACK[resolution];
			const startTime = Date.now() - lookbackSeconds * 1000;

			const raw = await clients.pacifica.candles(
				market.pacifica.pacificaSymbol,
				interval,
				startTime,
			);

			const candles = raw
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

			return { symbol: market.symbol, resolution, candles };
		},
		{
			params: t.Object({ symbol: t.String() }),
			query: t.Object({ resolution: t.Optional(t.String()) }),
		},
	);
