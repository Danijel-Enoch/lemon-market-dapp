import { BASE_CHAIN_ID, USDC_ADDRESS } from "@lemon/core";
import { prisma } from "@lemon/db";
import {
	buildDepositInstruction,
	createUsdcAccountIfMissing,
	MINIMUM_DEPOSIT_USDC,
} from "@lemon/pacifica/deposit";
import { type RelayClient, SOLANA_CHAIN_ID, SOLANA_USDC_MINT } from "@lemon/relay";
import { PublicKey } from "@solana/web3.js";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { erc20Abi } from "viem";
import { createUsdcAccount, type SolanaExecutor, usdcTransfer } from "./solana";
import type { BridgeAdapter } from "./venue";

/**
 * USDC between Base and Solana, over Relay.
 *
 * The vault's two legs live on different chains, so every deployment and every
 * unwind crosses one. This is that crossing, and it is the only part of a tick
 * that outlives the tick: a Relay fill takes minutes, during which the money
 * has left one balance and not arrived in the other.
 *
 * Three properties the rest of the agent depends on:
 *
 * **It returns what landed, not what was sent.** The relayer takes a cut, and
 * nobody knows how much until the fill. `deploy` sizes the hedge off the return
 * value for exactly this reason — treating the sent amount as the arrived
 * amount over-levers the vault by the fee, multiplied by its leverage.
 *
 * **It waits.** Both methods return only once the destination balance has
 * actually moved. The caller opens a leveraged short against the margin this
 * reports, so "submitted" is not an answer it can use.
 *
 * **It records.** Every crossing is a `BridgeTransfer` row before the origin
 * transaction is sent and after the destination balance moves, so a process
 * that dies mid-flight leaves the in-flight amount in the database rather than
 * only in memory — which is what stops a restart from reporting a NAV missing
 * the whole transfer.
 */

/** How long to wait for Relay to fill before giving up on a crossing. */
const FILL_TIMEOUT_MS = Number(process.env.BRIDGE_FILL_TIMEOUT_MS ?? 20 * 60_000);

/**
 * How long to wait for a Pacifica withdrawal to reach the agent's Solana wallet.
 *
 * Separate from the fill timeout because it is somebody else's queue rather
 * than a relayer's: Pacifica settles withdrawals on its own schedule, and the
 * request has already been accepted by the time this waits.
 */
const WITHDRAWAL_TIMEOUT_MS = Number(process.env.VENUE_WITHDRAWAL_TIMEOUT_MS ?? 15 * 60_000);

const POLL_INTERVAL_MS = 10_000;

export interface RelayBridgeDeps {
	/** The vault this capital belongs to, lowercased. Rows are keyed by it. */
	vaultAddress: string;
	relay: RelayClient;
	solana: SolanaExecutor;
	publicClient: PublicClient;
	walletClient: WalletClient;
	/** The agent's Base address — origin of the outbound leg, recipient of the inbound one. */
	agentAddress: Address;
	/** The agent's Solana address, which is also its Pacifica account id. */
	solanaAddress: string;
	/** The derivation path both addresses come from, so Solana transactions can be signed. */
	path: string;
	log: (level: "info" | "warn" | "error", message: string, extra?: unknown) => void;
}

export interface RelayBridge extends BridgeAdapter {
	/**
	 * USDC currently between chains, in base units.
	 *
	 * Synchronous because the valuation reads it inside a NAV calculation that
	 * has no business awaiting a database. Seeded from the persisted rows by
	 * `createRelayBridge`, which is why that function is async.
	 */
	inFlight(): bigint;
}

/**
 * Build the bridge, seeded with whatever was already in the air.
 *
 * The seed is the point of the `await`. An agent restarted mid-crossing has
 * USDC that belongs to the vault and sits in neither chain's balance; reading
 * the unfinished rows back is what keeps the next NAV report from showing that
 * money as a loss and then, minutes later, as a gain.
 */
