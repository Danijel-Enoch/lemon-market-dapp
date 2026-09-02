import { validateOrder } from "@lemon/avantis";
import type { Address } from "@lemon/core";
import { appendAttributionSuffix } from "@lemon/core";
import { Elysia, t } from "elysia";
import { clients } from "../config";
import { builderSuffix, canAttribute } from "../services/attribution";
import { getMarket, getSymbolResolver } from "../services/markets";

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });

const openBody = t.Object({
	trader: addressSchema,
	symbol: t.String(),
	side: t.Union([t.Literal("long"), t.Literal("short")]),
	collateralUsdc: t.Number({ minimum: 0 }),
	leverage: t.Number({ minimum: 1 }),
	orderType: t.Optional(
		t.Union([t.Literal("market"), t.Literal("limit"), t.Literal("stop_limit")]),
	),
	/** Required for limit and stop-limit orders; ignored for market. */
	openPrice: t.Optional(t.Number()),
	takeProfit: t.Optional(t.Number()),
	stopLoss: t.Optional(t.Number()),
	slippagePercent: t.Optional(t.Number({ minimum: 0, maximum: 50 })),
	/** Gasless EIP-712 intent by default; direct transaction when false. */
	gasless: t.Optional(t.Boolean()),
});

export const perpRoutes = new Elysia({ prefix: "/perp" })
	.get(
		"/positions",
		async ({ query }) => {
			const resolveSymbol = await getSymbolResolver();
			return clients.avantis.getPositions(query.trader as Address, resolveSymbol);
		},
		{ query: t.Object({ trader: addressSchema }) },
	)

	.get(
		"/allowance",
		async ({ query }) =>
			clients.avantis.getAllowance(query.trader as Address, query.spender as Address | undefined),
		{ query: t.Object({ trader: addressSchema, spender: t.Optional(addressSchema) }) },
	)

	/** One-time USDC approval to TradingStorage; required before the first trade. */
	.post(
		"/approve",
		async ({ body }) =>
			clients.avantis.buildApprove({
				trader: body.trader as Address,
				amountUsdc: body.amountUsdc,
			}),
		{ body: t.Object({ trader: addressSchema, amountUsdc: t.Optional(t.Number()) }) },
	)

	/**
	 * Build an open order.
	 *
	 * Validation runs here, before the wallet prompt, so a user sees "minimum
	 * position is $100" rather than an opaque revert after signing. The pair
	 * index is resolved from the symbol on every call — never cached — because
	 * Avantis indexes shift between protocol versions.
	 */
	.post(
		"/open",
		async ({ body, status }) => {
			const market = await getMarket(body.symbol);
			if (!market) return status(404, { error: `Unknown market: ${body.symbol}` });

			const check = validateOrder(market, {
				collateralUsdc: body.collateralUsdc,
				leverage: body.leverage,
			});
			if (!check.ok) return status(422, { error: check.errors.join(" "), errors: check.errors });

			const orderType = body.orderType ?? "market";
			if (orderType !== "market" && !body.openPrice) {
				return status(422, { error: `${orderType} orders require an openPrice.` });
			}

			const params = {
				trader: body.trader as Address,
				pairIndex: market.pairIndex,
				side: body.side,
				collateralUsdc: body.collateralUsdc,
				leverage: body.leverage,
				orderType,
				openPrice: body.openPrice,
				takeProfit: body.takeProfit,
				stopLoss: body.stopLoss,
				slippagePercent: body.slippagePercent ?? 1,
			};

			if (body.gasless === false) {
				const tx = await clients.avantis.buildOpenTrade(params);
				return {
					mode: "transaction" as const,
					// Builder attribution is a calldata suffix, so it can only be
					// attached to transactions we hand to the wallet ourselves.
					tx: { ...tx, data: appendAttributionSuffix(tx.data, builderSuffix()) },
					attributed: canAttribute("transaction"),
				};
			}
			return {
				mode: "intent" as const,
				intent: await clients.avantis.buildOpenIntent(params),
				// The operator builds its own calldata on this path, so a suffix
				// added here would never reach the chain.
				attributed: false,
			};
		},
		{ body: openBody },
	)

	.post(
		"/close",
		async ({ body }) => {
			const params = {
				trader: body.trader as Address,
				pairIndex: body.pairIndex,
				index: body.index,
				collateralToCloseUsdc: body.collateralToCloseUsdc,
			};
			if (body.gasless === false) {
				const tx = await clients.avantis.buildCloseTrade(params);
				return {
					mode: "transaction" as const,
					tx: { ...tx, data: appendAttributionSuffix(tx.data, builderSuffix()) },
					attributed: canAttribute("transaction"),
				};
			}
			return {
				mode: "intent" as const,
				intent: await clients.avantis.buildCloseIntent(params),
				attributed: false,
			};
		},
		{
			body: t.Object({
				trader: addressSchema,
				pairIndex: t.Number(),
				index: t.Number(),
				collateralToCloseUsdc: t.Number({ minimum: 0 }),
				gasless: t.Optional(t.Boolean()),
			}),
		},
	)

	/** Edit a resting limit / stop-limit order. */
	.post(
		"/limit/update",
		async ({ body }) =>
			clients.avantis.buildUpdateLimitOrder({
				trader: body.trader as Address,
				pairIndex: body.pairIndex,
				index: body.index,
				openPrice: body.openPrice,
				takeProfit: body.takeProfit,
				stopLoss: body.stopLoss,
				slippagePercent: body.slippagePercent,
			}),
		{
			body: t.Object({
				trader: addressSchema,
				pairIndex: t.Number(),
				index: t.Number(),
				openPrice: t.Optional(t.Number()),
				takeProfit: t.Optional(t.Number()),
				stopLoss: t.Optional(t.Number()),
				slippagePercent: t.Optional(t.Number()),
			}),
		},
	)

	/** Cancel a resting limit order; escrowed collateral is refunded on-chain. */
	.post(
		"/limit/cancel",
		async ({ body }) =>
			clients.avantis.buildCancelLimitOrder({
				trader: body.trader as Address,
				pairIndex: body.pairIndex,
				index: body.index,
			}),
		{ body: t.Object({ trader: addressSchema, pairIndex: t.Number(), index: t.Number() }) },
	)

	.post(
		"/tpsl",
		async ({ body }) =>
			clients.avantis.buildTpSlIntent({
				trader: body.trader as Address,
				pairIndex: body.pairIndex,
				index: body.index,
				takeProfit: body.takeProfit,
				stopLoss: body.stopLoss,
			}),
		{
			body: t.Object({
				trader: addressSchema,
				pairIndex: t.Number(),
				index: t.Number(),
				takeProfit: t.Optional(t.Number()),
				stopLoss: t.Optional(t.Number()),
			}),
		},
	)

	/**
	 * Relay a signed intent to the Avantis operator.
	 *
	 * Proxied rather than called from the browser so the SSE lifecycle stream is
	 * consumed server-side and collapsed into a single outcome — the client only
	 * needs to know whether the order filled.
	 */
	.post(
		"/submit",
		async ({ body }) =>
			clients.avantis.submitIntent({
				orderType: body.orderType,
				encodedIntent: body.encodedIntent,
				signature: body.signature,
			}),
		{
			body: t.Object({
				orderType: t.Number(),
				encodedIntent: t.String(),
				signature: t.String(),
			}),
		},
	);
