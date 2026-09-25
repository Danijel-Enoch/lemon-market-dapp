import { isAccountNotFound, type PacificaPosition } from "@lemon/pacifica";
import {
	associatedTokenAddress,
	buildDepositInstruction,
	createUsdcAccountIfMissing,
	lamportsRequired,
	MINIMUM_DEPOSIT_USDC,
	readSolanaCosts,
	USDC_MINT,
} from "@lemon/pacifica/deposit";
import { base58 } from "@scure/base";
import {
	Connection,
	Keypair,
	PublicKey,
	Transaction,
	type TransactionInstruction,
} from "@solana/web3.js";
import { clients, config } from "../config";
import type { UserWalletSummary } from "./user-wallet";

/**
 * The half of a self-managed position this server can actually execute.
 *
 * Everything here acts on a Solana address derived through NEAR chain
 * signatures, which means the signature is a round trip to the MPC network
 * rather than a local operation — hundreds of milliseconds, serialised, and
 * occasionally slow enough that a caller has to be written as though it were a
 * network call, because it is one.
 *
 * The division of labour is worth restating because it drives every signature
 * below. The user's spot leg is in their own wallet and this file cannot touch
 * it. The margin, the short, and the deposit that funds them are all on Pacifica
 * under the derived address, and this file is the only thing that can move them.
 * So a "close" here closes half a position, and the orchestration that pairs it
 * with the user's own transaction lives in `self-execution.ts`.
 *
 * ## Authorisation happens before this file
 *
 * `NearMpcClient` signs for whatever path it is handed. Nothing in it knows
 * which user a path belongs to, and by the time a path reaches it the question
 * must already be settled — which is why every function here takes a
 * `UserWalletSummary` read from a session rather than an address from a request
 * body. An address parameter would be an open invitation to sign for someone
 * else's wallet.
 */

export class PerpUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PerpUnavailableError";
	}
}

function requireMpc() {
	const mpc = clients.nearMpc;
	if (!mpc) {
		throw new PerpUnavailableError(
			"NEAR chain signatures are not configured on this deployment, so the perp leg cannot be signed for.",
		);
	}
	return mpc;
}

/**
 * The Solana account that pays for the derived wallet's transactions.
 *
 * A derived wallet holds USDC and has never held SOL, so it cannot pay for the
 * instruction that credits its own Pacifica balance, nor the rent on its own
 * token account. This keypair covers both and is never an authority over
 * anyone's funds — its compromise costs the SOL in it and nothing else.
 */
function requireFeePayer(): Keypair {
	const secret = config.solanaFeePayerSecret;
	if (!secret) {
		throw new PerpUnavailableError(
			"No Solana fee payer is configured (SOLANA_FEE_PAYER_SECRET), so no deposit can be paid for. Bridged USDC would arrive and stay stuck.",
		);
	}
	return Keypair.fromSecretKey(base58.decode(secret));
}

function connection(): Connection {
	return new Connection(config.solanaRpcUrl, "confirmed");
}

/**
 * Credit USDC sitting in the derived wallet to its Pacifica account.
 *
 * Pacifica has no registration call — an account exists from its first deposit —
 * so this is also what brings a brand-new account into being. The instruction
 * credits whoever signed it, which is why there is no recipient parameter and
 * no way to deposit on somebody else's behalf.
 *
 * Idempotent in the only sense that matters: it deposits whatever is currently
 * idle, so calling it twice after one bridge deposits once and then finds
 * nothing to do.
 */
export async function depositIdleMargin(params: {
	wallet: UserWalletSummary;
}): Promise<
	{ deposited: number; signature: string } | { deposited: 0; signature: null; reason: string }
> {
	// Asserted up front rather than discovered inside `sendSolana` below. Both
	// guards are cheap and both failures are configuration rather than anything
	// the user did, so they belong before the RPC round trips.
	requireMpc();
	const feePayer = requireFeePayer();
	const rpc = connection();

	const owner = new PublicKey(params.wallet.solanaAddress);
	const tokenAccount = associatedTokenAddress(owner, USDC_MINT);

	const balance = await rpc
		.getTokenAccountBalance(tokenAccount)
		.then((result) => BigInt(result.value.amount))
		// The account not existing is the ordinary state of a wallet nobody has
		// bridged to, not an error.
		.catch(() => 0n);

	const decimal = Number(balance) / 1e6;

	if (decimal < MINIMUM_DEPOSIT_USDC) {
		return {
			deposited: 0,
			signature: null,
			reason:
				balance === 0n
					? "There is no USDC in the margin wallet to deposit."
					: `Only ${decimal} USDC is in the margin wallet, below Pacifica's ${MINIMUM_DEPOSIT_USDC} USDC deposit minimum. It stays there until more is bridged across.`,
		};
	}

	// Checked before building rather than discovered at send, because a fee payer
	// that cannot pay fails with the USDC already on Solana — the one place it is
	// most awkward to recover from.
	const costs = await readSolanaCosts(rpc);
	const createsTokenAccount = (await rpc.getAccountInfo(tokenAccount)) === null;
	const required = lamportsRequired(costs, createsTokenAccount);
	const held = BigInt(await rpc.getBalance(feePayer.publicKey));

	if (held < required) {
		throw new PerpUnavailableError(
			`The Solana fee payer ${feePayer.publicKey.toBase58()} holds ${Number(held) / 1e9} SOL and this deposit needs ${Number(required) / 1e9}. Your USDC is safe at ${params.wallet.solanaAddress}; the deposit will go through once the fee payer is topped up.`,
		);
	}

	const signature = await sendSolana({
		path: params.wallet.path,
		signer: params.wallet.solanaAddress,
		feePayer,
		rpc,
		instructions: [
			createUsdcAccountIfMissing({ payer: feePayer.publicKey, owner }),
			buildDepositInstruction({ depositor: owner, amount: decimal }),
		],
	});

	return { deposited: decimal, signature };
}

