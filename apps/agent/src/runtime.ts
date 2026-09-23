/**
 * The agent's trading runtime, separated from the process that runs it.
 *
 * Everything here used to live in `index.ts`, which is also the agent's entry
 * point and calls `main()` at the bottom of the module. That made all of it
 * unreachable from anywhere else: importing `resolveVenue` to place one order
 * by hand would have started the tick loop as a side effect of the import, and
 * an operator script that wants to correct a single hedge must not also begin
 * trading every vault the indexer knows about.
 *
 * So the wiring lives here and the process lives there. `index.ts` imports
 * these and keeps its loop; `scripts/rebalance-hedge.ts` imports the same ones
 * and places exactly one order. Neither holds a second copy of how a vault's
 * markets, wallets, bridge and venue clients are assembled — which matters
 * because that assembly is what decides which token a swap actually sells.
 *
 * Nothing in this module runs on import beyond constructing the three venue
 * clients, none of which opens a connection until it is called.
 */

import type { LogLevel, SpotAggregator } from "@lemon/core";
import { prisma, type VaultMarketConfig, vaultMarkets, vaultRef, vaultWhere } from "@lemon/db";
import { KyberAggregatorClient, kyberCovers } from "@lemon/kyber";
import { LifiAggregatorClient } from "@lemon/lifi";
import { PACIFICA_MAINNET, PacificaClient } from "@lemon/pacifica";
import { findTokenByAddress } from "@lemon/registry";
import { RelayClient } from "@lemon/relay";
import type { createWalletClient, PublicClient } from "viem";
import { createRelayBridge } from "./bridge";
import { AGENT_CHAIN } from "./chain";
import { DEFAULT_REBALANCE_DRIFT_BPS } from "./policy";
import type { SolanaExecutor } from "./solana";
import type { VaultClient } from "./vault";
import { createVenueAdapter } from "./venue";
import type { AgentWallet } from "./wallet";
import type { VenueAdapter } from "./worker";

/**
 * The spot aggregator for this agent's chain.
 *
 * KyberSwap covers Base and Arbitrum; X Layer has no KyberSwap deployment at
 * all and goes to LI.FI. Which one is not a decision the trading code makes —
 * it is a fact about the chain, resolved once at boot, and
 * `KyberAggregatorClient` throws rather than accepting a chain it cannot route.
 * An agent that got this wrong would not fail cleanly: it would quote against
 * pools that do not exist and read a live market as unroutable.
 */
export const kyber: SpotAggregator = kyberCovers(AGENT_CHAIN.id)
	? new KyberAggregatorClient({
			chainId: AGENT_CHAIN.id,
			baseUrl: process.env.KYBER_BASE_URL,
			clientId: process.env.KYBER_CLIENT_ID ?? "lemon-agent",
		})
	: new LifiAggregatorClient({
			chainId: AGENT_CHAIN.id,
			baseUrl: process.env.LIFI_BASE_URL,
			integrator: process.env.LIFI_INTEGRATOR ?? "lemon-agent",
			apiKey: process.env.LIFI_API_KEY,
		});

export const pacifica = new PacificaClient({
	baseUrl: process.env.PACIFICA_API_URL?.trim() || PACIFICA_MAINNET,
});

/**
 * Relay carries USDC between the two chains the vault trades on.
 *
 * The API key is not optional here, unlike in the API where a missing one only
 * disables a funding widget. Deposit addresses require it, both halves of every
 * trade need one, and an agent that discovered this at the moment it tried to
 * bridge would discover it with a deposit already drawn from a vault.
 */
export const relay = new RelayClient({
	baseUrl: process.env.RELAY_API_URL?.trim(),
	apiKey: process.env.RELAY_API_KEY,
});

/**
 * How long a hand-asked rebalance stays actionable.
 *
 * Ten minutes, which is several ticks at the default interval — long enough
 * that a slow tick or a brief restart still serves the request, short enough
 * that an instruction given about a position is not executed against a
 * different one. An operator who still wants it can press the button again,
 * looking at what is true then.
 */
export const REBALANCE_REQUEST_TTL_MS = 10 * 60 * 1000;

