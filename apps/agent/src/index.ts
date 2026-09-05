import { USDC_ADDRESS } from "@lemon/core";
import { prisma } from "@lemon/db";
import { KyberAggregatorClient } from "@lemon/kyber";
import { NearMpcClient } from "@lemon/near-mpc";
import { PACIFICA_MAINNET, PacificaClient } from "@lemon/pacifica";
import { createPublicClient, createWalletClient, http } from "viem";
import { advisorFromEnv } from "./advisor";
import { resolveAgentChain } from "./chain";
import { VaultClient } from "./vault";
import { createPaperVenueAdapter } from "./venue-paper";
import { agentWalletFor } from "./wallet";
import {
	type QueueEntry,
	type TickResult,
	tick,
	type VenueAdapter,
	type WorkerDeps,
} from "./worker";

/**
 * The agent process.
 *
 * One process, many vaults, one worker per vault. They are independent by
 * construction — separate wallets, separate positions, separate books — so a
 * vault whose venue is having a bad day must not stop the others ticking. Each
 * tick is therefore isolated: a throw is logged against its vault and the loop
 * continues.
 *
 * The vault list comes from the indexer rather than from configuration, so an
 * operator creating a vault in the admin dashboard does not also have to deploy
 * the agent. It picks it up on the next cycle.
 */

const TICK_INTERVAL_MS = Number(process.env.AGENT_TICK_INTERVAL_MS ?? 60_000);
const INDEXER_URL = process.env.INDEXER_URL ?? "http://localhost:42069";

/**
 * The vault list comes from the API, not the indexer.
 *
 * The indexer only knows what the chain emitted, and a vault's derivation path
 * and venue configuration are deliberately off-chain. Reading the raw index
 * would give the agent a list of vaults it has no way to act on — which is
 * exactly the bug this replaced: every vault skipped, silently, forever.
 *
 * The queue still comes from the indexer, because it is pure chain state.
 */
const API_URL = process.env.AGENT_API_URL ?? "http://localhost:3002/api";

/**
 * Read both venues, fill neither.
 *
 * For deployments where the vault is somewhere the spot leg cannot execute. The
 * prices are live; only the fills are notional. See `venue-paper.ts`.
 */
const PAPER_TRADING = process.env.AGENT_PAPER_TRADING === "true";

const kyber = new KyberAggregatorClient({
	baseUrl: process.env.KYBER_BASE_URL,
	clientId: process.env.KYBER_CLIENT_ID ?? "lemon-agent",
});

const pacifica = new PacificaClient({
	baseUrl: process.env.PACIFICA_API_URL?.trim() || PACIFICA_MAINNET,
});

function log(level: "info" | "warn" | "error", message: string, extra?: unknown) {
	const line = `[agent] ${new Date().toISOString()} ${message}`;
	if (level === "error") console.error(line, extra ?? "");
	else if (level === "warn") console.warn(line, extra ?? "");
	else console.log(line);
}

/**
 * Persist what the agent decided and why.
 *
 * The agent is the only party that can move deployed capital, and most of what
 * it does is a judgement call about timing — so "why did this vault sit idle
 * through a good funding window" has to have an answer somewhere. This is that
 * somewhere, and it is what the operator dashboard's agent log reads.
 *
 * Failing to record must never fail the tick: the trades have already happened
 * by the time this runs, and losing an audit row is much cheaper than a crash
 * loop that stops the vault reporting.
 */
async function recordRun(vaultAddress: string, result: TickResult): Promise<void> {
	try {
		await prisma.agentRun.create({
			data: {
				vaultAddress: vaultAddress.toLowerCase(),
				action: result.action,
				rationale: result.rationale,
				advised: result.advised,
				navReported: result.navReported,
				activityReported: result.activityReported,
				fulfilled: result.fulfilled,
				error: result.error ?? null,
			},
		});
	} catch (error) {
		log("warn", `Could not record the run for ${vaultAddress}`, error);
	}
}

