import { randomBytes } from "node:crypto";
import { isDatabaseConfigured, prisma, type User } from "@lemon/db";
import { derivationPath } from "@lemon/near-mpc";
import { verifyMessage } from "viem";
import { clients, config } from "../config";
import { needsBuilderApproval } from "./builder";
import { hashToken, isAuthConfigured, randomToken } from "./secrets";

/**
 * Sign-in, in two steps.
 *
 * Step one proves the user controls the connected wallet and, in doing so,
 * authorises the app to derive their trading wallets. Step two authorises one
 * specific Pacifica agent key to trade on their behalf. They are separate
 * signatures because they grant different things — bundling them would mean a
 * user who only wanted to look at their portfolio has also handed over trading
 * authority.
 *
 * Every signature covers a single-use nonce. Without that a captured signature
 * is a permanent credential: the same message would verify forever, for anyone
 * who replayed it.
 */

/** How long a challenge stays signable. Long enough to read, short enough not to sit in a log. */
const NONCE_TTL_MS = 10 * 60_000;

/** Session lifetime. Trading authority is not something to leave open indefinitely. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

export const SESSION_COOKIE = "lemon_session";

export type ChallengePurpose = "sign-in" | "pacifica";

export class AuthUnavailableError extends Error {
	constructor(readonly reason: string) {
		super(reason);
		this.name = "AuthUnavailableError";
	}
}

export class AuthError extends Error {
	constructor(
		message: string,
		readonly status = 401,
	) {
		super(message);
		this.name = "AuthError";
	}
}

/**
 * Why accounts are unavailable, or null when they work.
 *
 * Reported up front rather than as a failure mid-flow: a user who has already
 * signed one message should not then discover the server was never able to
 * finish. Each dependency is genuinely required — there is no degraded mode
 * that still ends in a working Pacifica account.
 */
export function accountsUnavailableReason(): string | null {
	if (!isDatabaseConfigured()) {
		return "Accounts need DATABASE_URL. Derived wallets and Pacifica agent keys cannot be reconstructed, so they have to be stored.";
	}
	if (!isAuthConfigured()) {
		return "Accounts need AUTH_SECRET set to a random 32+ character string. Generate one with `openssl rand -base64 32`.";
	}
	if (!clients.nearMpc) {
		return "Accounts need NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY. Trading wallets are derived through the NEAR MPC network.";
	}
	return null;
}

function assertAvailable(): void {
	const reason = accountsUnavailableReason();
	if (reason) throw new AuthUnavailableError(reason);
}

/** The MPC client, once availability has been established. */
function mpc() {
	assertAvailable();
	// biome-ignore lint/style/noNonNullAssertion: assertAvailable rejects a null client.
	return clients.nearMpc!;
}

export function normaliseAddress(address: string): string {
	return address.trim().toLowerCase();
}

/* --------------------------------------------------------------- challenges */

export interface Challenge {
	nonce: string;
	message: string;
	expiresAt: Date;
}

/**
 * The text a wallet is asked to sign.
 *
 * Written to be readable in a wallet's signing dialog, because that dialog is
 * the only place the user can actually check what they are agreeing to. The
 * Pacifica variant names the exact agent key being authorised, which is what
 * makes the second signature a real authorisation rather than a formality: a
 * server that substituted a different key would produce a signature that does
 * not verify.
 */
export function challengeMessage(params: {
	purpose: ChallengePurpose;
	address: string;
	nonce: string;
	issuedAt: Date;
	pacificaAccount?: string;
	agentPublicKey?: string;
}): string {
	const lines = ["Lemon Markets", ""];

	if (params.purpose === "sign-in") {
		lines.push(
			"Sign in and create your trading wallets.",
			"",
			"This signature does not approve any transaction and does not move funds.",
		);
	} else {
		lines.push(
			"Activate your Pacifica trading account.",
			"",
			"This authorises the agent key below to place and cancel orders for you.",
			"It cannot withdraw your funds.",
			"",
			`Pacifica account: ${params.pacificaAccount}`,
			`Agent key: ${params.agentPublicKey}`,
		);

		// The fee is stated because this dialog is the only place the user sees
		// it. Asking someone to approve a builder code without naming what it
		// costs them is a consent they cannot actually give.
		const builder = config.fees.pacificaBuilder;
		if (builder) {
			lines.push(
				"",
				`Builder fee: up to ${formatFeeRate(builder.maxFeeRate)} of order value, paid to this app.`,
				`Builder code: ${builder.code}`,
			);
		}
	}

	lines.push(
		"",
		`Wallet: ${params.address}`,
		`Nonce: ${params.nonce}`,
		`Issued at: ${params.issuedAt.toISOString()}`,
	);

	return lines.join("\n");
}

/**
 * A decimal fee rate as a percentage, for human eyes.
 *
 * "0.001" is 0.1%, which is not what most people read it as at a glance — hence
 * showing the percentage rather than the raw fraction in the signing dialog.
 */
export function formatFeeRate(rate: string): string {
	const percent = Number(rate) * 100;
	return `${Number(percent.toFixed(4))}%`;
}

/**
 * The builder fee this deployment charges, as a percentage, or null.
 *
 * Deployment configuration rather than user state, so it is reported even to a
 * visitor with no account — the onboarding panel names the fee before asking
 * anyone to start.
 */
export function builderFeeLabel(): string | null {
	const builder = config.fees.pacificaBuilder;
	return builder ? formatFeeRate(builder.maxFeeRate) : null;
}

