import { TRADABLE_ASSET_CLASSES } from "@lemon/core";
import { Elysia, t } from "elysia";
import { getCandles, isResolution } from "../services/candles";
import { getMarket, getMarkets, getPrices } from "../services/markets";

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

			const resolution = query.resolution ?? "60";
			if (!isResolution(resolution)) {
				return status(400, { error: `Unsupported resolution: ${query.resolution}` });
			}

			const candles = await getCandles(market.pacifica.pacificaSymbol, resolution);

			return { symbol: market.symbol, resolution, candles };
		},
		{
			params: t.Object({ symbol: t.String() }),
			query: t.Object({ resolution: t.Optional(t.String()) }),
		},
	);
