import { BASE_CHAIN_ID, USDC_ADDRESS } from "@lemon/core";
import type { User } from "@lemon/db";
import { isDatabaseConfigured, prisma } from "@lemon/db";
import type { Side } from "@lemon/pacifica";
import { MissingRelayApiKeyError, SOLANA_CHAIN_ID, SOLANA_USDC_MINT } from "@lemon/relay";
import { Elysia, t } from "elysia";
import { clients, config } from "../config";
import { AuthError, readSession, SESSION_COOKIE } from "../services/auth";
import { builderCodeFor } from "../services/builder";
import { getMarkets, resolvePacificaSymbol } from "../services/markets";
import { tradingIdentity } from "../services/pacifica-account";
import {
	creditDeposit,
	depositUnavailableReason,
	pendingBalance,
	withdraw,
} from "../services/pacifica-deposit";
import { recordPerpVolume } from "../services/points";

/**
 * Trading, on the user's Pacifica account.
 *
 * Every route here is session-scoped: the account traded is the one the session
 * owns, never one named in the request. That is deliberate — an account
 * parameter would make the authorisation check a matter of remembering to write
 * it, and forgetting once would let anyone trade anyone's account.
 */

const symbolSchema = t.String({ minLength: 1, maxLength: 32 });
const amountSchema = t.String({ pattern: "^[0-9]+(\\.[0-9]+)?$" });
const sideSchema = t.Union([t.Literal("bid"), t.Literal("ask")]);

/**
 * Resolve the session, or refuse.
 *
 * Takes the raw cookie value because Elysia types cookies as `unknown` until a
 * schema narrows them, and a session token is a string or it is nothing.
 */
async function requireUser(token: unknown): Promise<User> {
	const session = await readSession(typeof token === "string" ? token : undefined);
	if (!session) throw new AuthError("Sign in to trade.");
	return session.user;
}

/**
 * Display symbol to the identifier Pacifica accepts.
 *
 * The rest of the app speaks "BTC/USD"; Pacifica speaks "BTC". Resolving
 * against the live catalog rather than string-slicing means a market whose
 * naming does not follow the pattern still works.
 */
async function pacificaSymbol(symbol: string): Promise<string> {
	const resolved = await resolvePacificaSymbol(symbol);
	if (!resolved) throw new AuthError(`Unknown market: ${symbol}`, 404);
	return resolved;
}

/**
 * Award points for a filled order, priced at the live mark.
 *
 * Failures here are swallowed: the order has already been placed, and losing
 * points is a far smaller problem than reporting a successful trade as an
 * error because the points write failed.
 */
async function creditVolume(
	userAddress: string,
	symbol: string,
	amount: string,
	orderId: number,
): Promise<void> {
	try {
		const markets = await getMarkets();
		const market = markets.find((candidate) => candidate.pacifica.pacificaSymbol === symbol);
		const price = market?.pacifica.markPrice ?? 0;
		const volumeUsd = Number(amount) * price;
		if (volumeUsd > 0) await recordPerpVolume({ userAddress, volumeUsd, orderId });
	} catch {
		// Deliberately silent, per the note above.
	}
}

