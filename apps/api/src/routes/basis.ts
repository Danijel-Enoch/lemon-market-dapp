import { isDatabaseConfigured } from "@lemon/db";
import { Elysia, t } from "elysia";
import { AuthError, readSession, SESSION_COOKIE } from "../services/auth";
import * as basis from "../services/basis";
import { getBasisMarket, listBasisMarkets } from "../services/basis-markets";
import { getCandles, isResolution, RESOLUTIONS } from "../services/candles";

/**
 * Basis markets and the positions taken in them.
 *
 * One prefix covers both because they are the same object at two stages: a
 * market is what a position is opened into, and a position quotes back the
 * market it came from. Splitting them across prefixes only makes a caller do
 * two lookups to answer one question.
 */

/**
 * The signed-in user, for the legs this server executes.
 *
 * The short leg is placed with the session's Pacifica agent key, so unlike the
 * reporting endpoints it cannot be driven by an address in the query string.
 */
async function requireUser(token: unknown) {
	const session = await readSession(typeof token === "string" ? token : undefined);
	if (!session) throw new AuthError("Sign in to trade the hedge leg.");
	return session.user;
}

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });

/** Positions span two systems and must survive a reload, so they need a DB. */
const requireDb = (status: (code: number, body: unknown) => unknown) =>
	isDatabaseConfigured()
		? null
		: status(503, {
				error: "Basis positions need a database. Set DATABASE_URL and run `bun run db:deploy`.",
			});

