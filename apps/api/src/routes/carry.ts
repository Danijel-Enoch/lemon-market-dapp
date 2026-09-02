import { isDatabaseConfigured } from "@lemon/db";
import { findCarryCandidates } from "@lemon/registry";
import { Elysia, t } from "elysia";
import * as carry from "../services/carry";
import { getMarkets } from "../services/markets";
import { getSpotTokens } from "../services/spot";

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });

/** Carry positions span two systems and must survive a reload, so they need a DB. */
const requireDb = (status: (code: number, body: unknown) => unknown) =>
	isDatabaseConfigured()
		? null
		: status(503, {
				error: "Cash-and-carry needs a database. Set DATABASE_URL and run `bun run db:deploy`.",
			});

export const carryRoutes = new Elysia({ prefix: "/carry" })
	/** Symbols where both legs can actually be executed right now. */
	.get("/candidates", async () => {
		const [markets, spot] = await Promise.all([getMarkets(), getSpotTokens()]);
		const tokens = spot.tokens;
		const buyable = new Set(tokens.filter((token) => token.buyable).map((t) => t.symbol));
		const candidates = findCarryCandidates(tokens, markets, (symbol) => buyable.has(symbol));

		return {
			candidates: candidates.map(({ token, market }) => ({
				symbol: token.symbol,
				name: token.name,
				marketSymbol: market.symbol,
				pairIndex: market.pairIndex,
				maxLeverage: market.maxLeverage,
				minPositionUsdc: market.minPositionUsdc,
				isOpen: market.isOpen,
			})),
			// Tokens paired with a perp but not currently buyable, so the UI can
			// explain the absence instead of silently omitting them.
			unavailable: tokens
				.filter((token) => !token.buyable && token.avantisPairIndex !== null)
				.map((token) => ({ symbol: token.symbol, reason: "No spot buy route" })),
		};
	})

	/** Price a carry without committing. Quotes both legs live. */
	.post(
		"/plan",
		async ({ body, status }) => {
			const plan = await carry.buildPlan(body);
			if (!plan) return status(404, { error: `No carry available for ${body.symbol}` });
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

	.get(
		"/",
		async ({ query, status }) => {
			const blocked = requireDb(status as never);
			if (blocked) return blocked;
			return { positions: await carry.listPositions(query.user) };
		},
		{ query: t.Object({ user: addressSchema }) },
	)

	.get(
		"/:id",
		async ({ params, status }) => {
			const blocked = requireDb(status as never);
			if (blocked) return blocked;

			const position = await carry.getPosition(params.id);
			if (!position) return status(404, { error: "Position not found" });
			return { position, repairOptions: carry.repairOptions(position) };
		},
		{ params: t.Object({ id: t.String() }) },
	)

	.post(
		"/",
		async ({ body, status }) => {
			const blocked = requireDb(status as never);
			if (blocked) return blocked;

			const position = await carry.createPosition(body);
			if (!position) return status(404, { error: `No carry available for ${body.symbol}` });
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
	// The browser executes the transactions; these record what happened. Each is
	// called immediately after its leg confirms, so an interrupted flow leaves a
	// row that says exactly which legs are live.

	.post("/:id/spot-filled", async ({ params, body }) => carry.markSpotFilled(params.id, body), {
		params: t.Object({ id: t.String() }),
		body: t.Object({
			txHash: t.String(),
			shares: t.Number(),
			spotCostUsd: t.Number(),
		}),
	})

	.post("/:id/perp-opened", async ({ params, body }) => carry.markPerpOpened(params.id, body), {
		params: t.Object({ id: t.String() }),
		body: t.Object({
			txHash: t.Optional(t.String()),
			trackingId: t.Optional(t.String()),
			tradeIndex: t.Number(),
			openTimestamp: t.Number(),
		}),
	})

	/**
	 * Report a failed leg.
	 *
	 * Returns the repair options alongside the updated position, because a
	 * failure after one leg has landed is not an error to dismiss — it is a
	 * state the user has to act on.
	 */
	.post(
		"/:id/leg-failed",
		async ({ params, body, status }) => {
			const position = await carry.markLegFailed(params.id, body);
			if (!position) return status(404, { error: "Position not found" });
			return { position, repairOptions: carry.repairOptions(position) };
		},
		{
			params: t.Object({ id: t.String() }),
			body: t.Object({
				leg: t.Union([t.Literal("SPOT"), t.Literal("PERP")]),
				error: t.String(),
			}),
		},
	)

	.post("/:id/unwind", async ({ params }) => carry.startUnwind(params.id), {
		params: t.Object({ id: t.String() }),
	})

	.post("/:id/spot-closed", async ({ params, body }) => carry.markSpotClosed(params.id, body), {
		params: t.Object({ id: t.String() }),
		body: t.Object({ txHash: t.String(), proceedsUsd: t.Number() }),
	})

	.post("/:id/closed", async ({ params, body }) => carry.markClosed(params.id, body), {
		params: t.Object({ id: t.String() }),
		body: t.Object({
			txHash: t.Optional(t.String()),
			trackingId: t.Optional(t.String()),
			realizedPnlUsd: t.Optional(t.Number()),
		}),
	})

	/** Positions left half-open. Surfaced so the UI can nag rather than hide them. */
	.get(
		"/attention/:user",
		async ({ params, status }) => {
			const blocked = requireDb(status as never);
			if (blocked) return blocked;

			const positions = await carry.listOrphaned(params.user);
			return {
				positions: positions.map((position) => ({
					position,
					repairOptions: carry.repairOptions(position),
				})),
			};
		},
		{ params: t.Object({ user: addressSchema }) },
	);
