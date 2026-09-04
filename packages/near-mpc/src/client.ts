import { base58 } from "@scure/base";
import { Account, JsonRpcProvider } from "near-api-js";
import {
	DOMAIN_ID,
	MAX_EDDSA_PAYLOAD_BYTES,
	MAX_GAS,
	MPC_CONTRACT,
	MPC_ROOT_KEYS,
	NEAR_RPC_URL,
	type NearNetwork,
} from "./constants";
import {
	deriveEd25519PublicKey,
	deriveEvmAddress,
	evmAddressFromNaj,
	type NajPublicKey,
} from "./derivation";

export class NearMpcError extends Error {
	constructor(
		message: string,
		readonly cause?: unknown,
	) {
		super(message);
		this.name = "NearMpcError";
	}
}

export interface NearMpcConfig {
	network: NearNetwork;
	/** The relayer account that calls `sign`. Part of every derived address. */
	accountId: string;
	/** Its full access key, `ed25519:<base58>`. Server-side only. */
	privateKey: string;
	contractId?: string;
	rpcUrl?: string;
	/**
	 * Finality to wait for. `sign` is a yield-resume call — the signature only
	 * exists once the MPC network responds — so anything less than a final
	 * outcome returns before there is a signature to read.
	 */
	waitUntil?: "FINAL" | "EXECUTED_OPTIMISTIC" | "EXECUTED";
}

/** The pair of addresses one derivation path controls. */
export interface DerivedAccounts {
	path: string;
	/** base58 Ed25519 key — also the Solana address. */
	solanaAddress: string;
	evmAddress: `0x${string}`;
}

/**
 * Signs on behalf of derived wallets through the NEAR MPC network.
 *
 * The private key here is the *relayer's* NEAR access key, which authorises
 * calls to the signer contract — it is not, and cannot be turned into, any
 * user's key. What it does control is which paths get signed, so the
 * authorisation of a request has to happen before this class is reached.
 *
 * Requests are serialised. Every `sign` is an ordinary NEAR transaction from
 * one access key, and concurrent transactions from one key race on the nonce:
 * two in flight means one is rejected as a duplicate. Queueing is slower than
 * failing, but signing throughput is not the bottleneck in an onboarding flow.
 */