export async function createRelayBridge(deps: RelayBridgeDeps): Promise<RelayBridge> {
	const vaultAddress = deps.vaultAddress.toLowerCase();
	let inFlight = await pendingTotal(vaultAddress);

	if (inFlight > 0n) {
		deps.log(
			"info",
			`${vaultAddress}: ${Number(inFlight) / 1e6} USDC was in flight when this process started; counting it in NAV until it lands.`,
		);
	}

	async function baseUsdcBalance(): Promise<bigint> {
		return deps.publicClient.readContract({
			abi: erc20Abi,
			address: USDC_ADDRESS,
			functionName: "balanceOf",
			args: [deps.agentAddress],
		});
	}

	/**
	 * Block until Relay reports the intent filled, refunded, or out of time.
	 *
	 * A refund is a settled outcome: the money is back on the origin chain, in a
	 * balance the valuation reads, so the row is closed and the caller stops
	 * counting it. A timeout is not settled — the USDC has left the origin chain
	 * and Relay has not said where it is, so the row stays `SENT` and the
	 * crossing stays counted as in flight, with a request id to chase it by.
	 */
	async function awaitFill(requestId: string, rowId: string): Promise<void> {
		const deadline = Date.now() + FILL_TIMEOUT_MS;
		for (;;) {
			const status = await deps.relay.getStatus(requestId).catch(() => null);
			if (status?.isComplete) return;
			if (status?.isFailed) {
				await settle(rowId, "FAILED", null);
				throw new BridgeRefunded(
					`Relay request ${requestId} ${status.status}: the transfer did not fill and the funds are being returned to the origin chain.`,
				);
			}
			if (Date.now() >= deadline) {
				throw new Error(
					`Relay request ${requestId} has not filled after ${Math.round(FILL_TIMEOUT_MS / 60_000)} minutes. The transfer is recorded as still in flight; check it at https://relay.link and do not re-send.`,
				);
			}
			await sleep(POLL_INTERVAL_MS);
		}
	}

	return {
		inFlight: () => inFlight,

		/**
		 * Margin out: Base USDC to a funded Pacifica account.
		 *
		 * The Pacifica deposit is part of this call rather than the caller's next
		 * step, and that is not tidiness. USDC sitting in the agent's Solana wallet
		 * is not margin — it backs no position and the venue will not let an order
		 * be placed against it — so a bridge that stopped at the wallet would
		 * report margin that does not exist and have the caller open a short
		 * against it.
		 */
		async toSolana(amountUsdc: bigint) {
			const quote = await deps.relay.createDepositAddress({
				recipient: deps.solanaAddress,
				sender: deps.agentAddress,
				originChainId: BASE_CHAIN_ID,
				originCurrency: USDC_ADDRESS,
				amount: amountUsdc.toString(),
				destinationChainId: SOLANA_CHAIN_ID,
				destinationCurrency: SOLANA_USDC_MINT,
				// Base, not Solana: a refund goes back to whoever sent, on the chain
				// they sent from. Naming the Solana address here would ask Relay to
				// refund to an address that does not exist on the origin chain.
				refundTo: deps.agentAddress,
			});

			const row = await record({
				vaultAddress,
				direction: "TO_SOLANA",
				requestId: quote.requestId,
				depositAddress: String(quote.depositAddress),
				amountUsdc,
			});
			inFlight += amountUsdc;
			// Where the money is, so a failure knows whether it is still in the air.
			// Only a crossing that has left the origin chain and not arrived stays
			// counted; anything else sits in a balance the valuation already reads.
			let stage: "quoted" | "sent" | "landed" = "quoted";

			try {
				const before = await deps.solana.usdcBalance(deps.solanaAddress);

				const sendTx = await deps.walletClient.writeContract({
					// biome-ignore lint/suspicious/noExplicitAny: account is set by the caller.
					account: deps.walletClient.account as any,
					chain: null,
					abi: erc20Abi,
					address: USDC_ADDRESS,
					functionName: "transfer",
					args: [quote.depositAddress as Address, amountUsdc],
				});
				await deps.publicClient.waitForTransactionReceipt({ hash: sendTx });
				await markSent(row.id, sendTx);
				stage = "sent";

				await awaitFill(quote.requestId, row.id);

				// Relay says filled; the token account says how much. The balance is
				// the number the hedge gets sized from, so it is read rather than
				// taken from the quote's estimate.
				const after = await deps.solana.waitForUsdc(deps.solanaAddress, before + 1n, 120_000);
				const landed = after - before;

				// Closed here, before the deposit, because this is the moment the
				// money stops being in the air: it is in the agent's Solana wallet,
				// which the valuation reads. If the deposit below fails the USDC is
				// still counted — as idle on Solana rather than as margin — which is
				// exactly what it is.
				stage = "landed";
				await settle(row.id, "COMPLETE", landed);
				inFlight -= amountUsdc;

				const decimal = Number(landed) / 1e6;
				if (decimal < MINIMUM_DEPOSIT_USDC) {
					throw new Error(
						`Only ${decimal} USDC survived the bridge, below Pacifica's ${MINIMUM_DEPOSIT_USDC} USDC deposit minimum. It is sitting in the agent's Solana wallet at ${deps.solanaAddress} and will be swept by the next crossing.`,
					);
				}

				const depositor = new PublicKey(deps.solanaAddress);
				const depositTx = await deps.solana.send({
					path: deps.path,
					signer: deps.solanaAddress,
					instructions: [
						createUsdcAccountIfMissing({
							payer: new PublicKey(deps.solana.feePayer),
							owner: depositor,
						}),
						buildDepositInstruction({ depositor, amount: decimal }),
					],
				});

				deps.log(
					"info",
					`${vaultAddress}: bridged ${Number(amountUsdc) / 1e6} USDC to Solana and credited ${decimal} to Pacifica (${depositTx}).`,
				);

				return { txRef: sendTx, landed };
			} catch (error) {
				// A crossing that threw while airborne stays counted: the USDC has
				// left Base, has not arrived on Solana, and is in no balance anything
				// can read. Everything else is somewhere visible again.
				if (stage === "sent" && !(error instanceof BridgeRefunded)) throw error;
				if (stage !== "landed") {
					inFlight -= amountUsdc;
					if (stage === "quoted") await settle(row.id, "FAILED", null);
				}
				throw error;
			}
		},

		/**
		 * Margin home: the agent's Solana wallet back to Base.
		 *
		 * Called immediately after a Pacifica withdrawal, which credits this wallet
		 * on the venue's schedule rather than the caller's — so the first thing
		 * this does is wait for the balance to be spendable. Building the transfer
		 * before then produces a transaction the runtime rejects, on an unwind
		 * whose legs are already closed.
		 */
		async toBase(amountUsdc: bigint) {
			await deps.solana.waitForUsdc(deps.solanaAddress, amountUsdc, WITHDRAWAL_TIMEOUT_MS);

			const quote = await deps.relay.createDepositAddress({
				recipient: deps.agentAddress,
				sender: deps.solanaAddress,
				originChainId: SOLANA_CHAIN_ID,
				originCurrency: SOLANA_USDC_MINT,
				amount: amountUsdc.toString(),
				destinationChainId: BASE_CHAIN_ID,
				destinationCurrency: USDC_ADDRESS,
				refundTo: deps.solanaAddress,
			});

			const depositAddress = String(quote.depositAddress);
			const row = await record({
				vaultAddress,
				direction: "TO_BASE",
				requestId: quote.requestId,
				depositAddress,
				amountUsdc,
			});
			inFlight += amountUsdc;
			let stage: "quoted" | "sent" | "landed" = "quoted";

			try {
				const before = await baseUsdcBalance();

				// The deposit address may never have held USDC. Creating its token
				// account is idempotent and costs one fee payer's rent, where getting
				// it wrong sends into an account that does not exist.
				const signature = await deps.solana.send({
					path: deps.path,
					signer: deps.solanaAddress,
					instructions: [
						createUsdcAccount({ payer: deps.solana.feePayer, owner: depositAddress }),
						usdcTransfer({
							owner: deps.solanaAddress,
							to: depositAddress,
							amount: amountUsdc,
						}),
					],
				});
				const sendTx = refToHex(signature);
				await markSent(row.id, sendTx);
				stage = "sent";

				await awaitFill(quote.requestId, row.id);

				const after = await waitForBaseUsdc(baseUsdcBalance, before + 1n, 120_000);
				const landed = after - before;
				stage = "landed";

				await settle(row.id, "COMPLETE", landed);
				inFlight -= amountUsdc;
				deps.log(
					"info",
					`${vaultAddress}: brought ${Number(landed) / 1e6} of ${Number(amountUsdc) / 1e6} USDC home from Solana (${signature}).`,
				);

				return { txRef: sendTx, landed };
			} catch (error) {
				if (stage === "sent" && !(error instanceof BridgeRefunded)) throw error;
				if (stage !== "landed") {
					inFlight -= amountUsdc;
					if (stage === "quoted") await settle(row.id, "FAILED", null);
				}
				throw error;
			}
		},
	};
}

