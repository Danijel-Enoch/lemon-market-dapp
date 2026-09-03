import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

/**
 * Pacifica request signing.
 *
 * Every mutating Pacifica endpoint authenticates with an Ed25519 signature over
 * a canonical JSON encoding of the request. The canonicalisation is the whole
 * point: the server rebuilds the same bytes from the fields it receives, so any
 * disagreement about key order or spacing is an invalid signature rather than a
 * useful error message.
 *
 * The rules, from the Pacifica signing guide:
 *   1. Wrap the operation payload as { timestamp, expiry_window, type, data }.
 *   2. Sort object keys recursively, at every level, ascending.
 *   3. Serialise compactly — no whitespace, `,` and `:` separators.
 *   4. Sign the UTF-8 bytes with Ed25519; base58 the 64-byte signature.
 *   5. Send { account, agent_wallet, signature, timestamp, expiry_window }
 *      spread together with the *unwrapped* operation payload.
 *
 * Step 5 is easy to get wrong: the wire request is flat, even though the signed
 * message nests the payload under `data`.
 */

/** JSON that survives a round trip through the canonical encoder. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Pacifica's `type` discriminator, e.g. "create_order". */
export type OperationType =
	| "create_order"
	| "create_market_order"
	| "create_stop_order"
	| "cancel_order"
	| "cancel_all_orders"
	| "cancel_stop_order"
	| "update_leverage"
	| "update_margin_mode"
	| "set_position_tpsl"
	| "withdraw"
	| "subaccount_initiate"
	| "subaccount_confirm"
	| "transfer_funds"
	| "bind_agent_wallet"
	| "create_api_key"
	| "revoke_api_key"
	| "list_api_keys"
	| "approve_builder_code"
	| "revoke_builder_code";

export interface SignatureHeader {
	timestamp: number;
	/** Milliseconds the signature stays valid. Pacifica defaults to 30_000. */
	expiry_window: number;
	type: OperationType;
}

/** Pacifica's default signature lifetime, in milliseconds. */
export const DEFAULT_EXPIRY_WINDOW = 30_000;

/**
 * Recursively sort object keys.
 *
 * Arrays keep their order — position is meaningful there — but every object,
 * however deeply nested, is rebuilt with ascending keys.
 */
export function sortJsonKeys(value: Json): Json {
	if (Array.isArray(value)) return value.map(sortJsonKeys);
	if (value !== null && typeof value === "object") {
		const sorted: { [key: string]: Json } = {};
		for (const key of Object.keys(value).sort()) {
			sorted[key] = sortJsonKeys(value[key]);
		}
		return sorted;
	}
	return value;
}

/**
 * The exact bytes Pacifica verifies against.
 *
 * `JSON.stringify` already emits the compact `,`/`:` separators the spec asks
 * for, so canonicalising is purely a matter of key order.
 */
export function canonicalMessage(header: SignatureHeader, data: Json): string {
	return JSON.stringify(sortJsonKeys({ ...header, data } as unknown as Json));
}

/** A 32-byte Ed25519 secret key, plus its base58 public key. */
export interface Keypair {
	secretKey: Uint8Array;
	publicKey: string;
}

/** Solana secret keys are distributed as 64 bytes: seed ‖ public key. */
export function keypairFromSecret(secret: Uint8Array | string): Keypair {
	const bytes = typeof secret === "string" ? base58.decode(secret) : secret;
	if (bytes.length !== 32 && bytes.length !== 64) {
		throw new Error(`Expected a 32- or 64-byte Ed25519 secret key, got ${bytes.length}`);
	}
	const seed = bytes.slice(0, 32);
	return { secretKey: seed, publicKey: base58.encode(ed25519.getPublicKey(seed)) };
}

/** Generate a fresh agent keypair. Used for Pacifica API agent wallets. */
export function generateKeypair(): Keypair {
	const seed = ed25519.utils.randomSecretKey();
	return { secretKey: seed, publicKey: base58.encode(ed25519.getPublicKey(seed)) };
}

/**
 * Sign a canonical message with a locally held key.
 *
 * Only used for agent wallets. The main account's key is held by the NEAR MPC
 * network and never exists locally, so that path signs through
 * `signWith`/`buildSignedRequest` with a remote signer instead.
 */
export function signMessage(message: string, secretKey: Uint8Array): string {
	return base58.encode(ed25519.sign(new TextEncoder().encode(message), secretKey));
}

export function verifyMessage(
	message: string,
	signatureB58: string,
	publicKeyB58: string,
): boolean {
	try {
		return ed25519.verify(
			base58.decode(signatureB58),
			new TextEncoder().encode(message),
			base58.decode(publicKeyB58),
		);
	} catch {
		return false;
	}
}

/**
 * Produces a base58 Ed25519 signature over the given UTF-8 message.
 *
 * Abstracted so the same request builder serves a local agent key and the NEAR
 * MPC signer, which is asynchronous and lives off-machine.
 */
export type Signer = (message: string) => Promise<string> | string;

export function localSigner(secretKey: Uint8Array): Signer {
	return (message) => signMessage(message, secretKey);
}

export interface SignedRequestOptions {
	/** Solana pubkey of the *account*, even when an agent key does the signing. */
	account: string;
	type: OperationType;
	data: Json;
	/**
	 * Public key of the agent wallet, when one is signing on the account's
	 * behalf. Pacifica requires this to look up which key to verify against.
	 */
	agentWallet?: string | null;
	expiryWindow?: number;
	/** Injected in tests so the signed timestamp is deterministic. */
	timestamp?: number;
}

/** The flat JSON body Pacifica expects on the wire. */
export type SignedRequest = Record<string, unknown> & {
	account: string;
	agent_wallet: string | null;
	signature: string;
	timestamp: number;
	expiry_window: number;
};

/**
 * Build a ready-to-POST Pacifica body.
 *
 * Note the shape change between what is signed and what is sent: the signature
 * covers `{...header, data: payload}`, but the request spreads `payload` at the
 * top level next to the header fields.
 */
export async function buildSignedRequest(
	sign: Signer,
	options: SignedRequestOptions,
): Promise<SignedRequest> {
	const header: SignatureHeader = {
		timestamp: options.timestamp ?? Date.now(),
		expiry_window: options.expiryWindow ?? DEFAULT_EXPIRY_WINDOW,
		type: options.type,
	};

	const signature = await sign(canonicalMessage(header, options.data));

	return {
		account: options.account,
		agent_wallet: options.agentWallet ?? null,
		signature,
		timestamp: header.timestamp,
		expiry_window: header.expiry_window,
		...(options.data as Record<string, unknown>),
	};
}
