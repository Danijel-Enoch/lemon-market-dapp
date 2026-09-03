import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, bytesToNumberBE, bytesToNumberLE, hexToBytes } from "@noble/curves/utils.js";
import { keccak_256, sha3_256 } from "@noble/hashes/sha3.js";
import { base58 } from "@scure/base";

/**
 * NEAR chain-signature address derivation.
 *
 * The MPC network holds one root key per curve and never reveals a child
 * secret. Instead every (caller, path) pair names a child key by an additive
 * tweak — "epsilon derivation" in near/mpc:
 *
 *     epsilon      = sha3_256("near-mpc-recovery v0.1.0 epsilon derivation:<caller>,<path>")
 *     child_pubkey = root_pubkey + epsilon · G
 *
 * Because the tweak only touches public data, the child address is computable
 * offline. That matters here: onboarding derives a user's EVM and Solana
 * addresses with no RPC round trip, and the same inputs always reproduce the
 * same addresses — which is what makes the derived wallets recoverable rather
 * than something the app must remember.
 *
 * `caller` is the NEAR account that will call `sign`, so it is the *relayer*
 * account, not the user. The user's identity lives in the path. Changing the
 * relayer account changes every derived address, which is why it is treated as
 * permanent configuration rather than a deployment detail.
 */

const EPSILON_DERIVATION_PREFIX = "near-mpc-recovery v0.1.0 epsilon derivation:";

/** A NEAR-format public key, e.g. `ed25519:G9hw…` or `secp256k1:3tFR…`. */
export type NajPublicKey = string;

/**
 * The additive tweak for a (caller, path) pair.
 *
 * Returned as raw bytes because the two curves read it differently:
 * secp256k1 takes it big-endian, ed25519 little-endian and reduced mod L.
 */
export function epsilonTweak(predecessorId: string, path: string): Uint8Array {
	return sha3_256(new TextEncoder().encode(`${EPSILON_DERIVATION_PREFIX}${predecessorId},${path}`));
}

function decodeNaj(key: NajPublicKey, expectedCurve: string): Uint8Array {
	const separator = key.indexOf(":");
	if (separator === -1) {
		throw new Error(`Malformed NEAR public key (expected "<curve>:<base58>"): ${key}`);
	}
	const curve = key.slice(0, separator);
	if (curve !== expectedCurve) {
		throw new Error(`Expected a ${expectedCurve} key, got ${curve}`);
	}
	return base58.decode(key.slice(separator + 1));
}

/**
 * Derive the child Ed25519 public key — the Solana address.
 *
 * The tweak is interpreted little-endian and reduced mod the group order,
 * matching `derive_public_key_edwards_point_ed25519` in the MPC contract. Doing
 * it big-endian produces a perfectly valid point that the network will never
 * sign for, so the difference is silent until a deposit is stranded.
 */
export function deriveEd25519PublicKey(
	rootPublicKey: NajPublicKey,
	predecessorId: string,
	path: string,
): string {
	const root = ed25519.Point.fromBytes(decodeNaj(rootPublicKey, "ed25519"));
	const scalar = bytesToNumberLE(epsilonTweak(predecessorId, path)) % ed25519.Point.Fn.ORDER;
	const child = root.add(ed25519.Point.BASE.multiply(scalar));
	return base58.encode(child.toBytes());
}

/** Derive the child secp256k1 public key, uncompressed and hex-encoded (04‖x‖y). */
export function deriveSecp256k1PublicKey(
	rootPublicKey: NajPublicKey,
	predecessorId: string,
	path: string,
): string {
	// NEAR distributes secp256k1 keys as the bare 64-byte x‖y, so the SEC1 "04"
	// uncompressed marker has to be put back before the point will parse.
	const root = secp256k1.Point.fromBytes(
		Uint8Array.from([0x04, ...decodeNaj(rootPublicKey, "secp256k1")]),
	);
	const scalar = bytesToNumberBE(epsilonTweak(predecessorId, path)) % secp256k1.Point.Fn.ORDER;
	const child = root.add(secp256k1.Point.BASE.multiply(scalar));
	return bytesToHex(child.toBytes(false));
}

/**
 * The EVM address for a secp256k1 key: last 20 bytes of keccak(x‖y).
 *
 * Accepts the key with or without the SEC1 `04` marker, because NEAR omits it
 * and the curve library includes it.
 */
export function evmAddressFromPublicKey(publicKey: Uint8Array): `0x${string}` {
	const coordinates = publicKey.length === 65 ? publicKey.slice(1) : publicKey;
	if (coordinates.length !== 64) {
		throw new Error(`Expected a 64- or 65-byte secp256k1 public key, got ${publicKey.length}`);
	}
	return `0x${bytesToHex(keccak_256(coordinates).slice(-20))}`;
}

/** The EVM address a derivation path controls. */
export function deriveEvmAddress(
	rootPublicKey: NajPublicKey,
	predecessorId: string,
	path: string,
): `0x${string}` {
	const uncompressed = deriveSecp256k1PublicKey(rootPublicKey, predecessorId, path);
	return evmAddressFromPublicKey(hexToBytes(uncompressed));
}

/** Read a NEAR-format secp256k1 key as an EVM address. */
export function evmAddressFromNaj(najPublicKey: NajPublicKey): `0x${string}` {
	return evmAddressFromPublicKey(decodeNaj(najPublicKey, "secp256k1"));
}