/** An unset environment variable and an empty one mean the same thing here. */
function blankToUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export class NearMpcClient {
	readonly accountId: string;
	readonly contractId: string;
	private readonly network: NearNetwork;
	private readonly account: Account;
	private readonly waitUntil: NonNullable<NearMpcConfig["waitUntil"]>;
	/** Tail of the serialisation chain; every request appends to it. */
	private queue: Promise<unknown> = Promise.resolve();

	constructor(config: NearMpcConfig) {
		this.network = config.network;
		this.accountId = config.accountId;
		// `??` is not enough here. These arrive from environment variables, and a
		// variable that is present but empty — which is how every `.env` template
		// ships an optional override — is a string, not nullish, so it wins the
		// coalesce and the client ends up addressing a contract named "". NEAR
		// rejects that with "the Account ID is too short", at the first RPC call
		// rather than at construction, which reads as an outage rather than as
		// configuration.
		this.contractId = blankToUndefined(config.contractId) ?? MPC_CONTRACT[config.network];
		this.waitUntil = config.waitUntil ?? "FINAL";
		this.account = new Account(
			config.accountId,
			new JsonRpcProvider({
				url: blankToUndefined(config.rpcUrl) ?? NEAR_RPC_URL[config.network],
			}),
			config.privateKey as `ed25519:${string}`,
		);
	}

	private get roots(): { secp256k1: NajPublicKey; ed25519: NajPublicKey } {
		return MPC_ROOT_KEYS[this.network];
	}

	/**
	 * The addresses a path controls.
	 *
	 * Pure computation — no RPC — so this is safe to call on every request
	 * rather than caching addresses that must not drift.
	 */
	derive(path: string): DerivedAccounts {
		return {
			path,
			solanaAddress: deriveEd25519PublicKey(this.roots.ed25519, this.accountId, path),
			evmAddress: deriveEvmAddress(this.roots.secp256k1, this.accountId, path),
		};
	}

	/**
	 * Confirm the pinned root keys still match the contract.
	 *
	 * Cheap, and worth doing once at boot: a mismatch means every address this
	 * process derives belongs to a key the network will not sign for.
	 */
	async verifyRootKeys(): Promise<void> {
		const probePath = "lemon-root-key-check";
		const [ed25519, secp256k1] = await Promise.all([
			this.viewDerivedPublicKey(probePath, DOMAIN_ID.ed25519),
			this.viewDerivedPublicKey(probePath, DOMAIN_ID.secp256k1),
		]);

		const local = this.derive(probePath);
		if (ed25519 !== `ed25519:${local.solanaAddress}`) {
			throw new NearMpcError(
				`Pinned ed25519 root key disagrees with ${this.contractId}: the contract derives ${ed25519} where this build expects ed25519:${local.solanaAddress}. Derived Solana addresses would be unsignable.`,
			);
		}

		// Compare the secp256k1 child as an EVM address rather than a raw point,
		// since that is the form the rest of the app actually uses.
		const contractEvm = evmAddressFromNaj(secp256k1);
		if (contractEvm !== local.evmAddress) {
			throw new NearMpcError(
				`Pinned secp256k1 root key disagrees with ${this.contractId}: the contract derives ${contractEvm} where this build expects ${local.evmAddress}. Derived EVM addresses would be unsignable.`,
			);
		}
	}

	private async viewDerivedPublicKey(path: string, domainId: number): Promise<string> {
		const result = await this.account.provider.callFunction({
			contractId: this.contractId,
			method: "derived_public_key",
			args: { path, predecessor: this.accountId, domain_id: domainId },
			blockQuery: { finality: "final" },
		});
		return String(result);
	}

	/**
	 * Ask the network for an Ed25519 signature over `message`.
	 *
	 * Ed25519 signs the message itself rather than a digest, so the bytes go to
	 * the contract verbatim — which is why the size limit is checked here rather
	 * than discovered as a failed transaction.
	 */
	async signEd25519(path: string, message: Uint8Array): Promise<Uint8Array> {
		if (message.length > MAX_EDDSA_PAYLOAD_BYTES) {
			throw new NearMpcError(
				`Ed25519 payload is ${message.length} bytes; the signer contract accepts at most ${MAX_EDDSA_PAYLOAD_BYTES}.`,
			);
		}

		const result = await this.enqueue(() =>
			this.account.callFunction({
				contractId: this.contractId,
				methodName: "sign",
				args: {
					request: {
						payload_v2: { Eddsa: toHex(message) },
						path,
						domain_id: DOMAIN_ID.ed25519,
					},
				},
				gas: MAX_GAS,
				// One yoctoNEAR: the contract's full-access-key assertion.
				deposit: 1n,
				waitUntil: this.waitUntil,
			}),
		);

		return parseEd25519Signature(result);
	}

	/**
	 * Ask the network for a secp256k1 signature over a 32-byte digest.
	 *
	 * This is what lets a derived EVM address act on Base — a vault agent has to
	 * call `agentWithdraw`, `reportNav` and `fulfillRedeem`, and a wallet that
	 * can only receive is not an agent.
	 *
	 * The asymmetry with Ed25519 is the payload. Ed25519 signs the message; ECDSA
	 * signs a hash of it, so the contract takes exactly 32 bytes and the caller
	 * is responsible for hashing. Passing a whole transaction here would be
	 * accepted by neither the contract nor the chain.
	 */
	async signSecp256k1(path: string, digest: Uint8Array): Promise<EcdsaSignature> {
		if (digest.length !== 32) {
			throw new NearMpcError(
				`ECDSA payloads are a 32-byte digest; got ${digest.length} bytes. Hash the message first.`,
			);
		}

		const result = await this.enqueue(() =>
			this.account.callFunction({
				contractId: this.contractId,
				methodName: "sign",
				args: {
					request: {
						payload_v2: { Ecdsa: toHex(digest) },
						path,
						domain_id: DOMAIN_ID.secp256k1,
					},
				},
				gas: MAX_GAS,
				deposit: 1n,
				waitUntil: this.waitUntil,
			}),
		);

		return parseEcdsaSignature(result);
	}

	/**
	 * A viem-compatible signer for one path's EVM address.
	 *
	 * Returned as a plain `sign(hash)` function rather than a viem Account so
	 * this package keeps no dependency on viem — the agent wraps it in
	 * `toAccount` where the types are already in scope.
	 */
	evmDigestSigner(path: string): (digest: Uint8Array) => Promise<EcdsaSignature> {
		return (digest: Uint8Array) => this.signSecp256k1(path, digest);
	}

	/**
	 * A Pacifica `Signer` bound to one derivation path.
	 *
	 * Pacifica signs a canonical JSON string and expects base58, which is
	 * exactly the shape `@lemon/pacifica` asks for — so the MPC network can
	 * stand in for a local key anywhere that type is accepted.
	 */
	solanaMessageSigner(path: string): (message: string) => Promise<string> {
		return async (message: string) => {
			const signature = await this.signEd25519(path, new TextEncoder().encode(message));
			return base58.encode(signature);
		};
	}

	/** Sign the compiled message of a Solana transaction. */
	async signSolanaMessage(path: string, messageBytes: Uint8Array): Promise<Uint8Array> {
		return this.signEd25519(path, messageBytes);
	}

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		// `catch` before chaining so one failed signature does not poison the
		// queue for everything behind it.
		const next = this.queue.catch(() => undefined).then(task);
		this.queue = next.catch(() => undefined);
		return next;
	}
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Pull the 64 signature bytes out of the contract's reply.
 *
 * The Ed25519 domain answers `{ scheme: "Ed25519", signature: [...] }`, but a
 * bare array shows up on some deployments, so both are accepted. Anything else
 * is reported with its shape intact — an unrecognised success is far more
 * confusing later than a loud failure here.
 */
