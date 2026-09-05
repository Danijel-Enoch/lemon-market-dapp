import type { NearMpcClient } from "@lemon/near-mpc";
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	associatedTokenAddress,
	TOKEN_PROGRAM_ID,
	USDC_MINT,
} from "@lemon/pacifica/deposit";
import { base58 } from "@scure/base";
import {
	type AccountMeta,
	type Commitment,
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";

/**
 * The agent's Solana side.
 *
 * Everything the agent does on Base goes through viem and a `toAccount` shim,
 * and none of that helps here: Solana signs the transaction *message* with
 * Ed25519 rather than a hash with secp256k1, and the message cannot be built
 * until the fee payer and a recent blockhash are known. So this module owns the
 * whole build-sign-send cycle rather than exposing a signer.
 *
 * Two signatures go on every transaction, and they come from different places.
 * The agent's Solana wallet is an MPC-derived key that holds USDC and has never
 * held SOL — it cannot pay for its own transaction, and it cannot pay the rent
 * on its own token account. A separate, ordinary keypair covers both. That
 * keypair is only ever a fee payer: it is not an authority over any token
 * account, so its compromise costs the SOL in it and nothing else.
 */

/** Solana's own USDC decimals. Six, as everywhere else. */
const USDC_DECIMALS = 6;

/** SPL Token's `TransferChecked` instruction index. */
const TRANSFER_CHECKED = 12;

export interface SolanaExecutor {
	/** The fee payer's address, so a low balance can be reported against it. */
	readonly feePayer: string;
	/** USDC held by `owner`, in base units. Zero when the token account does not exist. */
	usdcBalance(owner: string): Promise<bigint>;
	/** Lamports held by the fee payer, so a stalled bridge can name the reason. */
	feePayerLamports(): Promise<bigint>;
	/**
	 * Build, sign and confirm one transaction signed by an MPC-derived wallet.
	 *
	 * Returns the signature. Throws on anything that leaves the transaction
	 * unlanded — a caller moving money must not treat "probably fine" as sent.
	 */
	send(params: {
		/** Derivation path of the wallet whose signature the instructions require. */
		path: string;
		/** That wallet's address, which must be a required signer. */
		signer: string;
		instructions: TransactionInstruction[];
	}): Promise<string>;
	/**
	 * Wait until `owner` holds at least `target` USDC.
	 *
	 * For the two places the agent depends on somebody else's schedule: a Relay
	 * fill and a Pacifica withdrawal both credit this wallet when they are ready
	 * rather than when they are asked, and acting on the balance before it
	 * settles builds a transfer the runtime rejects for insufficient funds.
	 */
	waitForUsdc(owner: string, target: bigint, timeoutMs: number): Promise<bigint>;
}

export interface SolanaExecutorOptions {
	rpcUrl: string;
	/**
	 * The fee payer's secret key: base58, or a JSON array of bytes.
	 *
	 * Both forms because both are what a wallet hands you — `solana-keygen`
	 * writes the JSON array, every browser wallet exports base58 — and an
	 * operator pasting the one this did not accept would see a base58 checksum
	 * error rather than a format complaint.
	 */
	feePayerSecret: string;
	mpc: NearMpcClient;
	commitment?: Commitment;
}

export function createSolanaExecutor(options: SolanaExecutorOptions): SolanaExecutor {
	const commitment: Commitment = options.commitment ?? "confirmed";
	const connection = new Connection(options.rpcUrl, commitment);
	const feePayer = parseKeypair(options.feePayerSecret);

	async function usdcBalance(owner: string): Promise<bigint> {
		const account = associatedTokenAddress(new PublicKey(owner), USDC_MINT);
		// `getTokenAccountBalance` throws rather than returning zero when the
		// account has never been created, which is the ordinary state of a wallet
		// before its first deposit — not an error worth propagating.
		const info = await connection.getTokenAccountBalance(account, commitment).catch(() => null);
		return info ? BigInt(info.value.amount) : 0n;
	}

	return {
		feePayer: feePayer.publicKey.toBase58(),
		usdcBalance,

		async feePayerLamports() {
			return BigInt(await connection.getBalance(feePayer.publicKey, commitment));
		},

		async send({ path, signer, instructions }) {
			const signerKey = new PublicKey(signer);
			const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);

			const transaction = new Transaction();
			transaction.add(...instructions);
			transaction.feePayer = feePayer.publicKey;
			transaction.recentBlockhash = blockhash;

			// The MPC signs the compiled message verbatim — Ed25519 covers the
			// message, not a digest of it — so this is the exact byte string the
			// runtime will verify against.
			const message = transaction.serializeMessage();
			const signature = await options.mpc.signSolanaMessage(path, Uint8Array.from(message));
			transaction.addSignature(signerKey, Buffer.from(signature));
			transaction.partialSign(feePayer);

			const hash = await connection.sendRawTransaction(transaction.serialize(), {
				// Preflight on. A simulated failure here is a transaction that would
				// have burned the fee and landed nothing, and the simulation names the
				// program error where a dropped transaction names nothing at all.
				skipPreflight: false,
				maxRetries: 3,
			});

			const confirmation = await connection.confirmTransaction(
				{ signature: hash, blockhash, lastValidBlockHeight },
				commitment,
			);
			if (confirmation.value.err) {
				throw new Error(
					`Solana transaction ${hash} failed on chain: ${JSON.stringify(confirmation.value.err)}`,
				);
			}
			return hash;
		},

		async waitForUsdc(owner, target, timeoutMs) {
			const deadline = Date.now() + timeoutMs;
			let seen = await usdcBalance(owner);
			while (seen < target && Date.now() < deadline) {
				await sleep(5_000);
				seen = await usdcBalance(owner);
			}
			if (seen < target) {
				throw new Error(
					`${owner} still holds ${seen} of the ${target} USDC base units expected after ${Math.round(timeoutMs / 1000)}s. The funds are not lost — they have not settled — but nothing downstream can be built on them yet.`,
				);
			}
			return seen;
		},
	};
}

