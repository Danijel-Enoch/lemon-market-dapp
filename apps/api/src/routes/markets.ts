import type { Resolution } from "@lemon/avantis";
import { Elysia, t } from "elysia";
import { clients } from "../config";
import { getMarket, getMarkets } from "../services/markets";

const RESOLUTIONS = ["1", "5", "15", "30", "60", "240", "D", "W"] as const;

/** How far back to fetch by default, per resolution, in seconds. */
const DEFAULT_LOOKBACK: Record<string, number> = {
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
	 * The tradable universe: listed Avantis equity and FX pairs only.
	 * Crypto and commodity pairs are filtered out upstream in
	 * `selectTradableMarkets`, by asset class rather than a hardcoded list, so
	 * newly listed equities appear here without a code change.
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
				assetClass: t.Optional(t.Union([t.Literal("equity"), t.Literal("fx")])),
				refresh: t.Optional(t.String()),
			}),
		},
	)
	/** Latest price for every pair, keyed by pair index. */
	.get("/prices", async () => {
		const prices = await clients.avantisFeed.getLastPrices();
		return { prices: Object.fromEntries(prices) };
	})

	.get(
		"/:symbol",
		async ({ params, status }) => {
			// Route params cannot contain "/", so ETH-USD style is accepted and
			// normalised by findMarketBySymbol.
			const market = await getMarket(params.symbol);
			if (!market) return status(404, { error: `Unknown market: ${params.symbol}` });
			return market;
		},
		{ params: t.Object({ symbol: t.String() }) },
	)

	/**
	 * OHLCV candles.
	 *
	 * The symbol is translated to the pair's Pyth identifier here rather than
	 * exposing that detail to callers — the feed shim silently returns an empty
	 * array for the trading symbol, which is indistinguishable from "no data".
	 */
	.get(
		"/:symbol/candles",
		async ({ params, query, status }) => {
			const market = await getMarket(params.symbol);
			if (!market) return status(404, { error: `Unknown market: ${params.symbol}` });
			if (!market.pythSymbol) {
				return status(404, { error: `${market.symbol} has no price feed symbol.` });
			}

			const resolution = (query.resolution ?? "60") as Resolution;
			const to = query.to ?? Math.floor(Date.now() / 1000);
			const from = query.from ?? to - (DEFAULT_LOOKBACK[resolution] ?? 14 * 24 * 3600);

			const candles = await clients.avantisFeed.getCandles({
				pythSymbol: market.pythSymbol,
				resolution,
				from,
				to,
			});

			return { symbol: market.symbol, resolution, candles };
		},
		{
			params: t.Object({ symbol: t.String() }),
			query: t.Object({
				resolution: t.Optional(t.Union(RESOLUTIONS.map((value) => t.Literal(value)))),
				from: t.Optional(t.Number()),
				to: t.Optional(t.Number()),
			}),
		},
	);