interface IndexedVault {
	address: `0x${string}`;
	ticker: string | null;
	symbol: string;
	riskTier: number;
	paused: boolean;
	/** The on-chain agent address. A derived wallet must match this exactly. */
	agentWallet: `0x${string}`;
	/** The path the vault was created with, from the operator's configuration. */
	agentPath?: string | null;
	agentEnabled?: boolean;
}

async function listVaults(): Promise<IndexedVault[]> {
	const response = await fetch(`${API_URL}/vaults`);
	if (!response.ok) throw new Error(`The API answered ${response.status} for the vault list`);
	const body = (await response.json()) as { vaults: IndexedVault[] };
	return body.vaults;
}

async function loadQueue(vaultAddress: string): Promise<QueueEntry[]> {
	const response = await fetch(`${INDEXER_URL}/queue?vault=${vaultAddress}`);
	if (!response.ok) return [];
	const body = (await response.json()) as {
		ripe: RawQueueRow[];
		waiting: RawQueueRow[];
	};
	return [...body.ripe, ...body.waiting].map((row) => toQueueEntry(row));
}

interface RawQueueRow {
	controller: `0x${string}`;
	pendingShares: string;
	eligibleAt: number;
	fulfillBy: number;
}

/**
 * Convert a queued request into what it is currently worth.
 *
 * The queue stores shares; the policy reasons in USDC. The conversion uses the
 * *current* share price rather than the price when the request was made, which
 * is correct — the contract prices the exit at fulfilment, so sizing an unwind
 * against the old price would free the wrong amount.
 */
function toQueueEntry(row: RawQueueRow, pricePerShare = 1_000_000n): QueueEntry {
	const shares = BigInt(row.pendingShares);
	return {
		controller: row.controller,
		pendingShares: shares,
		pendingAssets: (shares * pricePerShare) / 10n ** 18n,
		eligibleAt: row.eligibleAt,
		fulfillBy: row.fulfillBy,
	};
}

async function main() {
	const nearAccountId = process.env.NEAR_ACCOUNT_ID?.trim();
	const nearPrivateKey = process.env.NEAR_PRIVATE_KEY?.trim();

	if (!nearAccountId || !nearPrivateKey) {
		// Refusing to start beats starting without the ability to sign. An agent
		// that boots, ticks, and silently fails every write looks healthy on a
		// dashboard while its vaults go stale.
		throw new Error(
			"NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY are required: without them the agent cannot sign for any vault.",
		);
	}

	const mpc = new NearMpcClient({
		network: process.env.NEAR_NETWORK === "testnet" ? "testnet" : "mainnet",
		accountId: nearAccountId,
		privateKey: nearPrivateKey,
		rpcUrl: process.env.NEAR_RPC_URL?.trim(),
		contractId: process.env.NEAR_MPC_CONTRACT_ID?.trim(),
	});

	// One RPC round trip at boot to confirm the pinned root keys still match the
	// contract. A mismatch means every address this process derives belongs to a
	// key the network will not sign for — better found now than at the first
	// withdrawal.
	await mpc.verifyRootKeys();

	const chain = resolveAgentChain();
	const transport = http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org");
	const publicClient = createPublicClient({ chain, transport });
	const advisor = advisorFromEnv();

	log("info", advisor ? "Advisory layer enabled." : "No OPENROUTER_API_KEY; policy only.");

	for (;;) {
		try {
			const vaults = await listVaults();
			for (const indexed of vaults) {
				await runVault(indexed).catch((error) =>
					log("error", `Tick failed for ${indexed.address}`, error),
				);
			}
		} catch (error) {
			log("error", "Could not list vaults", error);
		}

		await new Promise((resolve) => setTimeout(resolve, TICK_INTERVAL_MS));
	}

	async function runVault(indexed: IndexedVault) {
		if (indexed.agentEnabled === false) {
			log("info", `${indexed.address}: agent disabled by an operator; skipping.`);
			return;
		}

		if (!indexed.agentPath) {
			// Refusing beats guessing. A vault whose creation was never recorded has
			// no known path, and deriving one would produce a wallet that holds no
			// role on it.
			log(
				"warn",
				`${indexed.address}: no derivation path recorded, so its agent wallet cannot be reconstructed.`,
			);
			return;
		}

		const wallet = agentWalletFor(mpc, indexed.agentPath, indexed.agentWallet);
		const walletClient = createWalletClient({
			account: wallet.account,
			chain,
			transport,
		});

		const vault = new VaultClient(publicClient, walletClient, indexed.address);

		// The venue adapter needs per-market configuration — token addresses,
		// the Pacifica symbol — which the registry owns. Wiring it is the
		// remaining integration step; until then a vault is observed and its NAV
		// is reported, and no trade is placed against an unconfigured market.
		const venue = await resolveVenue(indexed, vault);
		if (!venue) {
			log("warn", `${indexed.address}: no venue configuration for ${indexed.ticker ?? "?"}`);
			return;
		}

		const deps: WorkerDeps = {
			vault,
			venue,
			advisor,
			queue: () => loadQueue(indexed.address),
			now: () => Math.floor(Date.now() / 1000),
			log,
		};

		const result = await tick(deps);
		await recordRun(indexed.address, result);
		log(
			"info",
			`${indexed.address}: ${result.action}${result.advised ? " (advised)" : ""} — nav=${result.navReported} activity=${result.activityReported} fulfilled=${result.fulfilled}${result.error ? ` error=${result.error}` : ""}`,
		);
	}
}