export const basisRoutes = new Elysia({ prefix: "/basis" })
	/**
	 * Every pair where both legs exist, ranked by net yield after costs.
	 *
	 * Untradable markets are included with their reason rather than filtered
	 * out — a symbol that has silently vanished from the board is
	 * indistinguishable from one that was never listed, and the reason is the
	 * part worth knowing.
	 */
	.get(
		"/markets",
		async ({ query }) => {
			const { markets, unpaired, routabilityKnown } = await listBasisMarkets(
				query.refresh === "true",
			);
			const filtered = query.assetClass
				? markets.filter((market) => market.assetClass === query.assetClass)
				: markets;

			return {
				markets: filtered,
				count: filtered.length,
				tradable: filtered.filter((market) => market.blockers.length === 0).length,
				// Spot legs waiting on a perp listing. Not filtered by asset class:
				// the whole point is to show what the platform would list if the
				// venue caught up, which is a smaller list than it looks.
				unpaired,
				routabilityKnown,
			};
		},
		{
			query: t.Object({
				assetClass: t.Optional(t.Union([t.Literal("equity"), t.Literal("crypto")])),
				refresh: t.Optional(t.String()),
			}),
		},
	)

	/** One market. Accepts the ticker or either leg's symbol. */
	.get(
		"/markets/:id",
		async ({ params, status }) => {
			const market = await getBasisMarket(params.id);
			if (!market) return status(404, { error: `No basis market for ${params.id}` });
			return market;
		},
		{ params: t.Object({ id: t.String() }) },
	)

	/**
	 * OHLCV for the market chart.
	 *
	 * These are the **perp mark**, not the basis spread. No venue publishes a
	 * historical series for a tokenized equity on Base, so a spread history
	 * would have to be reconstructed from our own snapshots — which exist only
	 * from the day the platform started taking them. Serving the perp candles
	 * and labelling them honestly beats synthesising a spread history that
	 * would look authoritative and be partly invented.
	 */
	.get(
		"/markets/:id/candles",
		async ({ params, query, status }) => {
			const market = await getBasisMarket(params.id);
			if (!market) return status(404, { error: `No basis market for ${params.id}` });

			const resolution = query.resolution ?? "60";
			if (!isResolution(resolution)) {
				return status(400, {
					error: `Unsupported resolution: ${query.resolution}. Try one of ${RESOLUTIONS.join(", ")}.`,
				});
			}

			const candles = await getCandles(market.perp.pacificaSymbol, resolution);

			return {
				marketId: market.id,
				series: "perp_mark" as const,
				symbol: market.perp.symbol,
				resolution,
				candles,
				/** The live spot reading, so the chart can mark where the other leg sits. */
				spotPriceUsd: market.spot.priceUsd,
				basisPercent: market.economics.basisPercent,
			};
		},
		{
			params: t.Object({ id: t.String() }),
			query: t.Object({ resolution: t.Optional(t.String()) }),
		},
	)

	/** Price a position without committing. Quotes both legs live, at real size. */
	.post(
		"/plan",
		async ({ body, status }) => {
			const plan = await basis.buildPlan(body);
			if (!plan) return status(404, { error: `No basis market for ${body.symbol}` });
			return plan;
		},
		{
			body: t.Object({
				symbol: t.String(),
				notionalUsd: t.Number({ minimum: 1 }),
				perpLeverage: t.Number({ minimum: 1 }),
			}),
		},
	)

	// --- Positions ----------------------------------------------------------

	.get(
		"/positions",
		async ({ query, status }) => {
			const blocked = requireDb(status as never);
			if (blocked) return blocked;
			return { positions: await basis.listPositions(query.user) };
		},
		{ query: t.Object({ user: addressSchema }) },
	)

	/** Positions left half-open. Surfaced so the UI can nag rather than hide them. */
	.get(
		"/positions/attention/:user",
		async ({ params, status }) => {
			const blocked = requireDb(status as never);
			if (blocked) return blocked;

			const positions = await basis.listOrphaned(params.user);
			return {
				positions: positions.map((position) => ({
					position,
					repairOptions: basis.repairOptions(position),
				})),
			};
		},
		{ params: t.Object({ user: addressSchema }) },
	)

	.get(
		"/positions/:id",
		async ({ params, status }) => {
			const blocked = requireDb(status as never);
			if (blocked) return blocked;

			const position = await basis.getPosition(params.id);
			if (!position) return status(404, { error: "Position not found" });
			return { position, repairOptions: basis.repairOptions(position) };
		},
		{ params: t.Object({ id: t.String() }) },
	)

	.post(
		"/positions",
		async ({ body, status }) => {
			const blocked = requireDb(status as never);
			if (blocked) return blocked;

			const position = await basis.createPosition(body);
			if (!position) return status(404, { error: `No basis market for ${body.symbol}` });
			return position;
		},
		{
			body: t.Object({
				userAddress: addressSchema,
				symbol: t.String(),
				notionalUsd: t.Number({ minimum: 1 }),
				perpLeverage: t.Number({ minimum: 1 }),
			}),
		},
	)

	// --- Lifecycle transitions ---------------------------------------------
	//
	// The browser executes the spot transaction; these record what happened.
	// Each is called immediately after its leg confirms, so an interrupted flow
	// leaves a row that says exactly which legs are live.

	.post(
		"/positions/:id/spot-filled",
		async ({ params, body }) => basis.markSpotFilled(params.id, body),
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				txHash: t.String(),
				shares: t.Number(),
				spotCostUsd: t.Number(),
			}),
		},
	)

	/**
	 * Open the short leg.
	 *
	 * The server places it. A browser-signed hedge leaves the position exposed
	 * for as long as the user takes to confirm — or forever, if they close the
	 * tab between legs.
	 */
	.post(
		"/positions/:id/open-perp",
		async ({ params, cookie, status }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);
			const position = await basis.openPerpLeg(params.id, user);
			if (!position) return status(404, { error: "Position not found" });
			return position;
		},
		{ params: t.Object({ id: t.String() }) },
	)

	/** Close the short leg, sized from the live position rather than the plan. */
	.post(
		"/positions/:id/close-perp",
		async ({ params, cookie, status }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);
			const position = await basis.closePerpLeg(params.id, user);
			if (!position) return status(404, { error: "Position not found" });
			return position;
		},
		{ params: t.Object({ id: t.String() }) },
	)

	/**
	 * Report a failed leg.
	 *
	 * Returns the repair options alongside the updated position, because a
	 * failure after one leg has landed is not an error to dismiss — it is a
	 * state the user has to act on.
	 */
	.post(
		"/positions/:id/leg-failed",
		async ({ params, body, status }) => {
			const position = await basis.markLegFailed(params.id, body);
			if (!position) return status(404, { error: "Position not found" });
			return { position, repairOptions: basis.repairOptions(position) };
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				leg: t.Union([t.Literal("SPOT"), t.Literal("PERP")]),
				error: t.String(),
			}),
		},
	)

	.post("/positions/:id/unwind", async ({ params }) => basis.startUnwind(params.id), {
		params: t.Object({ id: t.String() }),
	})

	.post(
		"/positions/:id/spot-closed",
		async ({ params, body }) => basis.markSpotClosed(params.id, body),
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({ txHash: t.String(), proceedsUsd: t.Number() }),
		},
	)

	.post("/positions/:id/closed", async ({ params, body }) => basis.markClosed(params.id, body), {
		params: t.Object({ id: t.String() }),
		body: t.Object({
			txHash: t.Optional(t.String()),
			trackingId: t.Optional(t.String()),
			realizedPnlUsd: t.Optional(t.Number()),
		}),
	});