/**
 * Relay returned the funds to the origin chain.
 *
 * Distinguished from every other bridge failure because it is the one where the
 * money has a known location again: a refunded crossing stops being in flight,
 * where a crossing that merely timed out does not.
 */
class BridgeRefunded extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BridgeRefunded";
	}
}

/** Total of every crossing this vault has started and not finished. */
async function pendingTotal(vaultAddress: string): Promise<bigint> {
	const rows = await prisma.bridgeTransfer
		.findMany({
			where: { vaultAddress, status: { in: ["PENDING", "SENT"] } },
			select: { amountUsdc: true },
		})
		.catch(() => []);
	return rows.reduce((sum, row) => sum + BigInt(row.amountUsdc), 0n);
}

async function record(params: {
	vaultAddress: string;
	direction: string;
	requestId: string;
	depositAddress: string;
	amountUsdc: bigint;
}) {
	return prisma.bridgeTransfer.create({
		data: {
			vaultAddress: params.vaultAddress,
			direction: params.direction,
			requestId: params.requestId,
			depositAddress: params.depositAddress,
			amountUsdc: params.amountUsdc.toString(),
			status: "PENDING",
		},
	});
}

async function markSent(id: string, txRef: string): Promise<void> {
	await prisma.bridgeTransfer
		.update({ where: { id }, data: { status: "SENT", sendTxRef: txRef } })
		.catch(() => null);
}

async function settle(id: string, status: string, landed: bigint | null): Promise<void> {
	await prisma.bridgeTransfer
		.update({
			where: { id },
			data: { status, landedUsdc: landed === null ? null : landed.toString() },
		})
		.catch(() => null);
}

/** The Base-side equivalent of `SolanaExecutor.waitForUsdc`. */
async function waitForBaseUsdc(
	read: () => Promise<bigint>,
	target: bigint,
	timeoutMs: number,
): Promise<bigint> {
	const deadline = Date.now() + timeoutMs;
	let seen = await read();
	while (seen < target && Date.now() < deadline) {
		await sleep(5_000);
		seen = await read();
	}
	if (seen < target) {
		throw new Error(
			`Relay reported the transfer filled, but the agent's Base USDC balance has not moved after ${Math.round(timeoutMs / 1000)}s.`,
		);
	}
	return seen;
}

/**
 * Pack a Solana signature into hex for the on-chain activity feed.
 *
 * The feed's `txRef` is bytes, and a Solana signature is base58 text. It is
 * preserved verbatim rather than hashed, because the point of the reference is
 * that someone can paste it into an explorer.
 */
function refToHex(reference: string): Hex {
	const bytes = new TextEncoder().encode(reference);
	return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
