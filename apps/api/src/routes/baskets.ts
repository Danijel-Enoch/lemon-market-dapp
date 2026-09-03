import { Elysia, t } from "elysia";
import { getBasket, getBasketIndex, listBaskets, planBasket } from "../services/baskets";
import type { Resolution } from "../services/candles";

const RESOLUTIONS = ["1", "5", "15", "30", "60", "240", "D", "W"] as const;

const LOOKBACK: Record<string, number> = {
	"1": 6 * 3600,
	"5": 24 * 3600,
	"15": 3 * 24 * 3600,
	"30": 7 * 24 * 3600,
	"60": 14 * 24 * 3600,
	"240": 60 * 24 * 3600,
	D: 365 * 24 * 3600,
	W: 3 * 365 * 24 * 3600,
};

export const basketRoutes = new Elysia({ prefix: "/baskets" })
	.get("/", async () => ({ baskets: await listBaskets() }))

	.get(
		"/:id",
		async ({ params, status }) => {
			const basket = await getBasket(params.id);
			if (!basket) return status(404, { error: `Unknown basket: ${params.id}` });
			return basket;
		},
		{ params: t.Object({ id: t.String() }) },
	)

	/** Composite index chart: constituents rebased to 100 and averaged. */
	.get(
		"/:id/candles",
		async ({ params, query, status }) => {
			const resolution = (query.resolution ?? "60") as Resolution;
			const to = query.to ?? Math.floor(Date.now() / 1000);
			const from = query.from ?? to - (LOOKBACK[resolution] ?? 14 * 24 * 3600);

			// The query is in seconds, as TradingView-style ranges are; Pacifica
			// takes milliseconds. Passing seconds through would silently ask for
			// candles starting in 1970 and return nothing.
			const index = await getBasketIndex(params.id, resolution, from * 1000);
			if (!index) return status(404, { error: `Unknown basket: ${params.id}` });
			return { basketId: params.id, resolution, ...index };
		},
		{
			params: t.Object({ id: t.String() }),
			query: t.Object({
				resolution: t.Optional(t.Union(RESOLUTIONS.map((value) => t.Literal(value)))),
				from: t.Optional(t.Number()),
				to: t.Optional(t.Number()),
			}),
		},
	)

	.post(
		"/:id/plan",
		async ({ params, body, status }) => {
			const plan = await planBasket({
				basketId: params.id,
				venue: body.venue,
				totalUsd: body.totalUsd,
				leverage: body.leverage ?? 1,
			});
			if (!plan) return status(404, { error: `Unknown basket: ${params.id}` });
			return plan;
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				venue: t.Union([t.Literal("perp"), t.Literal("spot")]),
				totalUsd: t.Number({ minimum: 1 }),
				leverage: t.Optional(t.Number({ minimum: 1 })),
			}),
		},
	);
