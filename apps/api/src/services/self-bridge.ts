import { requireChainInfo, usdcFor } from "@lemon/core";
import { prisma } from "@lemon/db";
import {
	isSvmTransaction,
	type RelayQuote,
	SOLANA_CHAIN_ID,
	SOLANA_USDC_MINT,
	type SvmTransactionData,
} from "@lemon/relay";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { clients } from "../config";
import type { UserWalletSummary } from "./user-wallet";

/**
 * Moving a user's USDC between the three chains this app touches.
 *
 * The asymmetry here is the whole design, and it comes straight from the
 * custody split. On the **EVM side** the money is in the user's own wallet, so
 * this server can quote a bridge and hand back the transactions but cannot send
 * them — the browser signs. On the **Solana side** the money sits at a derived
 * address, so the server signs and the browser is not involved at all.
 *
 * One route, two completely different shapes. Pretending otherwise — a single
 * "bridge" function that sometimes returns transactions and sometimes just does
 * it — would hide from every caller the one thing they need to know, which is
 * whether a human still has to approve something.
 *
 * ## Why the destination is never the user's own Solana address by accident
 *
 * A bridge to Solana lands at the **derived** address, because that address is
 * the Pacifica account. Sending to anything else produces USDC on Solana that
 * is not margin and cannot become margin without a second transfer the user
 * cannot sign. The recipient is therefore taken from the session's wallet
 * record and never from a request body.
 */

export class BridgeUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BridgeUnavailableError";
	}
}

/** An unsigned EVM transaction for the browser to send. */
export interface UnsignedEvmStep {
	/** What this step is for, in the words the wallet prompt should be read next to. */
	label: string;
	to: string;
	data: string;
	/** Wei of native token. "0" for an ERC-20 bridge. */
	value: string;
	chainId: number;
}

export interface BridgeQuote {
	requestId: string;
	/** Base units of USDC leaving the origin. */
	amount: string;
	originChainId: number;
	destinationChainId: number;
	/** What Relay expects to deliver, formatted. Not a guarantee. */
	destinationAmountFormatted: string;
	/** Where the funds land. The derived address for an inbound bridge. */
	recipient: string;
	/** The transactions the user's wallet must send, in order. */
	steps: UnsignedEvmStep[];
}

/**
 * Quote a bridge *into* the margin wallet, from a chain the user holds USDC on.
 *
 * Returns transactions rather than sending them. The `sender` is the user's own
 * EVM address, which makes it the `from` of every step and therefore the signer
 * the steps require — getting this wrong produces a quote whose transactions
 * only the wrong wallet can send, and the failure shows up as an inscrutable
 * revert rather than as a bad parameter.
 *
 * `refundTo` is the user's address **on the origin chain**, never the Solana
 * one. A refund goes back to whoever sent, on the chain they sent from, and
 * naming a Solana address would ask Relay to refund to an address that does not
 * exist where the money is.
 */
export async function quoteBridgeToMargin(params: {
	wallet: UserWalletSummary;
	/** The user's connected EVM address, which holds the USDC. */
	owner: string;
	originChainId: number;
	/** Base units of USDC. */
	amount: string;
}): Promise<BridgeQuote> {
	const chain = requireChainInfo(params.originChainId);

	const quote = await clients.relay.quote({
		recipient: params.wallet.solanaAddress,
		sender: params.owner,
		originChainId: chain.id,
		originCurrency: usdcFor(chain.id),
		amount: params.amount,
		destinationChainId: SOLANA_CHAIN_ID,
		destinationCurrency: SOLANA_USDC_MINT,
		refundTo: params.owner,
	});

	return toBridgeQuote({
		quote,
		chainId: chain.id,
		destinationChainId: SOLANA_CHAIN_ID,
		recipient: params.wallet.solanaAddress,
	});
}

/**
 * Quote a bridge between two EVM chains — Base to X Layer and back.
 *
 * Both ends are the user's own wallet, so this is the one route with no derived
 * address in it at all. It exists because the spot leg is chain-specific: a user
 * holding USDC on Base cannot buy an X Layer market with it, and the alternative
 * to bridging here is bridging somewhere else and coming back.
 */
export async function quoteBridgeBetweenChains(params: {
	owner: string;
	originChainId: number;
	destinationChainId: number;
	amount: string;
}): Promise<BridgeQuote> {
	const origin = requireChainInfo(params.originChainId);
	const destination = requireChainInfo(params.destinationChainId);

	if (origin.id === destination.id) {
		throw new BridgeUnavailableError(
			`Origin and destination are both ${origin.name}, so there is nothing to bridge.`,
		);
	}

	const quote = await clients.relay.quote({
		recipient: params.owner,
		sender: params.owner,
		originChainId: origin.id,
		originCurrency: usdcFor(origin.id),
		amount: params.amount,
		destinationChainId: destination.id,
		destinationCurrency: usdcFor(destination.id),
		refundTo: params.owner,
	});

	return toBridgeQuote({
		quote,
		chainId: origin.id,
		destinationChainId: destination.id,
		recipient: params.owner,
	});
}

/**
 * Pull Relay's steps apart into transactions a browser can send.
 *
 * Only EVM steps survive, and a quote containing an SVM step here is a bug
 * rather than something to handle: the browser signs for an EVM wallet and has
 * no Solana key. Raising is better than silently dropping a step, which would
 * hand back a sequence that looks complete and bridges nothing.
 */
