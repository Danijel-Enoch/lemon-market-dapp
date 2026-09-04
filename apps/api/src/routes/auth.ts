import { Elysia, t } from "elysia";
import {
	accountsUnavailableReason,
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

const addressSchema = t.String({ pattern: "^0x[a-fA-F0-9]{40}$" });
const signatureSchema = t.String({ pattern: "^0x[a-fA-F0-9]+$" });

/** Elysia types cookie values as `unknown`; a session token is a string or absent. */
function sessionToken(cookie: Record<string, { value?: unknown } | undefined>): string | undefined {
	const value = cookie[SESSION_COOKIE]?.value;
	return typeof value === "string" ? value : undefined;
}

/**
 * Sign-in: one signature, and it grants nothing.
 *
 * Depositing into a vault and withdrawing from it are wallet transactions the
 * user signs themselves, so neither needs an account. What a session buys is the
 * admin dashboard and the convenience of a portfolio page that knows who you
 * are — which is why signing in is entirely optional and the app says so.
 */
export const authRoutes = new Elysia({ prefix: "/auth" })
	/** What is configured, and what is missing. Named, so an operator can act on it. */
	.get("/status", () => {
		const reason = accountsUnavailableReason();
		return { available: reason === null, reason };
	})

	.post(
		"/challenge",
		async ({ body, request }) => {
			const domain = new URL(request.url).host;
			const challenge = await issueChallenge({ address: body.address, domain });
			return { nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt };
		},
		{ body: t.Object({ address: addressSchema }) },
	)

	.post(
		"/sign-in",
		async ({ body, cookie }) => {
			await consumeChallenge({
				address: body.address,
				nonce: body.nonce,
				signature: body.signature as `0x${string}`,
			});

			const user = await upsertUser(body.address);
			const { token, expiresAt } = await createSession(user.id);

			cookie[SESSION_COOKIE]?.set({
				value: token,
				httpOnly: true,
				sameSite: "lax",
				// Secure in production only, so local development over http works.
				secure: process.env.NODE_ENV === "production",
				path: "/",
				maxAge: Math.floor(SESSION_TTL_MS / 1000),
			});

			return { account: toAccountSummary(user), expiresAt };
		},
		{
			body: t.Object({
				address: addressSchema,
				nonce: t.String({ minLength: 8 }),
				signature: signatureSchema,
			}),
		},
	)

	.get("/me", async ({ cookie }) => {
		const session = await readSession(sessionToken(cookie));
		if (!session) return { account: null };
		return { account: toAccountSummary(session.user), expiresAt: session.expiresAt };
	})

	.post("/sign-out", async ({ cookie }) => {
		await destroySession(sessionToken(cookie));
		cookie[SESSION_COOKIE]?.remove();
		return { ok: true };
	})

	.get("/address/:address", ({ params }) => ({ address: normaliseAddress(params.address) }), {
		params: t.Object({ address: addressSchema }),
	});
