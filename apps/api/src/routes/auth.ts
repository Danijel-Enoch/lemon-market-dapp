import { Elysia, t } from "elysia";
import {
	accountsUnavailableReason,
	builderFeeLabel,
	challengeMessage,
	consumeChallenge,
	createSession,
	destroySession,
	issueChallenge,
	normaliseAddress,
	readSession,
	SESSION_COOKIE,
	SESSION_TTL_MS,
	toAccountSummary,
	upsertUser,
} from "../services/auth";
import { activatePacifica, mintPendingAgent } from "../services/pacifica-account";

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });
const signatureSchema = t.String({ pattern: "^0x[a-fA-F0-9]+$" });

/** Elysia types cookie values as `unknown`; a session token is a string or absent. */
function sessionToken(cookie: Record<string, { value?: unknown } | undefined>): string | undefined {
	const value = cookie[SESSION_COOKIE]?.value;
	return typeof value === "string" ? value : undefined;
}

/**
 * Onboarding.
 *
 * Two signatures, in order:
 *
 *   1. `/auth/sign-in` — proves the wallet, and creates the derived EVM and
 *      Solana wallets behind it. Cheap, and reversible in the sense that it
 *      grants nothing but a session.
 *   2. `/auth/pacifica/activate` — authorises a named agent key to trade on the
 *      derived Solana account. This is the one that unlocks order placement.
 *
 * Splitting them costs a second wallet prompt and buys a real distinction: a
 * user who signs only the first can read their account but cannot be traded
 * for, by anyone, including this server.
 */
export const authRoutes = new Elysia({ prefix: "/auth" })
	/**
	 * Whether accounts work on this deployment, and why not.
	 *
	 * Checked before the UI offers to sign anything. Discovering a missing
	 * NEAR key *after* the user has signed would leave them staring at a broken
	 * flow with no way to tell whose fault it was.
	 */
	.get("/status", () => {
		const reason = accountsUnavailableReason();
		return { available: reason === null, reason, builderFee: builderFeeLabel() };
	})

	/** The current session, or an empty one. Safe to call on every page load. */
	.get("/session", async ({ cookie }) => {
		const session = await readSession(sessionToken(cookie));
		const reason = accountsUnavailableReason();

		return {
			available: reason === null,
			reason,
			account: session ? toAccountSummary(session.user) : null,
			builderFee: builderFeeLabel(),
		};
	})

	/** Step one, part one: the text to sign. */
	.post(
		"/sign-in/challenge",
		async ({ body }) => {
			const address = normaliseAddress(body.address);
			const challenge = await issueChallenge({
				address,
				purpose: "sign-in",
				message: (nonce, issuedAt) =>
					challengeMessage({ purpose: "sign-in", address, nonce, issuedAt }),
			});

			return {
				nonce: challenge.nonce,
				message: challenge.message,
				expiresAt: challenge.expiresAt.toISOString(),
			};
		},
		{ body: t.Object({ address: addressSchema }) },
	)

	/**
	 * Step one, part two: verify, derive, and open a session.
	 *
	 * Deriving happens here rather than lazily at first use so that the wallets
	 * exist — and are recorded — from the moment the user is signed in. A
	 * derived address that appears later is an address a user may already have
	 * sent funds to.
	 */
	.post(
		"/sign-in",
		async ({ body, cookie }) => {
			await consumeChallenge({
				address: body.address,
				purpose: "sign-in",
				nonce: body.nonce,
				signature: body.signature as `0x${string}`,
			});

			const user = await upsertUser(body.address);
			const { token, expiresAt } = await createSession(user.id);

			cookie[SESSION_COOKIE]?.set({
				value: token,
				httpOnly: true,
				sameSite: "lax",
				secure: process.env.NODE_ENV === "production",
				path: "/",
				maxAge: Math.floor(SESSION_TTL_MS / 1000),
			});

			return { account: toAccountSummary(user), expiresAt: expiresAt.toISOString() };
		},
		{
			body: t.Object({
				address: addressSchema,
				nonce: t.String({ minLength: 8 }),
				signature: signatureSchema,
			}),
		},
	)

	/**
	 * Step two, part one: mint an agent key and ask the user to authorise it.
	 *
	 * The key is named in the message, so the signature is specific to it. The
	 * secret never leaves the server — the browser only ever sees the public
	 * half, which is all it needs to display what is being approved.
	 */
	.post("/pacifica/challenge", async ({ cookie, status }) => {
		const session = await readSession(sessionToken(cookie));
		if (!session) return status(401, { error: "Sign in first." });

		const agent = mintPendingAgent();
		const challenge = await issueChallenge({
			address: session.user.address,
			purpose: "pacifica",
			payload: agent.sealed,
			message: (nonce, issuedAt) =>
				challengeMessage({
					purpose: "pacifica",
					address: session.user.address,
					nonce,
					issuedAt,
					pacificaAccount: session.user.solanaAddress,
					agentPublicKey: agent.publicKey,
				}),
		});

		return {
			nonce: challenge.nonce,
			message: challenge.message,
			agentPublicKey: agent.publicKey,
			expiresAt: challenge.expiresAt.toISOString(),
		};
	})

	/**
	 * Step two, part two: bind the agent key on Pacifica.
	 *
	 * This is the slow one — it waits on the NEAR MPC network to sign with the
	 * account key — and it is the only request in the app that does.
	 */
	.post(
		"/pacifica/activate",
		async ({ body, cookie, status }) => {
			const session = await readSession(sessionToken(cookie));
			if (!session) return status(401, { error: "Sign in first." });

			const { payload } = await consumeChallenge({
				address: session.user.address,
				purpose: "pacifica",
				nonce: body.nonce,
				signature: body.signature as `0x${string}`,
			});

			if (!payload) {
				return status(400, { error: "Activation state is missing. Start again." });
			}

			const user = await activatePacifica({
				user: session.user,
				sealedAgent: payload,
				agentPublicKey: body.agentPublicKey,
			});

			return { account: toAccountSummary(user) };
		},
		{
			body: t.Object({
				nonce: t.String({ minLength: 8 }),
				signature: signatureSchema,
				agentPublicKey: t.String({ minLength: 32 }),
			}),
		},
	)

	.post("/sign-out", async ({ cookie }) => {
		await destroySession(sessionToken(cookie));
		cookie[SESSION_COOKIE]?.remove();
		return { ok: true };
	});
