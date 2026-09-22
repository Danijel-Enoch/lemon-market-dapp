import { formatDuration, type LogLevel } from "@lemon/core";
import { AGENT_CHAIN } from "./chain";

/**
 * The chain this agent custodies on, and the USDC it holds there.
 *
 * Read from `AGENT_CHAIN` rather than pinned to Base. One process serves one
 * chain (see `chain.ts`), so these are constants for the life of the process —
 * but they are *this* chain's constants, and a hard-coded Base pair would have
 * an Arbitrum agent quote a bridge from an address that holds nothing and read
 * a balance of zero from a token that is not its asset.
 *
 * Whether Relay actually routes between a given chain and Solana is a question
 * about Relay, not about this code. An unsupported pair comes back as a quote
 * with no steps, which `RelayClient.quote` already turns into an error saying
 * the route may be unsupported — a loud failure on the first crossing rather
 * than a silent one.
 */
const HOME_CHAIN_ID = AGENT_CHAIN.id;
const HOME_USDC = AGENT_CHAIN.usdc;

import { prisma } from "@lemon/db";
import {
	buildDepositInstruction,
	createUsdcAccountIfMissing,
	MINIMUM_DEPOSIT_USDC,
} from "@lemon/pacifica/deposit";
import {
	type EvmTransactionData,
	isSvmTransaction,
	type RelayClient,
	type RelayQuote,
	SOLANA_CHAIN_ID,
	SOLANA_USDC_MINT,
	type SvmTransactionData,
} from "@lemon/relay";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { erc20Abi } from "viem";
import type { SolanaExecutor } from "./solana";
import type { BridgeAdapter } from "./venue";

