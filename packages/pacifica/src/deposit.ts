import { sha256 } from "@noble/hashes/sha2.js";
import {
	type AccountMeta,
	PublicKey,
	SystemProgram,
	TransactionInstruction,
} from "@solana/web3.js";

/**
 * Pacifica deposits, on Solana.
 *
 * A deposit is not a transfer to an address — it is an Anchor instruction on
 * Pacifica's custody program, and the depositor has to sign it. That single
 * fact drives most of the funding design: USDC bridged to a wallet is *not* yet
 * a Pacifica balance, and crediting it takes a signature from that wallet.
 *
 * Kept out of `index.ts` deliberately. This module pulls in `@solana/web3.js`,
 * and everything else in the package is plain fetch and Ed25519, so importing
 * the package for market data should not drag a Solana runtime along with it.
 */

/**
 * Solana mainnet-beta, pinned.
 *
 * A deposit is an Anchor instruction, so it names the program, central state,
 * vault and mint accounts directly rather than an API host. These are the four
 * Pacifica's own SDK hardcodes, and they exist on mainnet-beta only — which is
 * the cluster this app trades on, so there is nothing here to configure.
 */

/** Pacifica's custody program. */
export const PACIFICA_PROGRAM_ID = new PublicKey("PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH");

/** Program-wide state account, written on every deposit. */
export const PACIFICA_CENTRAL_STATE = new PublicKey("9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY");

/** The vault that ends up holding deposited USDC. */
export const PACIFICA_VAULT = new PublicKey("72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa");

export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/** USDC is 6 decimals on Solana, as everywhere else. */
export const USDC_DECIMALS = 6;

/** Pacifica rejects anything smaller; checked here so the wallet is never asked to sign a doomed transfer. */
export const MINIMUM_DEPOSIT_USDC = 10;

/**
 * Anchor's instruction selector: the first 8 bytes of sha256("global:<name>").
 *
 * Anchor programs dispatch on this rather than on an enum tag, so the name has
 * to match the on-chain handler exactly — "deposit", not "Deposit".
 */
export function anchorDiscriminator(instruction: string): Uint8Array {
	return sha256(new TextEncoder().encode(`global:${instruction}`)).slice(0, 8);
}

/** Convert a decimal USDC amount to base units, rejecting anything unrepresentable. */
export function toUsdcBaseUnits(amount: number): bigint {
	if (!Number.isFinite(amount) || amount <= 0) {
		throw new Error(`Deposit amount must be a positive number, got ${amount}`);
	}
	// Round rather than truncate: 10.0000009 should be 10 USDC, not a throw, and
	// floating point makes exact sub-unit input unrepresentable anyway.
	const base = Math.round(amount * 10 ** USDC_DECIMALS);
	if (!Number.isSafeInteger(base)) {
		throw new Error(`Deposit amount ${amount} is too large to express in USDC base units`);
	}
	return BigInt(base);
}

function u64LittleEndian(value: bigint): Uint8Array {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setBigUint64(0, value, true);
	return bytes;
}

/** The associated token account holding `mint` for `owner`. */
export function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
	return PublicKey.findProgramAddressSync(
		[owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
		ASSOCIATED_TOKEN_PROGRAM_ID,
	)[0];
}

/** Anchor's CPI event log authority for the program. */
export function pacificaEventAuthority(): PublicKey {
	return PublicKey.findProgramAddressSync(
		[new TextEncoder().encode("__event_authority")],
		PACIFICA_PROGRAM_ID,
	)[0];
}

/**
 * Create the depositor's USDC token account if it does not already exist.
 *
 * Idempotent, so this can be included unconditionally rather than reading the
 * account first — one fewer RPC round trip, and no race between the read and
 * the send. `payer` is separate from `owner` because a freshly derived wallet
 * has no SOL to pay the account's rent with.
 */
export function createUsdcAccountIfMissing(params: {
	payer: PublicKey;
	owner: PublicKey;
}): TransactionInstruction {
	const account = associatedTokenAddress(params.owner, USDC_MINT);
	const keys: AccountMeta[] = [
		{ pubkey: params.payer, isSigner: true, isWritable: true },
		{ pubkey: account, isSigner: false, isWritable: true },
		{ pubkey: params.owner, isSigner: false, isWritable: false },
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
 * The `deposit` instruction that credits a Pacifica account.
 *
 * The account credited is the depositor — Pacifica keys balances by the Solana
 * address that signed, so there is no recipient field to get wrong, and no way
 * to deposit on someone else's behalf.
 */
export function buildDepositInstruction(params: {
	depositor: PublicKey;
	/** Decimal USDC, e.g. 25.5. */
	amount: number;
}): TransactionInstruction {
	if (params.amount < MINIMUM_DEPOSIT_USDC) {
		throw new Error(
			`Pacifica's minimum deposit is ${MINIMUM_DEPOSIT_USDC} USDC; ${params.amount} would be rejected on-chain.`,
		);
	}

	const data = new Uint8Array(16);
	data.set(anchorDiscriminator("deposit"), 0);
	data.set(u64LittleEndian(toUsdcBaseUnits(params.amount)), 8);

	const keys: AccountMeta[] = [
		{ pubkey: params.depositor, isSigner: true, isWritable: true },
		{
			pubkey: associatedTokenAddress(params.depositor, USDC_MINT),
			isSigner: false,
			isWritable: true,
		},
		{ pubkey: PACIFICA_CENTRAL_STATE, isSigner: false, isWritable: true },
		{ pubkey: PACIFICA_VAULT, isSigner: false, isWritable: true },
		{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		{ pubkey: USDC_MINT, isSigner: false, isWritable: false },
		{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
		{ pubkey: pacificaEventAuthority(), isSigner: false, isWritable: false },
		{ pubkey: PACIFICA_PROGRAM_ID, isSigner: false, isWritable: false },
	];

	return new TransactionInstruction({
		programId: PACIFICA_PROGRAM_ID,
		keys,
		data: Buffer.from(data),
	});
}