export const pacificaRoutes = new Elysia({ prefix: "/pacifica" })
	/**
	 * Everything the accounts page needs about the Pacifica side, in one call.
	 *
	 * Bundled because the three reads are useless apart — equity without
	 * positions cannot be explained — and because each is a separate upstream
	 * round trip the browser would otherwise make in series.
	 */
	.get("/account", async ({ cookie }) => {
		const user = await requireUser(cookie[SESSION_COOKIE]?.value);

		if (!user.pacificaBoundAt) {
			// An account that exists but has never been activated has nothing to
			// report, and asking Pacifica about it just returns an error.
			return { activated: false, account: null, positions: [], orders: [], pendingUsdc: 0 };
		}

		const [account, positions, orders, pendingUsdc] = await Promise.all([
			clients.pacifica.accountInfo(user.solanaAddress).catch(() => null),
			clients.pacifica.positions(user.solanaAddress).catch(() => []),
			clients.pacifica.openOrders(user.solanaAddress).catch(() => []),
			pendingBalance(user).catch(() => 0),
		]);

		return { activated: true, account, positions, orders, pendingUsdc };
	})

	.post(
		"/orders/market",
		async ({ body, cookie }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);
			const identity = tradingIdentity(user);

			const symbol = await pacificaSymbol(body.symbol);
			const receipt = await clients.pacifica.createMarketOrder(identity.sign, {
				account: identity.account,
				agentWallet: identity.agentWallet,
				symbol,
				side: body.side as Side,
				amount: body.amount,
				slippagePercent: body.slippagePercent ?? "0.5",
				reduceOnly: body.reduceOnly ?? false,
				builderCode: builderCodeFor(user, config.fees.pacificaBuilder),
			});

			// Points are awarded from the order this process just placed, not
			// from anything the client reports afterwards.
			await creditVolume(user.address, symbol, body.amount, receipt.order_id);
			return receipt;
		},
		{
			body: t.Object({
				symbol: symbolSchema,
				side: sideSchema,
				amount: amountSchema,
				slippagePercent: t.Optional(amountSchema),
				reduceOnly: t.Optional(t.Boolean()),
			}),
		},
	)

	.post(
		"/orders/limit",
		async ({ body, cookie }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);
			const identity = tradingIdentity(user);

			return clients.pacifica.createLimitOrder(identity.sign, {
				account: identity.account,
				agentWallet: identity.agentWallet,
				symbol: await pacificaSymbol(body.symbol),
				side: body.side as Side,
				amount: body.amount,
				price: body.price,
				tif: body.tif ?? "GTC",
				reduceOnly: body.reduceOnly ?? false,
				builderCode: builderCodeFor(user, config.fees.pacificaBuilder),
			});
		},
		{
			body: t.Object({
				symbol: symbolSchema,
				side: sideSchema,
				amount: amountSchema,
				price: amountSchema,
				tif: t.Optional(t.Union([t.Literal("GTC"), t.Literal("IOC"), t.Literal("ALO")])),
				reduceOnly: t.Optional(t.Boolean()),
			}),
		},
	)

	.post(
		"/orders/cancel",
		async ({ body, cookie }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);
			const identity = tradingIdentity(user);

			return clients.pacifica.cancelOrder(identity.sign, {
				account: identity.account,
				agentWallet: identity.agentWallet,
				symbol: await pacificaSymbol(body.symbol),
				orderId: body.orderId,
			});
		},
		{ body: t.Object({ symbol: symbolSchema, orderId: t.Number() }) },
	)

	/**
	 * Close a position at market.
	 *
	 * The size comes from the position itself rather than from the request: a
	 * client-supplied amount that disagreed with the live position would either
	 * leave a remainder or flip the user to the other side, and both are worse
	 * than a round trip.
	 */
	.post(
		"/positions/close",
		async ({ body, cookie, status }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);
			const identity = tradingIdentity(user);
			const symbol = await pacificaSymbol(body.symbol);

			const positions = await clients.pacifica.positions(identity.account);
			const position = positions.find((candidate) => candidate.symbol === symbol);
			if (!position) return status(404, { error: `No open position in ${body.symbol}.` });

			return clients.pacifica.createMarketOrder(identity.sign, {
				account: identity.account,
				agentWallet: identity.agentWallet,
				symbol,
				// Reduce-only on the opposite side: a long is closed by selling.
				side: position.side === "bid" ? "ask" : "bid",
				amount: position.amount,
				slippagePercent: body.slippagePercent ?? "1",
				reduceOnly: true,
				builderCode: builderCodeFor(user, config.fees.pacificaBuilder),
			});
		},
		{ body: t.Object({ symbol: symbolSchema, slippagePercent: t.Optional(amountSchema) }) },
	)

	.post(
		"/leverage",
		async ({ body, cookie }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);
			const identity = tradingIdentity(user);

			return clients.pacifica.updateLeverage(identity.sign, {
				account: identity.account,
				agentWallet: identity.agentWallet,
				symbol: await pacificaSymbol(body.symbol),
				leverage: body.leverage,
			});
		},
		{ body: t.Object({ symbol: symbolSchema, leverage: t.Number({ minimum: 1, maximum: 100 }) }) },
	)

	/* ------------------------------------------------------------- bridging */

	/**
	 * A deposit address that bridges USDC into the user's Pacifica wallet.
	 *
	 * The recipient is the derived Solana address, which the browser never sees
	 * — it is resolved here from the session. That is the whole point of routing
	 * funding through the server: the user sends from the wallet they already
	 * have, to an address the app manages, without ever being shown a wallet
	 * they might mistake for one they control.
	 *
	 * Funds arriving here are still not a Pacifica balance. Crediting them is a
	 * second, separate step — see POST /pacifica/deposit.
	 */
	.post(
		"/fund/address",
		async ({ body, cookie, status }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);

			try {
				const quote = await clients.relay.createDepositAddress({
					recipient: user.solanaAddress,
					sender: user.address,
					originChainId: body.originChainId ?? BASE_CHAIN_ID,
					originCurrency: body.originCurrency ?? USDC_ADDRESS,
					amount: body.amount,
					destinationChainId: SOLANA_CHAIN_ID,
					destinationCurrency: SOLANA_USDC_MINT,
					// Refunds go back to the connected wallet on the origin chain,
					// never to the derived wallet — a refund the user cannot see
					// is indistinguishable from a loss.
					refundTo: user.address,
				});

				if (isDatabaseConfigured()) {
					await prisma.pacificaDeposit.create({
						data: {
							userId: user.id,
							amountUsdc: Number(quote.destinationAmountFormatted || 0),
							relayRequestId: quote.requestId,
							status: "BRIDGING",
						},
					});
				}

				return quote;
			} catch (error) {
				if (error instanceof MissingRelayApiKeyError) {
					return status(503, { error: error.message });
				}
				throw error;
			}
		},
		{
			body: t.Object({
				/** Base units of the origin currency, as Relay expects. */
				amount: t.String({ pattern: "^[0-9]+$" }),
				originChainId: t.Optional(t.Number()),
				originCurrency: t.Optional(t.String()),
			}),
		},
	)

	/** Progress of a bridge leg, so the UI can say where the money is. */
	.get(
		"/fund/status/:requestId",
		async ({ params, cookie }) => {
			await requireUser(cookie[SESSION_COOKIE]?.value);
			return clients.relay.getStatus(params.requestId);
		},
		{ params: t.Object({ requestId: t.String() }) },
	)

	/* ------------------------------------------------------------- funding */

	.get("/deposit/status", async ({ cookie }) => {
		const user = await requireUser(cookie[SESSION_COOKIE]?.value);
		const reason = depositUnavailableReason();

		return {
			available: reason === null,
			reason,
			pendingUsdc: reason === null ? await pendingBalance(user).catch(() => 0) : 0,
		};
	})

	/**
	 * Credit USDC that has already reached the derived wallet.
	 *
	 * Separate from bridging on purpose: the user's wallet performs the bridge,
	 * and this server performs the credit. Coupling them would mean holding a
	 * request open for the several minutes a bridge can take.
	 */
	.post(
		"/deposit",
		async ({ body, cookie }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);
			return creditDeposit({ user, amount: body.amount });
		},
		{ body: t.Object({ amount: t.Number({ exclusiveMinimum: 0 }) }) },
	)

	.post(
		"/withdraw",
		async ({ body, cookie }) => {
			const user = await requireUser(cookie[SESSION_COOKIE]?.value);
			await withdraw({ user, amount: body.amount });
			return { ok: true };
		},
		{ body: t.Object({ amount: t.Number({ exclusiveMinimum: 0 }) }) },
	);