/**
 * USDC between Base and Solana, over Relay.
 *
 * The vault's two legs live on different chains, so every deployment and every
 * unwind crosses one. This is that crossing, and it is the only part of a tick
 * that outlives the tick: a Relay fill takes minutes, during which the money
 * has left one balance and not arrived in the other.
 *
 * **The ordinary Relay flow, not a deposit address.** A quote comes back as
 * transactions to sign — an approval and a deposit on Base, one instruction set
 * on Solana — and the agent's own wallets broadcast them. The deposit-address
 * alternative is a single transfer to an address Relay names, which is simpler
 * to execute and gated behind an API-key permission that a key does not
 * necessarily carry: a key without it gets a quote with no address in it, and
 * the crossing fails at the point where the vault's margin has already been
 * drawn. Signing the steps needs no permission, so it is the path that works.
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
	log: (level: LogLevel, message: string, extra?: unknown) => void;
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
			`${Number(inFlight) / 1e6} USDC was in flight when this process started; counting it in NAV until it lands.`,
		);
	}

	async function homeUsdcBalance(): Promise<bigint> {
		return deps.publicClient.readContract({
			abi: erc20Abi,
			address: HOME_USDC,
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
		const startedAt = Date.now();
		let polls = 0;

		for (;;) {
			const status = await deps.relay.getStatus(requestId).catch(() => null);
			polls += 1;

			if (status?.isComplete) {
				deps.log(
					"info",
					`Relay ${requestId} filled after ${formatDuration(Date.now() - startedAt)}.`,
				);
				return;
			}

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

			// A heartbeat every minute rather than every poll. A crossing routinely
			// takes several, and the question being answered — "is this moving or has
			// it wedged?" — needs a line often enough to be visible and rarely enough
			// that it does not bury the rest of the tick.
			const waited = formatDuration(Date.now() - startedAt);
			const state = status?.status ?? "unknown";
			if (polls % 6 === 0) {
				deps.log("info", `Still waiting on Relay ${requestId} after ${waited} (${state}).`);
			} else {
				deps.log("debug", `Relay ${requestId} is ${state} after ${waited}.`);
			}

			await sleep(POLL_INTERVAL_MS);
		}
	}

	/**
	 * Sign and broadcast an EVM quote's steps in order, returning the last hash.
	 *
	 * A quote is one or two transactions: an ERC-20 approval when the router does
	 * not already have an allowance, then the deposit that commits the money.
	 * Relay omits the approval once it is no longer needed, so the count varies
	 * between crossings and this is written for that rather than for two steps.
	 *
	 * Relay's own gas figures are deliberately dropped and left to the wallet to
	 * estimate. They are quoted seconds before the send, and a stale fee cap on
	 * Base is a transaction that sits unmined with margin already committed to it.
	 *
	 * Only the last hash is returned, because only the last step moved anything.
	 */
	async function sendEvmSteps(quote: RelayQuote): Promise<Hex> {
		let last: Hex | null = null;

		for (const step of quote.steps) {
			for (const item of step.items ?? []) {
				if (isSvmTransaction(item.data)) {
					throw new Error(
						`Relay returned Solana instructions for step "${step.id}" of a Base-origin quote, which the agent's Base wallet cannot sign.`,
					);
				}

				const hash = await deps.walletClient.sendTransaction({
					// biome-ignore lint/suspicious/noExplicitAny: account is set by the caller.
					account: deps.walletClient.account as any,
					chain: null,
					to: item.data.to as Address,
					data: item.data.data as Hex,
					value: BigInt(item.data.value || "0"),
				});

				const receipt = await deps.publicClient.waitForTransactionReceipt({ hash });
				// Checked rather than assumed. A reverted approval makes the deposit
				// fail for a reason that has nothing to do with the deposit, and a
				// reverted deposit must never be waited on as though it were in the
				// air — in that case the money never left.
				if (receipt.status !== "success") {
					throw new Error(`Relay step "${step.id}" reverted on Base (${hash}).`);
				}

				deps.log("debug", `Relay step "${step.id}" landed (${hash}).`);
				last = hash;
			}
		}

		if (!last) throw new Error("Relay returned a quote with no transaction to send.");
		return last;
	}

	/**
	 * Execute the Solana half of a quote with the agent's MPC wallet.
	 *
	 * One transaction rather than a loop: Relay returns a Solana route as a single
	 * set of instructions, because there is no approval to make first — an SPL
	 * transfer is authorised by the signature itself.
	 */
	async function sendSvmStep(quote: RelayQuote): Promise<string> {
		const data = quote.steps
			.flatMap((step) => step.items ?? [])
			.map((item) => item.data)
			.find(isSvmTransaction);

		if (!data) {
			throw new Error(
				"Relay returned no Solana instructions for a Solana-origin quote, so there is nothing the agent's Solana wallet can sign.",
			);
		}

		return deps.solana.send({
			path: deps.path,
			signer: deps.solanaAddress,
			instructions: toInstructions(data),
			addressLookupTableAddresses: data.addressLookupTableAddresses,
		});
	}

	return {
		inFlight: () => inFlight,

		/**
		 * Margin out: the home chain's USDC to a funded Pacifica account.
		 *
		 * The Pacifica deposit is part of this call rather than the caller's next
		 * step, and that is not tidiness. USDC sitting in the agent's Solana wallet
		 * is not margin — it backs no position and the venue will not let an order
		 * be placed against it — so a bridge that stopped at the wallet would
		 * report margin that does not exist and have the caller open a short
		 * against it.
		 */
		async toSolana(amountUsdc: bigint) {
			// Before the quote, because this is the last moment the money is still
			// in one place. The deposit at the far end of this function is signed by
			// the fee payer, and if it cannot pay, the failure lands with the USDC
			// already bridged onto Solana and out of the vault.
			const gas = await deps.solana.checkFeePayer(deps.solanaAddress);
			if (gas.shortfall) throw new Error(gas.shortfall);
			if (gas.createsTokenAccount) {
				deps.log(
					"info",
					`This crossing also creates the agent's USDC account on Solana; the fee payer covers its rent once, and holds enough (${Number(gas.lamports) / 1e9} SOL against ${Number(gas.required) / 1e9} needed).`,
				);
			}

			deps.log(
				"info",
				`Bridging ${Number(amountUsdc) / 1e6} USDC ${AGENT_CHAIN.name} → Solana; this blocks the tick until it lands (up to ${formatDuration(FILL_TIMEOUT_MS)}).`,
			);

			const quote = await deps.relay.quote({
				recipient: deps.solanaAddress,
				sender: deps.agentAddress,
				originChainId: HOME_CHAIN_ID,
				originCurrency: HOME_USDC,
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
				depositAddress: counterparty(quote),
				amountUsdc,
			});
			inFlight += amountUsdc;
			// Where the money is, so a failure knows whether it is still in the air.
			// Only a crossing that has left the origin chain and not arrived stays
			// counted; anything else sits in a balance the valuation already reads.
			let stage: "quoted" | "sent" | "landed" = "quoted";

			try {
				const before = await deps.solana.usdcBalance(deps.solanaAddress);

				const sendTx = await sendEvmSteps(quote);
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
					`Bridged ${Number(amountUsdc) / 1e6} USDC to Solana and credited ${decimal} to Pacifica (${depositTx}).`,
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
			// Cheaper than the outbound leg — the token account exists by now, so
			// this is the fee and the floor and nothing else — but still checked,
			// because an unwind that cannot send is an unwind whose perp leg is
			// already closed and whose margin is stranded on the wrong chain.
			const gas = await deps.solana.checkFeePayer(deps.solanaAddress);
			if (gas.shortfall) throw new Error(gas.shortfall);

			deps.log(
				"info",
				`Waiting for ${Number(amountUsdc) / 1e6} USDC to settle out of Pacifica onto Solana (up to ${formatDuration(WITHDRAWAL_TIMEOUT_MS)}).`,
			);
			await deps.solana.waitForUsdc(deps.solanaAddress, amountUsdc, WITHDRAWAL_TIMEOUT_MS);
			deps.log("info", `It landed; bridging Solana → ${AGENT_CHAIN.name}.`);

			const quote = await deps.relay.quote({
				recipient: deps.agentAddress,
				sender: deps.solanaAddress,
				originChainId: SOLANA_CHAIN_ID,
				originCurrency: SOLANA_USDC_MINT,
				amount: amountUsdc.toString(),
				destinationChainId: HOME_CHAIN_ID,
				destinationCurrency: HOME_USDC,
				refundTo: deps.solanaAddress,
			});

			const row = await record({
				vaultAddress,
				direction: "TO_BASE",
				requestId: quote.requestId,
				depositAddress: counterparty(quote),
				amountUsdc,
			});
			inFlight += amountUsdc;
			let stage: "quoted" | "sent" | "landed" = "quoted";

			try {
				const before = await homeUsdcBalance();

				// No token account to create any more. The old flow sent USDC to a
				// fresh deposit address that had never held any, and had to pay the
				// rent on its account first; Relay's own instructions address accounts
				// that already exist.
				const signature = await sendSvmStep(quote);
				const sendTx = refToHex(signature);
				await markSent(row.id, sendTx);
				stage = "sent";

				await awaitFill(quote.requestId, row.id);

				const after = await waitForHomeUsdc(homeUsdcBalance, before + 1n, 120_000);
				const landed = after - before;
				stage = "landed";

				await settle(row.id, "COMPLETE", landed);
				inFlight -= amountUsdc;
				deps.log(
					"info",
					`Brought ${Number(landed) / 1e6} of ${Number(amountUsdc) / 1e6} USDC home from Solana (${signature}).`,
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
 * Relay's instruction shape into the SDK's.
 *
 * The instruction data is hex and is decoded rather than passed through: a
 * string where bytes are expected builds cleanly and means something entirely
 * different on chain. Malformed hex is rejected here rather than by
 * `Buffer.from`, which truncates silently at the first bad character and would
 * hand the runtime a valid-looking instruction with its arguments cut off.
 */
function toInstructions(data: SvmTransactionData): TransactionInstruction[] {
	return data.instructions.map((instruction) => {
		const hex = instruction.data.replace(/^0x/, "");
		if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
			throw new Error(
				`Relay returned instruction data for ${instruction.programId} that is not hex, so the transaction cannot be built.`,
			);
		}

		return new TransactionInstruction({
			programId: new PublicKey(instruction.programId),
			keys: instruction.keys.map((key) => ({
				pubkey: new PublicKey(key.pubkey),
				isSigner: key.isSigner,
				isWritable: key.isWritable,
			})),
			data: Buffer.from(hex, "hex"),
		});
	});
}

/**
 * What the crossing was committed through, for the transfer record.
 *
 * The column this fills was named for the deposit address the bridge used to
 * send to, and there is no such address in the ordinary flow. It now holds the
 * contract or program the origin transaction went to, which is what the field
 * was for in practice: somewhere to start when a transfer has to be traced by
 * hand.
 */
function counterparty(quote: RelayQuote): string {
	const payloads = quote.steps.flatMap((step) => step.items ?? []).map((item) => item.data);

	const svm = payloads.find(isSvmTransaction);
	if (svm) return svm.instructions[0]?.programId ?? "unknown";

	const evm = payloads.filter((data): data is EvmTransactionData => !isSvmTransaction(data));
	return evm.at(-1)?.to ?? "unknown";
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
async function waitForHomeUsdc(
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