function toBridgeQuote(params: {
	quote: RelayQuote;
	chainId: number;
	destinationChainId: number;
	recipient: string;
}): BridgeQuote {
	const steps: UnsignedEvmStep[] = [];

	for (const step of params.quote.steps) {
		for (const item of step.items ?? []) {
			const data = item.data;
			if (!data) continue;

			if (isSvmTransaction(data)) {
				throw new BridgeUnavailableError(
					"Relay returned a Solana transaction for a bridge the user's own wallet has to send. This route is not one the browser can sign.",
				);
			}

			steps.push({
				// Relay names its own steps, and its names ("approve", "deposit")
				// are exactly what should sit beside a wallet prompt.
				label: step.id || step.kind || "Bridge",
				to: data.to,
				data: data.data,
				value: data.value ?? "0",
				chainId: data.chainId ?? params.chainId,
			});
		}
	}

	if (steps.length === 0) {
		throw new BridgeUnavailableError(
			"Relay quoted this route with no transactions to send, so there is nothing to execute.",
		);
	}

	return {
		requestId: params.quote.requestId,
		amount: params.quote.amount,
		originChainId: params.chainId,
		destinationChainId: params.destinationChainId,
		destinationAmountFormatted: params.quote.destinationAmountFormatted,
		recipient: params.recipient,
		steps,
	};
}

/**
 * Record a bridge the user has now sent, so it can be followed.
 *
 * Written only once the browser reports a hash, which means a quote the user
 * abandoned leaves no row. That is deliberate: a table of quotes nobody
 * executed would make "how many bridges are in flight" unanswerable, and that
 * question is the one the margin wallet's state depends on.
 */
export async function recordBridge(params: {
	userId: string;
	requestId: string;
	direction: "TO_SOLANA" | "TO_EVM" | "BETWEEN_EVM";
	originChainId: number;
	recipient: string;
	amount: string;
	txRef: string;
}) {
	return await prisma.bridgeTransfer.create({
		data: {
			// `BridgeTransfer` predates self-managed positions and keys on a vault
			// address. A user's bridge has no vault, so the derived-wallet owner
			// stands in — the column is an opaque owner key to everything that
			// reads it, and the alternative is a second near-identical table.
			vaultAddress: `user:${params.userId}`,
			chainId: params.originChainId,
			direction: params.direction,
			requestId: params.requestId,
			depositAddress: params.recipient,
			amountUsdc: params.amount,
			status: "PENDING",
			sendTxRef: params.txRef,
		},
	});
}

export interface BridgeProgress {
	requestId: string;
	/** Relay's own word: "pending", "success", "failure", "refund". */
	status: string;
	/** True once the funds are at the destination. */
	complete: boolean;
	/** True when the bridge failed and the money went back to the sender. */
	refunded: boolean;
	txRefs: string[];
}

/**
 * Where one bridge has got to.
 *
 * Read from Relay rather than from our own row, because our row records what we
 * were told and Relay knows what happened. The row is updated as a side effect
 * so a later page load does not have to ask again.
 */
export async function bridgeProgress(requestId: string): Promise<BridgeProgress> {
	const status = await clients.relay.getStatus(requestId);

	const complete = status.status === "success";
	const refunded = status.status === "refund";

	if (complete || refunded) {
		await prisma.bridgeTransfer
			.updateMany({
				where: { requestId },
				data: { status: complete ? "COMPLETE" : "REFUNDED" },
			})
			// A status read must not fail because the row is missing — the bridge
			// still happened, and the caller needs the answer more than the record.
			.catch(() => undefined);
	}

	return {
		requestId,
		status: status.status,
		complete,
		refunded,
		txRefs: [...(status.inTxHashes ?? []), ...(status.outTxHashes ?? [])],
	};
}

/** Every bridge this user has sent, newest first. */
export async function listBridges(userId: string) {
	const rows = await prisma.bridgeTransfer.findMany({
		where: { vaultAddress: `user:${userId}` },
		orderBy: { createdAt: "desc" },
		take: 25,
	});

	return rows.map((row) => ({
		requestId: row.requestId,
		direction: row.direction,
		chainId: row.chainId,
		amountUsdc: row.amountUsdc,
		landedUsdc: row.landedUsdc,
		status: row.status,
		txRef: row.sendTxRef,
		at: row.createdAt.toISOString(),
	}));
}

/**
 * Relay's Solana instructions, rebuilt as `@solana/web3.js` objects.
 *
 * Used only on the way *out* of Solana, where the server signs. Kept here
 * rather than in `self-perp.ts` because it is a fact about Relay's wire format
 * rather than about Pacifica.
 */
export function toSolanaInstructions(data: SvmTransactionData): TransactionInstruction[] {
	return (data.instructions ?? []).map((instruction) => {
		// Relay documents this field as hex "with or without a leading 0x", and
		// the two are not interchangeable to `Buffer.from`: the prefixed form
		// parses as far as the "0" and silently yields empty data, producing a
		// transaction that is structurally valid and does nothing.
		const hex = instruction.data.replace(/^0x/, "");
		if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
			throw new BridgeUnavailableError(
				`Relay returned instruction data for ${instruction.programId} that is not hex, so the transaction cannot be built.`,
			);
		}

		return new TransactionInstruction({
			programId: new PublicKey(instruction.programId),
			keys: (instruction.keys ?? []).map((key) => ({
				pubkey: new PublicKey(key.pubkey),
				isSigner: key.isSigner,
				isWritable: key.isWritable,
			})),
			data: Buffer.from(hex, "hex"),
		});
	});
}
