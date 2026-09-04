import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@lemon/db";
import { verifyMessage } from "viem";
import { config } from "../config";

/**
 * Sign-in.
 *
 * Much smaller than it used to be, and the reason is worth stating: users do not
 * trade through this app any more. They deposit USDC into a vault and hold an
 * ERC-20 share — both ordinary wallet actions that need no account, no derived
 * wallet, and no agent key.
 *
 * So a session now proves one thing, "which wallet is this", and buys two
 * conveniences: the admin dashboard, and seeing your own portfolio without
 * typing an address. Nothing a user owns depends on it. Losing this table logs
 * everyone out and costs nobody a cent, which is a materially better property
 * than the design it replaces.
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
export const SESSION_COOKIE = "lemon_session";
export const NONCE_TTL_MS = 10 * 60_000;

export type ChallengePurpose = "sign-in";

export class AuthUnavailableError extends Error {
	readonly reason: string;
	constructor(reason: string) {
		super(reason);
		this.name = "AuthUnavailableError";
		this.reason = reason;
	}
}

export class AuthError extends Error {
	readonly status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.name = "AuthError";
		this.status = status;
	}
}

/**
 * Why sign-in cannot work here, or null.
 *
 * Named rather than generic, because "sign-in is unavailable" sends an operator
 * looking at the wrong thing when the answer is a missing DATABASE_URL.
 */
export function accountsUnavailableReason(): string | null {
	if (!config.databaseUrl) {
		return "Sign-in needs DATABASE_URL: a session has to outlive the request that created it.";
	}
	return null;
}

function assertAvailable(): void {
	const reason = accountsUnavailableReason();
	if (reason) throw new AuthUnavailableError(reason);
}

/**
 * Lowercased, always.
 *
 * EIP-55 checksum casing varies by wallet and by call site, and two spellings of
 * one address must never become two accounts.
 */
export function normaliseAddress(address: string): string {
	return address.trim().toLowerCase();
}

export interface Challenge {
	nonce: string;
	message: string;
	expiresAt: Date;
}

/**
 * The text a wallet is asked to sign.
 *
 * It names the domain, the address, and a single-use nonce. A user reading it in
 * their wallet should be able to tell what they are agreeing to, which for
 * sign-in is: nothing but proof of control.
 */
export function challengeMessage(params: {
	address: string;
	nonce: string;
	issuedAt: Date;
	domain: string;
}): string {
	return [
		`${params.domain} wants you to sign in with your Ethereum account:`,
		params.address,
		"",
		"Signing proves you control this wallet. It grants no permission to move funds, and no permission to trade on your behalf.",
		"",
		`Nonce: ${params.nonce}`,
		`Issued at: ${params.issuedAt.toISOString()}`,
	].join("\n");
}

export async function issueChallenge(params: {
	address: string;
	domain: string;
	purpose?: ChallengePurpose;
}): Promise<Challenge> {
	assertAvailable();

	const address = normaliseAddress(params.address);
	const nonce = randomBytes(16).toString("hex");
	const issuedAt = new Date();
	const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
	const message = challengeMessage({ address, nonce, issuedAt, domain: params.domain });

	await prisma.signInNonce.create({
		data: {
			nonce,
			address,
			purpose: params.purpose ?? "sign-in",
			// Stored rather than reconstructed at verification time. The message
			// embeds a timestamp, and rebuilding it means reproducing that
			// timestamp exactly — a signature that fails because two clocks
			// disagree is indistinguishable from an attack.
			message,
			expiresAt,
		},
	});

	return { nonce, message, expiresAt };
}

/**
 * Check a signature against a challenge, and spend the challenge.
 *
 * Single-use and short-lived. Without both, a captured signature would be a
 * permanent credential replayable by anyone who ever saw it.
 */
export async function consumeChallenge(params: {
	address: string;
	nonce: string;
	signature: `0x${string}`;
	purpose?: ChallengePurpose;
}): Promise<{ message: string }> {
	assertAvailable();

	const address = normaliseAddress(params.address);
	const record = await prisma.signInNonce.findUnique({ where: { nonce: params.nonce } });

	if (!record) throw new AuthError("That challenge is not one this server issued.", 401);
	if (record.usedAt) throw new AuthError("That challenge has already been used.", 401);
	if (record.expiresAt < new Date()) throw new AuthError("That challenge has expired.", 401);
	if (record.address !== address) {
		throw new AuthError("That challenge was issued to a different address.", 401);
	}
	if (record.purpose !== (params.purpose ?? "sign-in")) {
		// A challenge issued for one action must never be replayable as another.
		throw new AuthError("That challenge was issued for a different purpose.", 401);
	}

	const valid = await verifyMessage({
		address: address as `0x${string}`,
		message: record.message,
		signature: params.signature,
	});
	if (!valid) throw new AuthError("That signature does not match the address.", 401);

	// Marked used only after the signature verifies, so a bad signature does not
	// burn a challenge and force the user to start again.
	await prisma.signInNonce.update({
		where: { nonce: params.nonce },
		data: { usedAt: new Date() },
	});

	return { message: record.message };
}

export async function upsertUser(address: string) {
	assertAvailable();
	const normalised = normaliseAddress(address);

	const admin = await prisma.adminUser.findUnique({ where: { address: normalised } });

	return prisma.user.upsert({
		where: { address: normalised },
		// Refreshed on every sign-in rather than only at creation: admin
		// membership changes, and a user whose access was granted after they last
		// signed in should not have to be told to sign out and back in.
		update: { isAdmin: admin !== null },
		create: { address: normalised, isAdmin: admin !== null },
	});
}

export interface SessionUser {
	user: { id: string; address: string; isAdmin: boolean };
	expiresAt: Date;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
	assertAvailable();
	const token = randomBytes(32).toString("base64url");
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

	// Only the hash is stored, so a database leak cannot be replayed as a live
	// session.
	await prisma.session.create({
		data: { tokenHash: hashToken(token), userId, expiresAt },
	});

	return { token, expiresAt };
}

export async function readSession(token: string | undefined): Promise<SessionUser | null> {
	if (!token || accountsUnavailableReason()) return null;

	const record = await prisma.session.findUnique({
		where: { tokenHash: hashToken(token) },
		include: { user: true },
	});

	if (!record || record.expiresAt < new Date()) return null;

	return {
		user: {
			id: record.user.id,
			address: record.user.address,
			isAdmin: record.user.isAdmin,
		},
		expiresAt: record.expiresAt,
	};
}

export async function destroySession(token: string | undefined): Promise<void> {
	if (!token || accountsUnavailableReason()) return;
	await prisma.session
		.delete({ where: { tokenHash: hashToken(token) } })
		// Already gone is the desired end state, so a missing row is not an error.
		.catch(() => undefined);
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export interface AccountSummary {
	address: string;
	isAdmin: boolean;
}

export function toAccountSummary(user: { address: string; isAdmin: boolean }): AccountSummary {
	return { address: user.address, isAdmin: user.isAdmin };
}