/**
 * Open or add to the short leg.
 *
 * A market order rather than a limit, and that is a deliberate choice about
 * which risk to take. A limit order can sit unfilled, and an unfilled hedge
 * against a spot leg the user has *already bought* is precisely the unhedged
 * state this whole flow is arranged to minimise. Paying the spread is the
 * cheaper mistake.
 */
export async function openShort(params: {
	wallet: UserWalletSummary;
	/** Pacifica's wire symbol, e.g. "NVDA". */
	symbol: string;
	/** Size in units of the underlying, as a decimal string. */
	amount: string;
	slippagePercent: number;
}): Promise<{ orderId: string | number | null }> {
	const mpc = requireMpc();

	const receipt = await clients.pacifica.createMarketOrder(
		mpc.solanaMessageSigner(params.wallet.path),
		{
			account: params.wallet.solanaAddress,
			symbol: params.symbol,
			side: "ask",
			amount: params.amount,
			slippagePercent: String(params.slippagePercent),
		},
	);

	return { orderId: receipt.order_id ?? null };
}

/**
 * Close some or all of the short leg.
 *
 * `reduceOnly` is not optional and not a detail. Without it, an amount larger
 * than the open position flips the short into a long — turning a close into an
 * unhedged bet in the opposite direction, from a button labelled "close".
 */
export async function closeShort(params: {
	wallet: UserWalletSummary;
	symbol: string;
	amount: string;
	slippagePercent: number;
}): Promise<{ orderId: string | number | null }> {
	const mpc = requireMpc();

	const receipt = await clients.pacifica.createMarketOrder(
		mpc.solanaMessageSigner(params.wallet.path),
		{
			account: params.wallet.solanaAddress,
			symbol: params.symbol,
			// Buying back the short.
			side: "bid",
			amount: params.amount,
			slippagePercent: String(params.slippagePercent),
			reduceOnly: true,
		},
	);

	return { orderId: receipt.order_id ?? null };
}

/** Set the leverage Pacifica applies to one market on this account. */
export async function setLeverage(params: {
	wallet: UserWalletSummary;
	symbol: string;
	leverage: number;
}): Promise<void> {
	const mpc = requireMpc();
	await clients.pacifica.updateLeverage(mpc.solanaMessageSigner(params.wallet.path), {
		account: params.wallet.solanaAddress,
		symbol: params.symbol,
		leverage: params.leverage,
	});
}

/**
 * Ask Pacifica to send margin back to the derived Solana wallet.
 *
 * Returns once the venue has accepted the request, not once the USDC has
 * arrived — Pacifica credits withdrawals on its own schedule. Anything that
 * acts on the proceeds has to wait for the balance rather than for this call.
 */
export async function withdrawMargin(params: {
	wallet: UserWalletSummary;
	/** Decimal USDC. */
	amount: number;
}): Promise<void> {
	const mpc = requireMpc();
	await clients.pacifica.requestWithdrawal(mpc.solanaMessageSigner(params.wallet.path), {
		account: params.wallet.solanaAddress,
		amount: String(params.amount),
	});
}

/** The open short in one market, or null when there is none. */
export async function readShort(params: {
	wallet: UserWalletSummary;
	symbol: string;
}): Promise<PacificaPosition | null> {
	try {
		const positions = await clients.pacifica.positions(params.wallet.solanaAddress);
		return (
			positions.find((position) => position.symbol.toUpperCase() === params.symbol.toUpperCase()) ??
			null
		);
	} catch (error) {
		// An account that has never been funded has no positions, which is a
		// perfectly good answer to "what is the short here".
		if (isAccountNotFound(error)) return null;
		throw error;
	}
}

/**
 * Build, sign and confirm one Solana transaction for a derived wallet.
 *
 * Two signatures, from two very different places. The derived wallet's comes
 * from the MPC network and covers the message; the fee payer's is an ordinary
 * local keypair. The order matters to the runtime, not to us — what matters
 * here is that the message is built once and both parties sign that exact
 * message, which is why the blockhash is fetched before either signature rather
 * than between them.
 */
async function sendSolana(params: {
	path: string;
	signer: string;
	feePayer: Keypair;
	rpc: Connection;
	instructions: TransactionInstruction[];
}): Promise<string> {
	const mpc = requireMpc();
	const { blockhash, lastValidBlockHeight } = await params.rpc.getLatestBlockhash("confirmed");

	const transaction = new Transaction();
	transaction.recentBlockhash = blockhash;
	transaction.feePayer = params.feePayer.publicKey;
	transaction.add(...params.instructions);

	// The fee payer signs locally; the derived wallet's signature is a round trip
	// to NEAR, so it is requested against the already-final message bytes.
	transaction.partialSign(params.feePayer);

	const message = transaction.serializeMessage();
	const signature = await mpc.signEd25519(params.path, message);
	transaction.addSignature(new PublicKey(params.signer), Buffer.from(signature));

	const raw = transaction.serialize();
	const sent = await params.rpc.sendRawTransaction(raw, { skipPreflight: false });

	// Confirmed rather than fired and forgotten: everything downstream of a
	// deposit reads a balance, and reading it before the transaction lands is how
	// a caller concludes the money never arrived.
	const result = await params.rpc.confirmTransaction(
		{ signature: sent, blockhash, lastValidBlockHeight },
		"confirmed",
	);
	if (result.value.err) {
		throw new PerpUnavailableError(
			`Solana rejected the transaction: ${JSON.stringify(result.value.err)}`,
		);
	}

	return sent;
}