export function parseEd25519Signature(result: unknown): Uint8Array {
	const raw =
		result && typeof result === "object" && "signature" in result
			? (result as { signature: unknown }).signature
			: result;

	const bytes = Array.isArray(raw)
		? Uint8Array.from(raw as number[])
		: typeof raw === "string"
			? base58.decode(raw)
			: undefined;

	if (!bytes || bytes.length !== 64) {
		throw new NearMpcError(
			`Expected a 64-byte Ed25519 signature from the signer contract, got ${JSON.stringify(result)?.slice(0, 200)}`,
		);
	}
	return bytes;
}

/**
 * An ECDSA signature in the form an EVM chain wants.
 *
 * `v` is the recovery parameter as 27/28 rather than 0/1. Ethereum has used the
 * offset form since Homestead, and returning the raw bit would produce a
 * signature that verifies to the wrong address roughly half the time — a failure
 * that looks like an authorisation bug rather than an encoding one.
 */
export interface EcdsaSignature {
	r: `0x${string}`;
	s: `0x${string}`;
	v: 27 | 28;
	yParity: 0 | 1;
}

/**
 * Pull `(r, s, v)` out of the signer contract's ECDSA reply.
 *
 * The contract answers with the full point `big_r` — 33 bytes, compressed — and
 * a scalar `s`. `r` is the x-coordinate, so the leading parity byte is dropped;
 * keeping it would produce a 33-byte `r` that no EVM client accepts.
 */
export function parseEcdsaSignature(result: unknown): EcdsaSignature {
	const payload = (result ?? {}) as Record<string, unknown>;
	// Some deployments wrap the response in its scheme name.
	const body = (payload.Secp256k1 ?? payload.secp256k1 ?? payload) as Record<string, unknown>;

	const bigR = extractAffinePoint(body.big_r ?? body.bigR);
	const sRaw = extractScalar(body.s);
	const recoveryId = Number(body.recovery_id ?? body.recoveryId ?? NaN);

	if (!bigR || !sRaw || !Number.isInteger(recoveryId) || recoveryId < 0 || recoveryId > 1) {
		throw new NearMpcError(
			`Unrecognised ECDSA response from the signer contract: ${JSON.stringify(result)?.slice(0, 300)}`,
		);
	}

	// `big_r` is SEC1-compressed: one parity byte then the 32-byte x-coordinate.
	const r = bigR.length === 66 ? bigR.slice(2) : bigR;
	if (r.length !== 64) {
		throw new NearMpcError(`Expected a 32-byte r from big_r, got ${r.length / 2} bytes.`);
	}

	return {
		r: `0x${r}`,
		s: `0x${sRaw}`,
		v: (recoveryId + 27) as 27 | 28,
		yParity: recoveryId as 0 | 1,
	};
}

function extractAffinePoint(value: unknown): string | undefined {
	if (typeof value === "string") return strip0x(value);
	if (value && typeof value === "object") {
		const affine = value as { affine_point?: unknown; affinePoint?: unknown };
		const point = affine.affine_point ?? affine.affinePoint;
		if (typeof point === "string") return strip0x(point);
	}
	return undefined;
}

function extractScalar(value: unknown): string | undefined {
	if (typeof value === "string") return strip0x(value);
	if (value && typeof value === "object") {
		const scalar = (value as { scalar?: unknown }).scalar;
		if (typeof scalar === "string") return strip0x(scalar);
	}
	return undefined;
}

function strip0x(value: string): string {
	return value.startsWith("0x") ? value.slice(2).toLowerCase() : value.toLowerCase();
}