export interface IndexedVault {
	address: `0x${string}`;
	/**
	 * The chain this vault custodies on.
	 *
	 * Optional because an older API serves rows without it, and those rows are
	 * Base vaults — which is what `AGENT_CHAIN_ID` defaults to, so the pairing is
	 * correct rather than merely permissive.
	 */
	chainId?: number;
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

/**
 * Resolve the venue adapter for one vault, and read the operator's orders.
 *
 * Returns null rather than guessing when a vault has no configuration. A wrong
 * token address here hedges a position against a different asset while every
 * dashboard reads healthy — the exact failure the registry's by-asset curation
 * exists to prevent, so it must not be undone by a fallback here.
 *
 * The market list comes from `vaultMarkets`, which seeds a vault created before
 * vaults could have more than one from the founding-market columns it already
 * has. So a vault configured a year ago and a vault given four markets this
 * morning arrive here in the same shape, and nothing downstream has a
 * single-market path left to drift out of date.
 *
 * Built fresh on every tick, and that is deliberate: `createRelayBridge` reads
 * the unfinished crossings back from the database as it is constructed, so a
 * process restarted mid-bridge picks the in-flight amount up again rather than
 * reporting a NAV with the transfer missing from both sides. Reading the close
 * order here rather than caching it is the same reasoning applied to an
 * operator's instruction: it has to take effect on the next tick, not on the
 * next deploy.
 */
export async function resolveVenue(params: {
	indexed: IndexedVault;
	vault: VaultClient;
	wallet: AgentWallet;
	walletClient: ReturnType<typeof createWalletClient>;
	publicClient: PublicClient;
	solana: SolanaExecutor;
	/** The vault-scoped logger, so the bridge and the adapter label their lines. */
	log: (level: LogLevel, message: string, extra?: unknown) => void;
}): Promise<{
	venue: VenueAdapter;
	closeRequested: boolean;
	/** An operator asked for a correction on this tick. */
	rebalanceRequested: boolean;
	/** One was asked for, but too long ago to act on. Recorded, not executed. */
	rebalanceRequestStale: boolean;
	rebalanceDriftBps: number;
} | null> {
	const { indexed, vault, wallet, walletClient, publicClient, solana, log } = params;

	const ref = vaultRef(AGENT_CHAIN.id, indexed.address);

	const record = await prisma.vaultConfig.findUnique({ where: vaultWhere(ref) }).catch(() => null);

	if (!record) return null;

	const markets = await vaultMarkets(ref).catch((error) => {
		log("warn", "Could not read the market list.", error);
		return [] as VaultMarketConfig[];
	});
	if (markets.length === 0) {
		log("warn", "Configured but has no markets, so there is nothing to trade.");
		return null;
	}

	const bridge = await createRelayBridge({
		vaultAddress: indexed.address,
		relay,
		solana,
		publicClient,
		walletClient,
		agentAddress: indexed.agentWallet,
		solanaAddress: wallet.solanaAddress,
		path: wallet.path,
		log,
	});

	/**
	 * Refuse a market whose spot token is not on this chain.
	 *
	 * The hole this closes is narrow and expensive. `VaultConfig` records a spot
	 * token address chosen when the vault was configured, and nothing about that
	 * row proves the address belongs to the vault's chain — a vault created
	 * outside the admin console and backfilled by `seed-venue-config.ts` would,
	 * before the seeder was chain-scoped, have been given whichever chain's token
	 * matched the ticker first.
	 *
	 * Left unchecked the agent would approve and swap against an address that
	 * holds no contract here, or worse holds a different one. Checked against the
	 * curated registry, the market is skipped and named. Skipping rather than
	 * refusing the whole vault is deliberate: one mislabelled market must not
	 * stop the others being valued, and a vault whose every market is skipped
	 * falls through to the existing "no markets, nothing to trade" path.
	 */
	const onThisChain = markets.filter((market) => {
		const known = findTokenByAddress(market.spotTokenAddress, AGENT_CHAIN.id);
		if (known) return true;
		log(
			"error",
			`${market.ticker}: spot token ${market.spotTokenAddress} is not a curated ${AGENT_CHAIN.name} token, so it will not be traded. The vault's venue configuration names a token from another chain.`,
		);
		return false;
	});

	if (onThisChain.length === 0) {
		log("warn", "No market has a spot token on this chain, so there is nothing to trade.");
		return null;
	}

	const venue = createVenueAdapter({
		config: {
			markets: onThisChain.map((market) => ({
				ticker: market.ticker,
				symbol: market.spotTokenSymbol,
				spotToken: market.spotTokenAddress as `0x${string}`,
				spotTokenDecimals: market.spotTokenDecimals,
				perpSymbol: market.perpSymbol,
				targetWeightBps: market.targetWeightBps,
			})),
			usdc: AGENT_CHAIN.usdc,
			solanaAddress: wallet.solanaAddress,
			agentAddress: indexed.agentWallet,
			slippagePercent: record.slippagePercent,
		},
		publicClient,
		walletClient,
		kyber,
		pacifica,
		signPacifica: wallet.signSolanaMessage,
		bridge,
		// A callback rather than the client: the adapter's job is to turn a
		// position into USDC at the agent's Base wallet, and which vault that USDC
		// belongs to is the worker's knowledge.
		returnToVault: (amount) => vault.agentReturn(amount),
		inFlight: bridge.inFlight,
		solanaIdleUsdc: () => solana.usdcBalance(wallet.solanaAddress),
		now: () => Math.floor(Date.now() / 1000),
		log,
	});

	/**
	 * A hand-asked rebalance, if one is pending and still recent.
	 *
	 * Bounded in time on purpose. An operator presses this looking at a position
	 * as it is now; if the agent has been down for a day, firing that instruction
	 * against a position that has since moved is not what they asked for — it is
	 * a stale order arriving after the situation it described. Past the window it
	 * is treated as expired rather than executed, and said so in the outcome.
	 */
	const requestedAt = record.rebalanceRequestedAt;
	const rebalanceRequested =
		requestedAt !== null &&
		record.rebalanceCompletedAt === null &&
		Date.now() - requestedAt.getTime() <= REBALANCE_REQUEST_TTL_MS;

	return {
		venue,
		closeRequested: record.closeRequestedAt !== null,
		rebalanceRequested,
		rebalanceRequestStale:
			requestedAt !== null && record.rebalanceCompletedAt === null && !rebalanceRequested,
		// The operator's setting when there is one, and the shared default when
		// there is not. Read from the same row the UI reads, so what a depositor is
		// shown as the threshold is the threshold the agent actually acts on.
		rebalanceDriftBps: record.rebalanceDriftBps ?? DEFAULT_REBALANCE_DRIFT_BPS,
	};
}
