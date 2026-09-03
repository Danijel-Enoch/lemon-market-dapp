import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

/**
 * Secret handling for the account system.
 *
 * Two different problems, deliberately solved differently:
 *
 *   * Session tokens are *hashed*. The server never needs the original back, so
 *     storing a digest means a stolen database is not a set of live sessions.
 *   * Pacifica agent keys are *encrypted*. The server does need those back — it
 *     signs every order with one — so the best available property is that the
 *     database alone is not enough: an attacker needs AUTH_SECRET too, and that
 *     lives in the process environment rather than in Postgres.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class MissingAuthSecretError extends Error {
	constructor() {
		super(
			"Accounts need AUTH_SECRET set to a random 32+ character string. Generate one with `openssl rand -base64 32`.",
		);
		this.name = "MissingAuthSecretError";
	}
}

/**
 * The encryption key, derived from AUTH_SECRET.
 *
 * Read per call rather than at module load so importing this file does not
 * crash a deployment that has not configured accounts — the features that need
 * it report themselves unavailable instead.
 */
function encryptionKey(): Buffer {
	const secret = process.env.AUTH_SECRET?.trim();
	if (!secret || secret.length < 32) throw new MissingAuthSecretError();
	// A hash, not the raw secret: AES-256 needs exactly 32 bytes and the
	// configured value is an arbitrary-length string.
	return createHash("sha256").update(secret).digest();
}

export function isAuthConfigured(): boolean {
	const secret = process.env.AUTH_SECRET?.trim();
	return Boolean(secret && secret.length >= 32);
}

/**
 * Encrypt a secret for storage.
 *
 * The nonce and authentication tag travel with the ciphertext, so a stored
 * value is self-describing and needs no second column.
 */
export function seal(plaintext: string): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/**
 * Decrypt a stored secret.
 *
 * GCM authenticates as it decrypts, so tampering or a rotated AUTH_SECRET
 * surfaces as a thrown error rather than as plausible-looking garbage that
 * would later be used to sign an order.
 */
export function unseal(sealed: string): string {
	const raw = Buffer.from(sealed, "base64");
	if (raw.length <= IV_BYTES + TAG_BYTES) {
		throw new Error("Sealed value is too short to be valid ciphertext");
	}

	const decipher = createDecipheriv(ALGORITHM, encryptionKey(), raw.subarray(0, IV_BYTES));
	decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
	return Buffer.concat([
		decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
		decipher.final(),
	]).toString("utf8");
}

/** A 32-byte URL-safe random token, used as a session bearer. */
export function randomToken(): string {
	return randomBytes(32).toString("base64url");
}

/** The stored form of a session token. */
export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/** Constant-time string comparison, for anything an attacker can guess at. */
export function safeEquals(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	if (left.length !== right.length) return false;
	return timingSafeEqual(left, right);
}
