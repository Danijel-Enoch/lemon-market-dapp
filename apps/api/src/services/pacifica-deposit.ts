import { prisma, type User } from "@lemon/db";
import {
	associatedTokenAddress,
	buildDepositInstruction,
	createUsdcAccountIfMissing,
	MINIMUM_DEPOSIT_USDC,
	USDC_DECIMALS,
	USDC_MINT,
} from "@lemon/pacifica/deposit";
import { base58 } from "@scure/base";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { clients, config } from "../config";
import { AuthError } from "./auth";

/**
 * Funding a Pacifica account.
 *
 * Two hops, and the gap between them is the whole difficulty:
 *
 *   1. USDC moves from the connected wallet to the user's derived Solana
 *      wallet. Ordinary bridging; the user signs it with their own wallet.
 *   2. A `deposit` instruction moves it from that wallet into Pacifica's
 *      custody program, which is what actually creates a tradable balance.
 *
 * Step 2 has to be signed by the derived wallet, whose key lives in the MPC
 * network — and paid for in SOL, which that wallet does not have. Hence the
 * server-side fee payer: it covers the transaction fee and the rent for a
 * first-time token account, and it is never an authority over the funds.
 *
 * The two hops are separate because they can fail separately. Money that has
 * bridged but not been credited is not lost, but it is invisible to Pacifica,
 * and the accounts page has to be able to say so.
 */

export class DepositUnavailableError extends Error {
	constructor(readonly reason: string) {
		super(reason);
		this.name = "DepositUnavailableError";
	}
}

/** Why crediting a deposit is unavailable, or null when it works. */
export function depositUnavailableReason(): string | null {
	if (!clients.nearMpc) {
		return "Deposits need NEAR signing configured — the deposit instruction is signed by your derived wallet.";
	}
	if (!config.solanaFeePayerSecret) {
		return "Deposits need SOLANA_FEE_PAYER_SECRET: a funded Solana keypair to pay network fees, since derived wallets hold only USDC.";
	}
	return null;
}

function feePayer(): Keypair {
	const secret = config.solanaFeePayerSecret;
	if (!secret) throw new DepositUnavailableError(depositUnavailableReason() ?? "No fee payer");

	try {
		return Keypair.fromSecretKey(base58.decode(secret));
	} catch (error) {
		throw new DepositUnavailableError(
			`SOLANA_FEE_PAYER_SECRET is not a base58 Solana secret key: ${(error as Error).message}`,
		);
	}
}

let connection: Connection | undefined;
function rpc(): Connection {
	// Created lazily and reused: a Connection opens sockets, and most requests
	// to this API never touch Solana at all.
	connection ??= new Connection(config.solanaRpcUrl, "confirmed");
	return connection;
}

/**
 * USDC sitting in the derived wallet, waiting to be credited.
 *
 * This is the balance that has bridged but is not yet Pacifica's. Shown on the
 * accounts page precisely because it would otherwise be money the user can see
 * leaving their wallet and cannot see anywhere else.
 */
export async function pendingBalance(user: User): Promise<number> {
	const account = associatedTokenAddress(new PublicKey(user.solanaAddress), USDC_MINT);
	try {
		const balance = await rpc().getTokenAccountBalance(account);
		return Number(balance.value.uiAmount ?? 0);
	} catch {
		// No token account yet simply means nothing has arrived.
		return 0;
	}
}

/**
 * Credit bridged USDC into the Pacifica account.
 *
 * The transaction carries two signatures: the fee payer's, made locally, and
 * the derived wallet's, made by the MPC network over the compiled message. The
 * order matters only in that both must be present before it is sent.
 */
export async function creditDeposit(params: { user: User; amount: number }): Promise<{
	signature: string;
	amount: number;
}> {
	const unavailable = depositUnavailableReason();
	if (unavailable) throw new DepositUnavailableError(unavailable);

	if (params.amount < MINIMUM_DEPOSIT_USDC) {
		throw new AuthError(`Pacifica's minimum deposit is ${MINIMUM_DEPOSIT_USDC} USDC.`, 422);
	}

	const available = await pendingBalance(params.user);
	if (available + 1e-6 < params.amount) {
		throw new AuthError(
			`Only ${available.toFixed(USDC_DECIMALS)} USDC has arrived so far. Bridging can take a few minutes.`,
			409,
		);
	}

	const payer = feePayer();
	const depositor = new PublicKey(params.user.solanaAddress);

	const record = await prisma.pacificaDeposit.create({
		data: { userId: params.user.id, amountUsdc: params.amount, status: "CREDITING" },
	});

	try {
		const transaction = new Transaction();
		// Idempotent, so it costs one instruction and saves a round trip
		// checking whether the account already exists.
		transaction.add(createUsdcAccountIfMissing({ payer: payer.publicKey, owner: depositor }));
		transaction.add(buildDepositInstruction({ depositor, amount: params.amount }));

		const { blockhash, lastValidBlockHeight } = await rpc().getLatestBlockhash("confirmed");
		transaction.recentBlockhash = blockhash;
		transaction.feePayer = payer.publicKey;

		// biome-ignore lint/style/noNonNullAssertion: depositUnavailableReason rejects a null client.
		const mpc = clients.nearMpc!;
		const signature = await mpc.signSolanaMessage(
			params.user.derivationPath,
			transaction.serializeMessage(),
		);

		transaction.addSignature(depositor, Buffer.from(signature));
		transaction.partialSign(payer);

		const txSignature = await rpc().sendRawTransaction(transaction.serialize(), {
			// The MPC signature is already final; a preflight failure here would
			// only be reported after the slow part is done anyway.
			skipPreflight: false,
			maxRetries: 3,
		});

		await rpc().confirmTransaction(
			{ signature: txSignature, blockhash, lastValidBlockHeight },
			"confirmed",
		);

		await prisma.pacificaDeposit.update({
			where: { id: record.id },
			data: { status: "CREDITED", solanaTxSignature: txSignature },
		});

		return { signature: txSignature, amount: params.amount };
	} catch (error) {
		await prisma.pacificaDeposit.update({
			where: { id: record.id },
			data: { status: "FAILED", failureReason: (error as Error).message.slice(0, 500) },
		});
		throw error;
	}
}

/**
 * Withdraw from Pacifica back to the derived Solana wallet.
 *
 * Signed through MPC rather than with the agent key: Pacifica requires the
 * account key for withdrawals, which is exactly the property that keeps a
 * compromised agent key from draining an account.
 */
export async function withdraw(params: { user: User; amount: number }): Promise<void> {
	const mpc = clients.nearMpc;
	if (!mpc) throw new DepositUnavailableError("NEAR signing is not configured on this deployment.");

	await clients.pacifica.requestWithdrawal(mpc.solanaMessageSigner(params.user.derivationPath), {
		account: params.user.solanaAddress,
		amount: params.amount.toFixed(USDC_DECIMALS),
	});
}
