import { isSupportedChainId } from "@lemon/core";
import { Elysia, t } from "elysia";
import { readSession, SESSION_COOKIE } from "../services/auth";
import { listBasisMarkets } from "../services/basis-markets";
import {
	bridgeProgress,
	listBridges,
	quoteBridgeBetweenChains,
	quoteBridgeToMargin,
	recordBridge,
} from "../services/self-bridge";
import {
	confirmClose,
	confirmOpen,
	hedgeSpotOnly,
	prepareClose,
	prepareOpen,
	rebalance,
} from "../services/self-execution";
import { depositIdleMargin, withdrawMargin } from "../services/self-perp";
import { getSelfPosition, listPositionEvents, listSelfPositions } from "../services/self-positions";
import {
	ensureUserWallet,
	getUserBalances,
	getUserWallet,
	solanaOnboardingCosts,
	walletsUnavailableReason,
} from "../services/user-wallet";

/**
 * The self-managed half of the product.
 *
 * A user who does not want to hand capital to a vault agent runs the same basis
 * trade themselves: they buy the spot leg from their own wallet and short the
 * matching perp from a Solana account derived for them. These routes serve the
 * board they choose from, the wallet they trade through, and the positions they
 * end up holding.
 *
 * Kept in its own file rather than folded into `vaults.ts`, and that separation
 * is load-bearing rather than tidiness. The two products share a market list and
 * nothing else — no shares, no queue, no agent, no NAV — and a user may run both
 * at once. Every route here is scoped to one signed-in user; nothing here can
 * read or affect a vault.
 *
 * ## Why these need a session and the vault routes do not
 *
 * Depositing into a vault is an ordinary wallet transaction that needs no
 * account, which is why sign-in is optional everywhere else in this app. It
 * cannot be optional here. A derived wallet is keyed to a user, and opening a
 * position authorises the MPC network to sign for that path — so authorisation
 * has to happen before `NearMpcClient` is reached, as that class's own
 * documentation insists.
 *
 * ## Two-call actions
 *
 * Anything touching the spot leg is a pair: a `prepare` that hands back unsigned
 * transactions, and a `confirm` that takes the hash the wallet produced. The
 * server cannot sign the user's wallet and the user cannot sign Pacifica, so
 * every open and close crosses that boundary exactly once. The `actionId` tying
 * the two calls together is what survives a closed tab.
 */

function sessionToken(cookie: Record<string, { value?: unknown } | undefined>): string | undefined {
	const value = cookie[SESSION_COOKIE]?.value;
	return typeof value === "string" ? value : undefined;
}

/**
 * Raised where a route needs a signed-in user and has none.
 *
 * Exported so `app.ts` can map it to a 401. Every error in this API is
 * translated to a status in one place, which is what keeps a route from
 * accidentally answering 500 to something it has a perfectly good answer for —
 * as this one did until it was moved there.
 */
export class NotSignedInError extends Error {
	constructor() {
		super("Sign in with your wallet to see your own positions.");
		this.name = "NotSignedInError";
	}
}

function chainOf(raw: string | undefined): number | undefined {
	if (raw === undefined || raw === "") return undefined;
	const id = Number(raw);
	if (!isSupportedChainId(id)) return undefined;
	return id;
}