/** Issue a single-use challenge for one wallet and one purpose. */
export async function issueChallenge(params: {
	address: string;
	purpose: ChallengePurpose;
	/** Builds the text to sign once the nonce and timestamp exist. */
	message: (nonce: string, issuedAt: Date) => string;
	payload?: string;
}): Promise<Challenge> {
	assertAvailable();

	const nonce = randomBytes(16).toString("hex");
	const issuedAt = new Date();
	const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
	const message = params.message(nonce, issuedAt);

	await prisma.signInNonce.create({
		data: {
			nonce,
			address: normaliseAddress(params.address),
			purpose: params.purpose,
			expiresAt,
			message,
			payload: params.payload,
		},
	});

	return { nonce, message, expiresAt };
}

/**
 * Verify a signature against an outstanding challenge, and burn the challenge.
 *
 * The nonce is marked used inside the same conditional update that reads it, so
 * two requests racing on one signature cannot both succeed.
 */
export async function consumeChallenge(params: {
	address: string;
	purpose: ChallengePurpose;
	nonce: string;
	signature: `0x${string}`;
}): Promise<{ payload: string | null }> {
	assertAvailable();

	const address = normaliseAddress(params.address);

	// Burn first, then verify. Marking the nonce used inside the same
	// conditional update that matches it means two requests racing on one
	// signature cannot both get through — and a wrong signature does not get a
	// second attempt at the same challenge.
	const { count } = await prisma.signInNonce.updateMany({
		where: {
			nonce: params.nonce,
			address,
			purpose: params.purpose,
			usedAt: null,
			expiresAt: { gt: new Date() },
		},
		data: { usedAt: new Date() },
	});

	if (count === 0) {
		throw new AuthError("That sign-in request has expired or already been used. Try again.");
	}

	const record = await prisma.signInNonce.findUnique({ where: { nonce: params.nonce } });
	if (!record) throw new AuthError("That sign-in request no longer exists. Try again.");

	const valid = await verifyMessage({
		address: address as `0x${string}`,
		// The stored text, never anything the client sent: a caller that could
		// choose the message could have it signed for a different purpose.
		message: record.message,
		signature: params.signature,
	});

	if (!valid) {
		throw new AuthError("Signature does not match the connected wallet.");
	}

	return { payload: record.payload };
}

/* -------------------------------------------------------------------- users */

/**
 * The user record for a connected wallet, created on first sign-in.
 *
 * Derived addresses are computed once and stored. They are reproducible from
 * the path, but storing them means a later change in derivation code is a
 * visible mismatch rather than a silent repointing of someone's funds.
 */
export async function upsertUser(address: string): Promise<User> {
	assertAvailable();

	const normalised = normaliseAddress(address);
	const existing = await prisma.user.findUnique({ where: { address: normalised } });
	if (existing) return existing;

	const path = derivationPath(normalised);
	const derived = mpc().derive(path);

	return prisma.user.create({
		data: {
			address: normalised,
			derivationPath: path,
			solanaAddress: derived.solanaAddress,
			derivedEvmAddress: derived.evmAddress,
		},
	});
}

/* ----------------------------------------------------------------- sessions */

export interface SessionUser {
	user: User;
	expiresAt: Date;
}

/** Create a session and return the bearer token. Only the digest is stored. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
	const token = randomToken();
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

	await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
	return { token, expiresAt };
}

/** Resolve a bearer token, or null when it is absent, unknown or expired. */
export async function readSession(token: string | undefined): Promise<SessionUser | null> {
	if (!token) return null;
	if (accountsUnavailableReason()) return null;

	const session = await prisma.session.findUnique({
		where: { tokenHash: hashToken(token) },
		include: { user: true },
	});

	if (!session) return null;
	if (session.expiresAt.getTime() <= Date.now()) {
		// Clean up on the way past rather than sweeping separately; an expired
		// session is only ever noticed when someone presents it.
		await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
		return null;
	}

	return { user: session.user, expiresAt: session.expiresAt };
}

export async function destroySession(token: string | undefined): Promise<void> {
	if (!token || accountsUnavailableReason()) return;
	await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/* ------------------------------------------------------------- presentation */

/**
 * What the browser is told about an account.
 *
 * The derived addresses are deliberately absent. They are plumbing — a user who
 * sends funds directly to one has bypassed the deposit flow and put money
 * somewhere the app will not credit — so they are not something to show, copy
 * or encourage.
 */
export interface AccountSummary {
	address: string;
	pacificaAccount: string;
	tradingEnabled: boolean;
	activatedAt: string | null;
	/**
	 * True when this deployment charges a builder fee that the user has not
	 * approved — because they onboarded before it was configured, or because the
	 * rate has since risen past the ceiling they agreed to.
	 *
	 * Their orders still fill; they are simply not attributed. Surfaced so the
	 * app can ask for approval rather than quietly forgoing the fee for the life
	 * of the account.
	 */
	builderApprovalRequired: boolean;
	/** What re-approving would cost them, as a percentage. Null when no fee applies. */
	builderFee: string | null;
}

export function toAccountSummary(user: User): AccountSummary {
	const builder = config.fees.pacificaBuilder;
	return {
		address: user.address,
		pacificaAccount: user.solanaAddress,
		tradingEnabled: Boolean(user.pacificaAgentPublicKey && user.pacificaBoundAt),
		activatedAt: user.pacificaBoundAt?.toISOString() ?? null,
		builderApprovalRequired: needsBuilderApproval(user, builder),
		builderFee: builder ? formatFeeRate(builder.maxFeeRate) : null,
	};
}