/**
 * Move USDC between two ordinary wallets.
 *
 * `TransferChecked` rather than `Transfer`, which costs one extra account and
 * buys the mint and decimals being verified on-chain. The agent builds these
 * amounts from venue responses, and a decimals mismatch that the runtime does
 * not catch is a transfer off by a factor of a thousand.
 */
export function usdcTransfer(params: {
	owner: string;
	to: string;
	amount: bigint;
}): TransactionInstruction {
	const owner = new PublicKey(params.owner);
	const source = associatedTokenAddress(owner, USDC_MINT);
	const destination = associatedTokenAddress(new PublicKey(params.to), USDC_MINT);

	const data = new Uint8Array(10);
	data[0] = TRANSFER_CHECKED;
	new DataView(data.buffer).setBigUint64(1, params.amount, true);
	data[9] = USDC_DECIMALS;

	const keys: AccountMeta[] = [
		{ pubkey: source, isSigner: false, isWritable: true },
		{ pubkey: USDC_MINT, isSigner: false, isWritable: false },
		{ pubkey: destination, isSigner: false, isWritable: true },
		{ pubkey: owner, isSigner: true, isWritable: false },
	];

	return new TransactionInstruction({ programId: TOKEN_PROGRAM_ID, keys, data: Buffer.from(data) });
}

/**
 * Create a wallet's USDC account if it has none, paid for by someone else.
 *
 * Idempotent, so it can be attached unconditionally rather than reading the
 * account first — one fewer round trip, and no race between the read and the
 * send. The same instruction `@lemon/pacifica` builds for a depositor, with the
 * owner left free: the agent has to create the *destination* account when it
 * sends to a Relay deposit address that has never held USDC.
 */
export function createUsdcAccount(params: {
	payer: string;
	owner: string;
}): TransactionInstruction {
	const owner = new PublicKey(params.owner);
	const keys: AccountMeta[] = [
		{ pubkey: new PublicKey(params.payer), isSigner: true, isWritable: true },
		{ pubkey: associatedTokenAddress(owner, USDC_MINT), isSigner: false, isWritable: true },
		{ pubkey: owner, isSigner: false, isWritable: false },
		{ pubkey: USDC_MINT, isSigner: false, isWritable: false },
		{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
		{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
	];

	return new TransactionInstruction({
		programId: ASSOCIATED_TOKEN_PROGRAM_ID,
		keys,
		// Discriminator 1 is `CreateIdempotent`; 0 would fail on an existing account.
		data: Buffer.from([1]),
	});
}

/**
 * A secret key in either of the two forms an operator will have one in.
 *
 * Validated here rather than at first use. A malformed fee payer is a
 * configuration error, and discovering it at the moment a bridge needs to send
 * means discovering it with a vault's margin already half-moved.
 */
function parseKeypair(secret: string): Keypair {
	const trimmed = secret.trim();
	if (!trimmed) {
		throw new Error(
			"SOLANA_FEE_PAYER_SECRET is empty. The agent's Solana wallet holds USDC but never SOL, so without a fee payer it cannot send any transaction.",
		);
	}

	try {
		const bytes = trimmed.startsWith("[")
			? Uint8Array.from(JSON.parse(trimmed) as number[])
			: base58.decode(trimmed);
		return Keypair.fromSecretKey(bytes);
	} catch (error) {
		throw new Error(
			`SOLANA_FEE_PAYER_SECRET is not a Solana secret key: expected base58 or a JSON byte array. ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
