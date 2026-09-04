import type { NearMpcClient } from "@lemon/near-mpc";
import {
	type Address,
	type Hex,
	hashMessage,
	hashTypedData,
	keccak256,
	serializeTransaction,
	toBytes,
} from "viem";
import { toAccount } from "viem/accounts";

/**
 * A viem account whose key does not exist.
 *
 * Every signature is a round trip to the NEAR MPC network, which holds a share
 * of a key nobody has ever assembled. That is what makes an agent wallet
 * recoverable rather than a secret: lose this process and its disk entirely, and
 * the same vault address still derives the same wallets, still holding the same
 * position.
 *
 * The cost is latency and ordering. A signature is an on-chain NEAR function
 * call — hundreds of milliseconds, not microseconds — and `NearMpcClient`
 * serialises them because concurrent calls from one access key race on the
 * nonce. An agent that fires transactions in parallel will find them queued, so
 * the worker sends them in sequence and does not pretend otherwise.
 */
export interface AgentWallet {
	address: Address;
	solanaAddress: string;
	path: string;
	account: ReturnType<typeof toAccount>;
	/** Signs a Pacifica canonical payload with the same path's Ed25519 key. */
	signSolanaMessage: (message: string) => Promise<string>;
}

/**
 * Build the wallet for one vault, from the path that vault was created with.
 *
 * The path is passed in rather than recomputed, and that is the whole point. A
 * vault's `agentWallet` is fixed in its constructor, so it is whatever address
 * the admin flow derived *before the vault existed* — which means from the
 * market and tier, since the vault address did not yet exist to derive from.
 * Recomputing a path here from the vault address would produce a different,
 * perfectly valid-looking wallet that holds no role on the vault, and every
 * write the agent attempted would revert.
 *
 * `expectedAddress` makes that failure impossible to ship: the caller passes the
 * vault's on-chain `agentWallet` and a mismatch throws here, at startup, rather
 * than as a stream of reverted transactions.
 */
export function agentWalletFor(
	mpc: NearMpcClient,
	path: string,
	expectedAddress?: Address,
): AgentWallet {
	const derived = mpc.derive(path);

	if (expectedAddress && derived.evmAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
		throw new Error(
			`Derivation path "${path}" gives ${derived.evmAddress}, but the vault names ${expectedAddress} as its agent. The vault's agent address is immutable, so this path cannot sign for it — check NEAR_ACCOUNT_ID, which is an input to derivation.`,
		);
	}

	const account = toAccount({
		address: derived.evmAddress,

		async signMessage({ message }) {
			return encodeSignature(await mpc.signSecp256k1(path, toBytes(hashMessage(message))));
		},

		async signTypedData(typedData) {
			// viem's generic typed-data parameter is not expressible here without
			// pinning a schema the caller has not chosen yet.
			// biome-ignore lint/suspicious/noExplicitAny: see above.
			const digest = hashTypedData(typedData as any);
			return encodeSignature(await mpc.signSecp256k1(path, toBytes(digest)));
		},

		/**
		 * Sign a transaction.
		 *
		 * ECDSA signs a digest, so the transaction is serialised unsigned, hashed,
		 * and then re-serialised with the signature attached. Handing the raw
		 * transaction bytes to the signer instead would be rejected by the
		 * contract, which takes exactly 32 bytes.
		 */
		async signTransaction(transaction, options) {
			const serializer = options?.serializer ?? serializeTransaction;
			// A custom serializer may be async; the built-in is not.
			const unsigned = await serializer(transaction);
			const signature = await mpc.signSecp256k1(path, toBytes(keccak256(unsigned)));
			return await serializer(transaction, {
				r: signature.r,
				s: signature.s,
				v: BigInt(signature.v),
				yParity: signature.yParity,
			});
		},
	});

	return {
		address: derived.evmAddress,
		solanaAddress: derived.solanaAddress,
		path,
		account,
		signSolanaMessage: mpc.solanaMessageSigner(path),
	};
}

/** `r ∥ s ∥ v` — the 65-byte form `eth_sign` results are expected in. */
function encodeSignature(signature: { r: Hex; s: Hex; v: 27 | 28 }): Hex {
	return `0x${signature.r.slice(2)}${signature.s.slice(2)}${signature.v.toString(16)}` as Hex;
}
