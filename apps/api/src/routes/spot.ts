import type { Address, Hex } from "@lemon/core";
import { toBaseUnits, USDC_ADDRESS, USDC_DECIMALS } from "@lemon/core";
import { Elysia, t } from "elysia";
import { clients } from "../config";
import { findSeedToken, getSpotToken, getSpotTokens } from "../services/spot";

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });

/**
 * Resolve a trade direction into the concrete token pair and input amount.
 *
 * Buys are sized in USDC (6 decimals), sells in shares of the stock token
 * (8 decimals — not 18). Mixing those up is the single easiest way to submit an
 * order 1e10 off, so the conversion happens once, here.
 */
async function resolveLegs(symbol: string, direction: "buy" | "sell", amount: string) {
	const token = findSeedToken(symbol);
	if (!token) return null;

	return direction === "buy"
		? {
				token,
				tokenIn: USDC_ADDRESS as Address,
				tokenOut: token.address,
				amountIn: toBaseUnits(amount, USDC_DECIMALS).toString(),
			}
		: {
				token,
				tokenIn: token.address,
				tokenOut: USDC_ADDRESS as Address,
				amountIn: toBaseUnits(amount, token.decimals).toString(),
			};
}

export const spotRoutes = new Elysia({ prefix: "/spot" })
	/**
	 * The tokenized stock catalog with live routability.
	 *
	 * `buyable` / `sellable` are measured against KyberSwap, not configured:
	 * only some of these tokens currently have Aerodrome pools, and the set
	 * changes as liquidity moves.
	 */
	.get(
		"/tokens",
		async ({ query }) => {
			const { tokens, routabilityKnown } = await getSpotTokens(query.refresh === "true");
			return { tokens, count: tokens.length, routabilityKnown };
		},
		{ query: t.Object({ refresh: t.Optional(t.String()) }) },
	)

	.get(
		"/tokens/:symbol",
		async ({ params, status }) => {
			const token = await getSpotToken(params.symbol);
			if (!token) return status(404, { error: `Unknown token: ${params.symbol}` });
			return token;
		},
		{ params: t.Object({ symbol: t.String() }) },
	)

	/**
	 * Quote a market buy or sell.
	 *
	 * A missing pool returns 200 with `ok: false, reason: "no_route"` rather
	 * than an error status — most of these tokens genuinely have no pool yet,
	 * and that is ordinary market state the UI should render as an empty state,
	 * not a failure toast.
	 */
	.get(
		"/quote",
		async ({ query, status }) => {
			const legs = await resolveLegs(query.symbol, query.direction, query.amount);
			if (!legs) return status(404, { error: `Unknown token: ${query.symbol}` });

			const result = await clients.kyber.getRoute({
				tokenIn: legs.tokenIn,
				tokenOut: legs.tokenOut,
				amountIn: legs.amountIn,
				slippagePercent: query.slippagePercent,
			});

			if (!result.ok) {
				return {
					ok: false as const,
					reason: result.reason,
					message: `No liquidity route for ${legs.token.symbol} right now.`,
					symbol: legs.token.symbol,
				};
			}

			return {
				ok: true as const,
				symbol: legs.token.symbol,
				direction: query.direction,
				quote: result.quote,
				tokenDecimals: legs.token.decimals,
			};
		},
		{
			query: t.Object({
				symbol: t.String(),
				direction: t.Union([t.Literal("buy"), t.Literal("sell")]),
				amount: t.String(),
				slippagePercent: t.Optional(t.Number({ minimum: 0, maximum: 20 })),
			}),
		},
	)

	/** Encode a quoted route into calldata. `routeSummary` must be passed back verbatim. */
	.post(
		"/build",
		async ({ body }) =>
			clients.kyber.buildRoute({
				routeSummary: body.routeSummary,
				sender: body.sender as Address,
				recipient: (body.recipient ?? body.sender) as Address,
				slippagePercent: body.slippagePercent,
				deadline: body.deadline,
				permit: body.permit as Hex | undefined,
			}),
		{
			body: t.Object({
				routeSummary: t.Unknown(),
				sender: addressSchema,
				recipient: t.Optional(addressSchema),
				slippagePercent: t.Optional(t.Number({ minimum: 0, maximum: 20 })),
				deadline: t.Optional(t.Number()),
				permit: t.Optional(t.String()),
			}),
		},
	)

	// --- Limit orders (KyberSwap off-chain book, on-chain settlement) --------

	.get("/limit/contract", async () => ({ address: await clients.kyberLimit.getContractAddress() }))

	.get(
		"/limit/orders",
		async ({ query }) => ({
			orders: await clients.kyberLimit.listOrders({
				maker: query.maker as Address,
				status: query.status,
			}),
		}),
		{
			query: t.Object({
				maker: addressSchema,
				status: t.Optional(
					t.Union([
						t.Literal("active"),
						t.Literal("open"),
						t.Literal("filled"),
						t.Literal("cancelled"),
						t.Literal("expired"),
					]),
				),
			}),
		},
	)

	/**
	 * Allowance the limit-order contract needs.
	 *
	 * Returns the total across all open orders plus the new one — approving
	 * only the new order's amount would leave existing orders unfillable.
	 */
	.get(
		"/limit/required-allowance",
		async ({ query, status }) => {
			const token = query.symbol === "USDC" ? null : findSeedToken(query.symbol);
			if (query.symbol !== "USDC" && !token) {
				return status(404, { error: `Unknown token: ${query.symbol}` });
			}
			const makerAsset = (token?.address ?? USDC_ADDRESS) as Address;
			const decimals = token?.decimals ?? USDC_DECIMALS;

			const active = await clients.kyberLimit.getActiveMakingAmount(
				query.maker as Address,
				makerAsset,
			);
			const additional = toBaseUnits(query.additionalAmount ?? "0", decimals);

			return {
				makerAsset,
				spender: await clients.kyberLimit.getContractAddress(),
				activeMakingAmount: active.toString(),
				requiredAllowance: (active + additional).toString(),
			};
		},
		{
			query: t.Object({
				maker: addressSchema,
				symbol: t.String(),
				additionalAmount: t.Optional(t.String()),
			}),
		},
	)

	/**
	 * Build the EIP-712 payload for a spot limit order.
	 *
	 * `makingAmount` / `takingAmount` are derived from the human price and
	 * amount here so the caller never has to reason about the 6-vs-8 decimal
	 * mismatch between USDC and the stock tokens.
	 */
	.post(
		"/limit/sign-message",
		async ({ body, status }) => {
			const token = findSeedToken(body.symbol);
			if (!token) return status(404, { error: `Unknown token: ${body.symbol}` });

			const shares = Number(body.shares);
			const limitPrice = Number(body.limitPrice);
			if (!(shares > 0) || !(limitPrice > 0)) {
				return status(422, { error: "shares and limitPrice must be positive." });
			}

			const usdcAmount = (shares * limitPrice).toFixed(USDC_DECIMALS);

			// Buy: sell USDC for the stock. Sell: sell the stock for USDC.
			const input =
				body.direction === "buy"
					? {
							makerAsset: USDC_ADDRESS as Address,
							takerAsset: token.address,
							maker: body.maker as Address,
							makingAmount: toBaseUnits(usdcAmount, USDC_DECIMALS).toString(),
							takingAmount: toBaseUnits(body.shares, token.decimals).toString(),
							expiredAt: body.expiredAt,
						}
					: {
							makerAsset: token.address,
							takerAsset: USDC_ADDRESS as Address,
							maker: body.maker as Address,
							makingAmount: toBaseUnits(body.shares, token.decimals).toString(),
							takingAmount: toBaseUnits(usdcAmount, USDC_DECIMALS).toString(),
							expiredAt: body.expiredAt,
						};

			return { input, signMessage: await clients.kyberLimit.buildSignMessage(input) };
		},
		{
			body: t.Object({
				maker: addressSchema,
				symbol: t.String(),
				direction: t.Union([t.Literal("buy"), t.Literal("sell")]),
				shares: t.String(),
				limitPrice: t.String(),
				expiredAt: t.Number(),
			}),
		},
	)

	.post(
		"/limit/orders",
		async ({ body }) =>
			clients.kyberLimit.submitOrder(body.input as never, body.salt, body.signature as Hex),
		{
			body: t.Object({
				input: t.Unknown(),
				salt: t.String(),
				signature: t.String(),
			}),
		},
	)

	.post(
		"/limit/cancel-sign",
		async ({ body }) => clients.kyberLimit.buildCancelMessage(body.maker as Address, body.orderIds),
		{ body: t.Object({ maker: addressSchema, orderIds: t.Array(t.Number()) }) },
	)

	/** Gasless cancel. Takes up to ~5 minutes if a fill is already in flight. */
	.post(
		"/limit/cancel",
		async ({ body }) =>
			clients.kyberLimit.submitCancel(body.maker as Address, body.orderIds, body.signature as Hex),
		{
			body: t.Object({
				maker: addressSchema,
				orderIds: t.Array(t.Number()),
				signature: t.String(),
			}),
		},
	)

	/** On-chain cancel: immediate, costs gas. */
	.post(
		"/limit/hard-cancel",
		async ({ body }) => clients.kyberLimit.buildHardCancelTx(body.maker as Address, body.orderIds),
		{ body: t.Object({ maker: addressSchema, orderIds: t.Array(t.Number()) }) },
	);
