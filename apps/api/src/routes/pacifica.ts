import { BASE_CHAIN_ID, USDC_ADDRESS } from "@lemon/core";
import type { User } from "@lemon/db";
import { isDatabaseConfigured, prisma } from "@lemon/db";
import { MissingRelayApiKeyError, SOLANA_CHAIN_ID, SOLANA_USDC_MINT } from "@lemon/relay";
import { Elysia, t } from "elysia";
import { clients } from "../config";
import { AuthError, readSession, SESSION_COOKIE } from "../services/auth";
import {
	creditDeposit,
	depositUnavailableReason,
	pendingBalance,
	withdraw,
} from "../services/pacifica-deposit";

/**
 * The user's Pacifica account: reading it, and funding it.
 *
 * Every route here is session-scoped: the account read is the one the session
 * owns, never one named in the request. That is deliberate — an account
 * parameter would make the authorisation check a matter of remembering to write
 * it, and forgetting once would let anyone touch anyone's account.
 *
 * Deliberately no discretionary order endpoints. Pacifica nets positions per
 * symbol, so a standalone long in a symbol the user already holds a basis
 * position in would cancel that position's short leg — silently converting a
 * delta-neutral position into an unhedged spot holding, with the database still
 * describing it as OPEN and hedged. The only path that places perp orders is
 * the basis lifecycle, which sizes every order against the position it belongs
 * to.
 */

/**
 * Resolve the session, or refuse.
 *
 * Takes the raw cookie value because Elysia types cookies as `unknown` until a
 * schema narrows them, and a session token is a string or it is nothing.
 */
async function requireUser(token: unknown): Promise<User> {
	const session = await readSession(typeof token === "string" ? token : undefined);
	if (!session) throw new AuthError("Sign in to view your account.");
	return session.user;
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