export const selfRoutes = new Elysia({ prefix: "/self" })
	.derive(async ({ cookie }) => {
		const session = await readSession(sessionToken(cookie));
		return { account: session?.user ?? null };
	})

	/**
	 * Whether this deployment can run self-managed positions at all.
	 *
	 * Public and unauthenticated on purpose. The app has to decide whether to
	 * show the entry points *before* anyone signs in, and a feature that is
	 * simply absent is far less confusing than one that appears and then fails
	 * at the last step.
	 */
	.get("/status", () => {
		const reason = walletsUnavailableReason();
		return { available: reason === null, reason };
	})

	/**
	 * The board: every pair where both legs exist, ranked by net yield.
	 *
	 * The same data the admin console ranks vaultable markets from, served
	 * publicly because choosing a market is the step *before* signing in. A user
	 * should be able to see what the platform pays without connecting anything.
	 *
	 * Markets that cannot be entered stay on the list with their reason attached
	 * rather than disappearing. Someone looking for a symbol that has dropped off
	 * the board cannot tell an absent market from an untradable one, and the
	 * reason is exactly what they came to find out.
	 */
	.get(
		"/markets",
		async ({ query }) => {
			const board = await listBasisMarkets(chainOf(query.chainId), query.refresh === "true");
			return board;
		},
		{
			query: t.Object({
				chainId: t.Optional(t.String()),
				refresh: t.Optional(t.String()),
			}),
		},
	)

	/**
	 * The caller's derived wallet, created on first ask.
	 *
	 * A POST because it may create a row, and it is idempotent — derivation is a
	 * pure function of the connected address, so the second call returns exactly
	 * what the first did. Deriving lazily rather than at sign-in keeps a wallet
	 * row from being written for every address that ever looked at the board.
	 */
	.post("/wallet", async ({ account }) => {
		if (!account) throw new NotSignedInError();
		const wallet = await ensureUserWallet({ userId: account.id, address: account.address });
		return { wallet };
	})

	/**
	 * The caller's wallet if they have one, without creating it.
	 *
	 * Null rather than a 404 for a user who has never opened a position: not
	 * having a derived wallet yet is the ordinary state of a new account, and an
	 * error status for the ordinary state makes every client special-case it.
	 */
	.get("/wallet", async ({ account }) => {
		if (!account) throw new NotSignedInError();
		return { wallet: await getUserWallet(account.id) };
	})

	/**
	 * What the caller has to trade with, across all three places money can sit.
	 *
	 * Bundled into one response rather than split per venue because they are read
	 * together every single time — the question is always "can I open a position
	 * right now", and that needs the Solana balance, the Pacifica margin and the
	 * venue minimums in the same breath. Three requests would also mean three
	 * chances to render a half-answered page.
	 */
	.get("/balances", async ({ account }) => {
		if (!account) throw new NotSignedInError();

		const wallet = await ensureUserWallet({ userId: account.id, address: account.address });
		const [balances, costs] = await Promise.all([getUserBalances(wallet), solanaOnboardingCosts()]);

		return { wallet, balances, costs };
	})

	/**
	 * The caller's positions, with both legs re-read from their venues.
	 *
	 * Closed positions are excluded by default. They are history rather than
	 * something to act on, and mixing them into the working list is how a page
	 * that should answer "what am I holding" turns into a statement.
	 */
	.get(
		"/positions",
		async ({ account, query }) => {
			if (!account) throw new NotSignedInError();

			const wallet = await getUserWallet(account.id);
			// No wallet means no position can ever have been opened, so the empty
			// list is the honest answer rather than an error about onboarding.
			if (!wallet) return { positions: [], wallet: null };

			const positions = await listSelfPositions({
				userId: account.id,
				wallet,
				ownerAddress: account.address,
				includeClosed: query.includeClosed === "true",
			});

			return { positions, wallet };
		},
		{ query: t.Object({ includeClosed: t.Optional(t.String()) }) },
	)

	.get(
		"/positions/:id",
		async ({ account, params, status }) => {
			if (!account) throw new NotSignedInError();

			const wallet = await getUserWallet(account.id);
			if (!wallet) return status(404, { error: "No such position." });

			const position = await getSelfPosition({
				userId: account.id,
				wallet,
				ownerAddress: account.address,
				id: params.id,
			});

			// A 404 for someone else's position as well as for one that does not
			// exist. Which of the two it was is not something a stranger needs
			// confirmed.
			if (!position) return status(404, { error: "No such position." });
			return position;
		},
		{ params: t.Object({ id: t.String() }) },
	)

	/** The append-only history of one position: every leg that moved, and where. */
	.get(
		"/positions/:id/events",
		async ({ account, params, status }) => {
			if (!account) throw new NotSignedInError();

			const events = await listPositionEvents({
				userId: account.id,
				positionId: params.id,
			});
			if (!events) return status(404, { error: "No such position." });

			return { events };
		},
		{ params: t.Object({ id: t.String() }) },
	)

	// -----------------------------------------------------------------------
	// Opening
	// -----------------------------------------------------------------------

	/**
	 * Stage an open and hand back the spot transactions to sign.
	 *
	 * Creates a draft position and nothing else. A user who never signs leaves a
	 * draft and no exposure, which is the correct outcome of abandoning a form.
	 */
	.post(
		"/positions/open",
		async ({ account, body }) => {
			if (!account) throw new NotSignedInError();
			const wallet = await ensureUserWallet({ userId: account.id, address: account.address });

			return await prepareOpen({
				userId: account.id,
				wallet,
				owner: account.address,
				ticker: body.ticker,
				chainId: body.chainId,
				notionalUsd: body.notionalUsd,
				leverage: body.leverage,
			});
		},
		{
			body: t.Object({
				ticker: t.String({ minLength: 1, maxLength: 16 }),
				chainId: t.Number(),
				notionalUsd: t.Number({ minimum: 1 }),
				leverage: t.Number({ minimum: 1, maximum: 50 }),
			}),
		},
	)

	/**
	 * Report the signed spot buy, and get it hedged.
	 *
	 * The hash is the only thing taken on trust, and only as far as "look this
	 * up" — the size hedged is read from the receipt's transfer logs, never from
	 * the request. A caller naming someone else's transaction gets a hedge sized
	 * from transfers to their own address, which is zero.
	 */
	.post(
		"/positions/open/confirm",
		async ({ account, body }) => {
			if (!account) throw new NotSignedInError();
			const wallet = await ensureUserWallet({ userId: account.id, address: account.address });

			return await confirmOpen({
				userId: account.id,
				wallet,
				owner: account.address,
				actionId: body.actionId,
				txHash: body.txHash,
			});
		},
		{
			body: t.Object({
				actionId: t.String(),
				txHash: t.String({ pattern: "^0x[a-fA-F0-9]{64}$" }),
			}),
		},
	)

	/**
	 * Place the hedge on a position holding spot alone.
	 *
	 * The recovery path, for a hedge that failed or a tab closed between the two
	 * legs. Needs no signature: the spot is already bought and the short is ours
	 * to place.
	 */
	.post(
		"/positions/:id/hedge",
		async ({ account, params }) => {
			if (!account) throw new NotSignedInError();
			const wallet = await ensureUserWallet({ userId: account.id, address: account.address });

			return await hedgeSpotOnly({
				userId: account.id,
				wallet,
				owner: account.address,
				positionId: params.id,
			});
		},
		{ params: t.Object({ id: t.String() }) },
	)

	// -----------------------------------------------------------------------
	// Maintaining
	// -----------------------------------------------------------------------

	/**
	 * Bring the legs back level.
	 *
	 * A plain POST with no prepare step, because rebalancing resizes the perp and
	 * the perp is the leg this server can move alone. No wallet prompt, which is
	 * what makes it something a user will actually do.
	 */
	.post(
		"/positions/:id/rebalance",
		async ({ account, params }) => {
			if (!account) throw new NotSignedInError();
			const wallet = await ensureUserWallet({ userId: account.id, address: account.address });

			return await rebalance({
				userId: account.id,
				wallet,
				owner: account.address,
				positionId: params.id,
			});
		},
		{ params: t.Object({ id: t.String() }) },
	)

	// -----------------------------------------------------------------------
	// Closing
	// -----------------------------------------------------------------------

	/** Stage a close and hand back the sale to sign. */
	.post(
		"/positions/:id/close",
		async ({ account, params }) => {
			if (!account) throw new NotSignedInError();
			const wallet = await ensureUserWallet({ userId: account.id, address: account.address });

			return await prepareClose({
				userId: account.id,
				wallet,
				owner: account.address,
				positionId: params.id,
			});
		},
		{ params: t.Object({ id: t.String() }) },
	)

	/**
	 * Report the signed sale, buy back the short, and settle.
	 *
	 * `txHash` is optional because a position whose spot was already gone has
	 * nothing to sell — only the short has to be closed, and there is no
	 * signature to report.
	 */
	.post(
		"/positions/close/confirm",
		async ({ account, body }) => {
			if (!account) throw new NotSignedInError();
			const wallet = await ensureUserWallet({ userId: account.id, address: account.address });

			return await confirmClose({
				userId: account.id,
				wallet,
				owner: account.address,
				actionId: body.actionId,
				txHash: body.txHash,
			});
		},
		{
			body: t.Object({
				actionId: t.String(),
				txHash: t.Optional(t.String({ pattern: "^0x[a-fA-F0-9]{64}$" })),
			}),
		},
	)

	// -----------------------------------------------------------------------
	// Moving money
	// -----------------------------------------------------------------------

	/**
	 * Quote a bridge, and hand back the transactions for the user to send.
	 *
	 * `to: "margin"` sends USDC to the derived Solana address, which is the
	 * Pacifica account. Any other destination is an EVM chain and both ends stay
	 * in the user's own wallet — that route exists because the spot leg is
	 * chain-specific and USDC on Base cannot buy an X Layer market.
	 *
	 * The recipient is never taken from the request. For a margin bridge it comes
	 * from the session's wallet record, so a caller cannot direct someone else's
	 * funds — or their own — to an address that is not their Pacifica account.
	 */
	.post(
		"/bridge/quote",
		async ({ account, body }) => {
			if (!account) throw new NotSignedInError();

			if (body.to === "margin") {
				const wallet = await ensureUserWallet({
					userId: account.id,
					address: account.address,
				});
				return await quoteBridgeToMargin({
					wallet,
					owner: account.address,
					originChainId: body.originChainId,
					amount: body.amount,
				});
			}

			if (body.destinationChainId === undefined) {
				return { error: "A chain-to-chain bridge needs a destination chain." };
			}

			return await quoteBridgeBetweenChains({
				owner: account.address,
				originChainId: body.originChainId,
				destinationChainId: body.destinationChainId,
				amount: body.amount,
			});
		},
		{
			body: t.Object({
				to: t.Union([t.Literal("margin"), t.Literal("chain")]),
				originChainId: t.Number(),
				destinationChainId: t.Optional(t.Number()),
				/** Base units of USDC. A string, because six decimals of dollars overflow nothing but a float's precision. */
				amount: t.String({ pattern: "^[0-9]+$" }),
			}),
		},
	)

	/** Record a bridge the wallet has now sent, so it can be followed. */
	.post(
		"/bridge/sent",
		async ({ account, body }) => {
			if (!account) throw new NotSignedInError();

			const row = await recordBridge({
				userId: account.id,
				requestId: body.requestId,
				direction: body.to === "margin" ? "TO_SOLANA" : "BETWEEN_EVM",
				originChainId: body.originChainId,
				recipient: body.recipient,
				amount: body.amount,
				txRef: body.txRef,
			});

			return { id: row.id, requestId: row.requestId, status: row.status };
		},
		{
			body: t.Object({
				requestId: t.String(),
				to: t.Union([t.Literal("margin"), t.Literal("chain")]),
				originChainId: t.Number(),
				recipient: t.String(),
				amount: t.String({ pattern: "^[0-9]+$" }),
				txRef: t.String(),
			}),
		},
	)

	/** How far one bridge has got, read from Relay rather than from our own row. */
	.get(
		"/bridge/:requestId",
		async ({ account, params }) => {
			if (!account) throw new NotSignedInError();
			return await bridgeProgress(params.requestId);
		},
		{ params: t.Object({ requestId: t.String() }) },
	)

	/** Every bridge this user has sent, newest first. */
	.get("/bridges", async ({ account }) => {
		if (!account) throw new NotSignedInError();
		return { bridges: await listBridges(account.id) };
	})

	/**
	 * Credit USDC that has landed in the margin wallet to Pacifica.
	 *
	 * Separate from the bridge because it is a separate signature by a separate
	 * party at a separate time: the bridge is the user's wallet on an EVM chain,
	 * and this is the MPC network on Solana, once the funds have arrived.
	 */
	.post("/margin/deposit", async ({ account }) => {
		if (!account) throw new NotSignedInError();
		const wallet = await ensureUserWallet({ userId: account.id, address: account.address });
		return await depositIdleMargin({ wallet });
	})

	/**
	 * Ask Pacifica to release margin back to the derived Solana wallet.
	 *
	 * The first half of getting money out. It lands in the margin wallet rather
	 * than in the user's own — bridging it home is the second half, and keeping
	 * them separate means a failure in the slow part does not lose the fast part.
	 */
	.post(
		"/margin/withdraw",
		async ({ account, body }) => {
			if (!account) throw new NotSignedInError();
			const wallet = await ensureUserWallet({ userId: account.id, address: account.address });
			await withdrawMargin({ wallet, amount: body.amount });
			return { requested: body.amount };
		},
		{ body: t.Object({ amount: t.Number({ minimum: 0 }) }) },
	);