/**
 * Resolve the venue configuration for one vault.
 *
 * Returns null rather than guessing when a market is not configured. A wrong
 * token address here hedges a position against a different asset while every
 * dashboard reads healthy — the exact failure the registry's by-asset curation
 * exists to prevent, so it must not be undone by a fallback here.
 *
 * `AGENT_PAPER_TRADING` picks the adapter. Paper reads both venues for real and
 * fills neither, which is the only thing that works where the vault lives
 * somewhere KyberSwap's aggregator cannot execute — a testnet, or Vibenet. It is
 * opt-in rather than inferred from the chain id, because "the venue is
 * unreachable" and "do not trade" have to be a deliberate choice: guessing wrong
 * in the permissive direction would place real orders from a test deployment.
 */
async function resolveVenue(
	indexed: IndexedVault,
	vault: VaultClient,
): Promise<VenueAdapter | null> {
	const record = await prisma.vaultConfig
		.findUnique({ where: { address: indexed.address.toLowerCase() } })
		.catch(() => null);

	if (!record) return null;

	if (!PAPER_TRADING) {
		// What is still missing is the bridge: `BridgeAdapter` has no
		// implementation in this repo, and both halves of the live adapter depend
		// on one — `deploy` to get margin to Solana, `unwind` to bring it home.
		// The Pacifica signer and the wallet client exist above; the bridge is the
		// remaining integration step. Refusing beats half-executing a two-legged
		// trade.
		log(
			"warn",
			`${indexed.address}: live trading is not wired up yet — no bridge adapter. Set AGENT_PAPER_TRADING=true to run this vault against read-only venues.`,
		);
		return null;
	}

	return createPaperVenueAdapter({
		config: {
			vaultAddress: indexed.address.toLowerCase(),
			symbol: record.spotTokenSymbol,
			spotToken: record.spotTokenAddress as `0x${string}`,
			spotTokenDecimals: record.spotTokenDecimals,
			usdc: USDC_ADDRESS,
			perpSymbol: record.perpSymbol,
			agentAddress: indexed.agentWallet,
			slippagePercent: record.slippagePercent,
		},
		kyber,
		pacifica,
		// The one real transaction in the paper path: a withdrawal has to be
		// payable, so the USDC genuinely goes back to the vault.
		returnToVault: (amount) => vault.agentReturn(amount),
		now: () => Math.floor(Date.now() / 1000),
	});
}

main().catch((error) => {
	log("error", "Agent stopped", error);
	process.exit(1);
});
