import type { NearMpcClient } from "@lemon/near-mpc";
import {
	type Address,
	type Hex,
	hashMessage,
	hashTypedData,
	keccak256,
	type LocalAccount,
	nonceManager,
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
	/**
	 * Always a local account, never a JSON-RPC one — this key signs here.
	 *
	 * Stated as `LocalAccount` rather than `ReturnType<typeof toAccount>`, whose
	 * union includes an account type that has no `nonceManager`. That looseness
	 * meant the nonce wiring below could be removed without anything failing to
	 * compile, which is not a property worth having on the field that decides how
	 * the agent's transactions are numbered.
	 */
	account: LocalAccount;
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

		/**
		 * Hand out transaction nonces from a local counter, not from a fresh read.
		 *
		 * A tick sends its Base transactions from one address, back to back, through
		 * two different paths: the venue adapter calls `sendTransaction` directly for
		 * swaps and approvals, and `VaultClient` goes through `writeContract`.
		 * Neither passes a nonce, so viem asked the node for one each time — and the
		 * answer is only as fresh as the node that happens to serve the request.
		 * Behind a load balancer, or in the moment after a transaction is broadcast,
		 * it comes back stale.
		 *
		 * That is not hypothetical. An unwind sold its spot leg at nonce 38, and the
		 * activity report that followed read 38 again and was rejected with `nonce
		 * too low: next nonce 39, tx nonce 38`. The trades had executed; only the
		 * public record of them was lost, which is the half a depositor reads.
		 *
		 * `nonceManager` remembers what it last issued for an address and returns
		 * `previous + 1` whenever the chain reports something no higher, so a lagging
		 * read cannot hand out a number already spent. It is keyed by address and
		 * chain, so one shared instance is correct across every vault the process
		 * runs — each has its own agent wallet.
		 *
		 * The trade this makes: a transaction that is *never broadcast* — an RPC that
		 * refuses it outright, rather than a revert — leaves its nonce claimed, and
		 * the next send goes out one ahead of the chain and sits pending until that
		 * gap is filled. A revert does not do this, because a reverted transaction is
		 * still mined and still consumes its nonce. Stale reads happen on every tick
		 * that sends more than one transaction; refused broadcasts are rare and
		 * visible. This is the better failure to have.
		 */
		nonceManager,

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
