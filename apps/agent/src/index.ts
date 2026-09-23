import {
	createLogger,
	DEFAULT_CHAIN_ID,
	formatDuration,
	type LogLevel,
	type SpotAggregator,
} from "@lemon/core";
import { prisma, type VaultMarketConfig, vaultMarkets, vaultRef, vaultWhere } from "@lemon/db";
import { KyberAggregatorClient, kyberCovers } from "@lemon/kyber";
import { LifiAggregatorClient } from "@lemon/lifi";
import { NearMpcClient } from "@lemon/near-mpc";
import { PACIFICA_MAINNET, PacificaClient } from "@lemon/pacifica";
import { findTokenByAddress } from "@lemon/registry";
import { RelayClient } from "@lemon/relay";
import { createPublicClient, createWalletClient, http, type PublicClient } from "viem";
import { advisorFromEnv } from "./advisor";
import { createRelayBridge } from "./bridge";
import { AGENT_CHAIN, agentRpcUrl, resolveAgentChain } from "./chain";
import { createCooldown } from "./cooldown";
import { DEFAULT_REBALANCE_DRIFT_BPS } from "./policy";
import { createSolanaExecutor, type SolanaExecutor } from "./solana";
import { VaultClient } from "./vault";
import { createVenueAdapter } from "./venue";
import { type AgentWallet, agentWalletFor } from "./wallet";
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
 * The spot aggregator for this agent's chain.
 *
 * KyberSwap covers Base and Arbitrum; X Layer has no KyberSwap deployment at
 * all and goes to LI.FI. Which one is not a decision the trading code makes —
 * it is a fact about the chain, resolved once at boot, and
 * `KyberAggregatorClient` throws rather than accepting a chain it cannot route.
 * An agent that got this wrong would not fail cleanly: it would quote against
 * pools that do not exist and read a live market as unroutable.
 */
const kyber: SpotAggregator = kyberCovers(AGENT_CHAIN.id)
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

const pacifica = new PacificaClient({
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
const relay = new RelayClient({
	baseUrl: process.env.RELAY_API_URL?.trim(),
	apiKey: process.env.RELAY_API_KEY,
});

const logger = createLogger("agent");

/**
 * The level-as-argument form, for the workers.
 *
 * `tick`, the bridge and the venue adapter all take a `log` callback rather
 * than a logger, which keeps them testable without one. This is that callback,
 * and it is `logger.emit` — so a line written from inside a tick is
 * indistinguishable from one written out here.
 */
function log(level: LogLevel, message: string, extra?: unknown) {
	logger.emit(level, message, extra);
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
				market: result.market,
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

/**
 * Stamp the moment an agent first found a vault flat under a close order.
 *
 * Only ever writes the timestamp, never clears the order. Lifting it is an
 * operator's decision — an agent that stood itself down and then let itself back
 * up would make the order a suggestion — so the vault stays flat, reporting NAV
 * and settling its queue, until a human says otherwise.
 *
 * Conditional on the column still being null so the recorded time is when the
 * position *became* flat rather than the most recent tick that noticed.
 */
/**
 * How long a hand-asked rebalance stays actionable.
 *
 * Ten minutes, which is several ticks at the default interval — long enough
 * that a slow tick or a brief restart still serves the request, short enough
 * that an instruction given about a position is not executed against a
 * different one. An operator who still wants it can press the button again,
 * looking at what is true then.
 */
const REBALANCE_REQUEST_TTL_MS = 10 * 60 * 1000;

/**
 * Answer the operator, whatever the answer is.
 *
 * Every pending request ends here — acted on, impossible, or expired. Leaving
 * one unanswered would put the dashboard in the state this whole feature exists
 * to avoid: a button pressed, nothing visibly happening, and no way to tell
 * "working on it" from "this can never work".
 */
async function recordRebalanceOutcome(
	vaultAddress: string,
	chainId: number,
	outcome: string,
): Promise<void> {
	try {
		const { count } = await prisma.vaultConfig.updateMany({
			where: { chainId, address: vaultAddress.toLowerCase(), rebalanceCompletedAt: null },
			data: { rebalanceCompletedAt: new Date(), rebalanceOutcome: outcome },
		});
		if (count > 0) log("info", `${vaultAddress}: rebalance request — ${outcome}`);
	} catch (error) {
		log("warn", `Could not record the rebalance outcome for ${vaultAddress}`, error);
	}
}

async function recordCloseSatisfied(vaultAddress: string, chainId: number): Promise<void> {
	try {
		const { count } = await prisma.vaultConfig.updateMany({
			where: { chainId, address: vaultAddress.toLowerCase(), closeCompletedAt: null },
			data: { closeCompletedAt: new Date() },
		});
		if (count > 0) {
			log("info", `${vaultAddress}: the close order is satisfied — the vault is flat.`);
		}
	} catch (error) {
		log("warn", `Could not record the close for ${vaultAddress}`, error);
	}
}

interface IndexedVault {
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
	logger.info(`Starting. Log level ${logger.enabled("debug") ? "debug" : "info"}.`);

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

	// A warning rather than a refusal to start. The bridge signs and broadcasts
	// Relay's quoted steps itself, and quoting needs no key — only the deposit
	// addresses this used to use did, which is what made a missing key fatal.
	// A key still raises the rate limits, so its absence is worth saying once.
	if (!relay.hasApiKey) {
		logger.warn(
			"RELAY_API_KEY is not set. Bridging works without one; a key (free, self-serve at dashboard.relay.link) raises Relay's rate limits.",
		);
	}

	const feePayerSecret = process.env.SOLANA_FEE_PAYER_SECRET?.trim();
	if (!feePayerSecret) {
		throw new Error(
			"SOLANA_FEE_PAYER_SECRET is required: agent wallets are MPC-derived and hold USDC but never SOL, so a separate keypair has to pay for the Solana transactions that fund and unwind the perp leg.",
		);
	}

	const mpc = new NearMpcClient({
		accountId: nearAccountId,
		privateKey: nearPrivateKey,
		rpcUrl: process.env.NEAR_RPC_URL?.trim(),
		contractId: process.env.NEAR_MPC_CONTRACT_ID?.trim(),
	});

	// One RPC round trip at boot to confirm the pinned root keys still match the
	// contract. A mismatch means every address this process derives belongs to a
	// key the network will not sign for — better found now than at the first
	// withdrawal.
	const keys = logger.span("verify NEAR MPC root keys", { extra: { account: nearAccountId } });
	await mpc.verifyRootKeys();
	keys.end();

	const solana = createSolanaExecutor({
		rpcUrl: process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com",
		feePayerSecret,
		mpc,
	});

	// One read at boot, because an empty fee payer does not fail loudly — it
	// fails at the moment a bridge tries to send, halfway through an unwind.
	//
	// Reported as what the balance buys rather than against a fixed threshold.
	// The two costs differ by more than two orders of magnitude — a crossing into
	// an existing token account is a 10,000-lamport fee, and one that has to
	// create the account is that plus its rent — so any single number is either
	// alarmist for the common case or quiet for the expensive one. Counting both
	// is the honest version, and it is the same arithmetic the bridge preflight
	// runs per vault before it moves anything.
	const [lamports, costs] = await Promise.all([solana.feePayerLamports(), solana.costs()]);
	const spendable = lamports > costs.feePayerFloor ? lamports - costs.feePayerFloor : 0n;
	const crossings = spendable / costs.depositFee;
	const newAccounts = spendable / (costs.tokenAccountRent + costs.depositFee);
	log(
		newAccounts > 0n ? "info" : "warn",
		`Solana fee payer ${solana.feePayer} holds ${Number(lamports) / 1e9} SOL: ${crossings} more crossing(s) into token accounts that already exist, or ${newAccounts} that still have to create one at ${Number(costs.tokenAccountRent) / 1e9} SOL of rent each.${
			newAccounts > 0n
				? ""
				: " A vault whose first deployment has not happened yet cannot cross until this is topped up."
		}`,
	);

	const chain = resolveAgentChain();
	const transport = http(agentRpcUrl());
	const publicClient = createPublicClient({ chain, transport });
	const advisor = advisorFromEnv();

	logger.info(advisor ? "Advisory layer enabled." : "No OPENROUTER_API_KEY; policy only.");
	logger.info(
		`Ready. Ticking every ${formatDuration(TICK_INTERVAL_MS)} on ${chain.name}; vaults from ${API_URL}, queue from ${INDEXER_URL}.`,
	);

	/**
	 * One backoff ledger per vault, created on first sight and kept thereafter.
	 *
	 * Outside `runVault` because it has to outlive a tick. The failures it counts
	 * are consecutive across ticks — that is what makes the wait grow — and a map
	 * rebuilt each cycle would reset every counter to zero and restore precisely
	 * the every-sixty-seconds retry this exists to stop.
	 */
	const cooldowns = new Map<string, ReturnType<typeof createCooldown>>();
	function cooldownFor(address: string) {
		const existing = cooldowns.get(address);
		if (existing) return existing;
		const created = createCooldown();
		cooldowns.set(address, created);
		return created;
	}

	// Numbered so a line can be tied to a cycle when several vaults interleave in
	// the output, and so "we are on cycle 4 and it started twenty minutes ago" is
	// readable off the log rather than inferred from timestamps.
	let cycle = 0;

	for (;;) {
		cycle += 1;
		const span = logger.span(`cycle ${cycle}`);
		const outcomes: string[] = [];

		try {
			const vaults = await listVaults();
			logger.info(`Cycle ${cycle}: ${vaults.length} vault(s) to tick.`);

			for (const indexed of vaults) {
				const outcome = await runVault(indexed).catch((error) => {
					log("error", `Tick failed for ${indexed.address}`, error);
					return "FAILED";
				});
				outcomes.push(`${indexed.ticker ?? indexed.address.slice(0, 8)}=${outcome}`);
			}
		} catch (error) {
			log("error", "Could not list vaults", error);
		}

		span.end(outcomes.length ? outcomes.join(" ") : "nothing to do");
		logger.info(`Sleeping ${formatDuration(TICK_INTERVAL_MS)} until cycle ${cycle + 1}.`);
		await new Promise((resolve) => setTimeout(resolve, TICK_INTERVAL_MS));
	}

	/**
	 * One vault's tick, wrapped in a span.
	 *
	 * Returns the short outcome the cycle summary is built from, so the line that
	 * closes a cycle says what each vault did without the reader scrolling back
	 * through however many bridge minutes happened in between.
	 */
	async function runVault(indexed: IndexedVault): Promise<string> {
		/**
		 * A vault on another chain is not this process's work.
		 *
		 * One agent process serves one chain, because everything below this line
		 * is bound to one: the wallet client signs with this chain's id, the USDC
		 * address is this chain's, and the bridge quotes from it as the origin.
		 * Running a vault from elsewhere would not fail cleanly — the reads would
		 * return zeros from an address that holds nothing here, the agent would
		 * conclude the vault is empty, and a NAV of zero is a report that wipes
		 * out every holder's share price.
		 *
		 * Skipping is silent at info level rather than a warning: with a process
		 * per chain, most vaults in the list belong to somebody else by design,
		 * and warning on each would bury the lines that matter.
		 */
		const vaultChainId = indexed.chainId ?? DEFAULT_CHAIN_ID;
		if (vaultChainId !== AGENT_CHAIN.id) return "OTHER_CHAIN";

		if (indexed.agentEnabled === false) {
			log("info", `${indexed.address}: agent disabled by an operator; skipping.`);
			return "DISABLED";
		}

		if (!indexed.agentPath) {
			// Refusing beats guessing. A vault whose creation was never recorded has
			// no known path, and deriving one would produce a wallet that holds no
			// role on it.
			log(
				"warn",
				`${indexed.address}: no derivation path recorded, so its agent wallet cannot be reconstructed.`,
			);
			return "NO_PATH";
		}

		// One logger per vault, handed to everything below. The address lives in
		// the scope rather than in each message, so the worker, the bridge and the
		// venue adapter all label their lines the same way and `grep 0xabc` picks
		// up the whole of one vault's tick.
		const vaultLogger = logger.child(indexed.address);
		const span = vaultLogger.span(`tick ${indexed.ticker ?? indexed.symbol}`);

		try {
			const wallet = agentWalletFor(mpc, indexed.agentPath, indexed.agentWallet);
			const walletClient = createWalletClient({
				account: wallet.account,
				chain,
				transport,
			});

			const vault = new VaultClient(publicClient, walletClient, indexed.address);

			// The venue adapter needs per-market configuration — token addresses, the
			// Pacifica symbol — which the operator owns. No trade is placed against an
			// unconfigured market.
			const resolved = await resolveVenue({
				indexed,
				vault,
				wallet,
				walletClient,
				publicClient,
				solana,
				log: vaultLogger.emit,
			});
			if (!resolved) {
				vaultLogger.warn(`No venue configuration for ${indexed.ticker ?? "?"}.`);
				span.end("no venue configuration");
				return "UNCONFIGURED";
			}

			const deps: WorkerDeps = {
				vault,
				venue: resolved.venue,
				advisor,
				queue: () => loadQueue(indexed.address),
				closeRequested: resolved.closeRequested,
				rebalanceRequested: resolved.rebalanceRequested,
				rebalanceDriftBps: resolved.rebalanceDriftBps,
				// Per vault and kept across ticks, which is the whole point: a cooldown
				// that lived inside a tick would be forgotten by the next one, sixty
				// seconds later, which is exactly the interval it exists to break.
				cooldown: cooldownFor(indexed.address),
				now: () => Math.floor(Date.now() / 1000),
				log: vaultLogger.emit,
			};

			const result = await tick(deps);

			// A vault nobody has deposited into does not get a run history. It made
			// no decision — there was nothing to decide — and a row a minute saying
			// so would bury the vaults that did decide something under vaults that
			// have never held a dollar. The cycle summary below still names it, so
			// "is the agent seeing this vault at all" is answerable from the log.
			//
			// A failed keepalive is the exception: that one is recorded, because a
			// vault about to go stale to its first depositor is exactly the kind of
			// thing the agent log exists to surface.
			if (result.action !== "IDLE" || result.error) {
				await recordRun(indexed.address, result);
			}

			if (result.closeSatisfied) await recordCloseSatisfied(indexed.address, AGENT_CHAIN.id);

			/**
			 * Answer a hand-asked rebalance, whatever the answer turned out to be.
			 *
			 * The rationale is reused rather than rewritten: when the correction was
			 * refused it already names why in the venue's own terms — "worth $3.45,
			 * under the venue's $10 minimum order" — and an outcome written
			 * separately here would be a second, vaguer account of the same tick
			 * that could drift out of step with the run log beside it.
			 */
			if (resolved.rebalanceRequestStale) {
				await recordRebalanceOutcome(
					indexed.address,
					AGENT_CHAIN.id,
					"Expired before the agent reached it. Ask again if it is still wanted.",
				);
			} else if (resolved.rebalanceRequested) {
				await recordRebalanceOutcome(
					indexed.address,
					AGENT_CHAIN.id,
					result.action === "REBALANCE"
						? `Corrected ${result.market ?? "the hedge"}. ${result.rationale}`
						: `No correction made. ${result.rationale}`,
				);
			}

			const summary = `${result.action}${result.market ? ` ${result.market}` : ""}${result.advised ? " (advised)" : ""} — nav=${result.navReported} activity=${result.activityReported} fulfilled=${result.fulfilled}${result.error ? ` error=${result.error}` : ""}`;
			span.end(summary);
			return result.error ? `${result.action}!` : result.action;
		} catch (error) {
			// Closed here as well as on the happy path, because a span that only
			// ends when the work succeeds turns every failure into a tick that reads
			// as still running — the exact state the end line exists to rule out.
			span.fail(error);
			throw error;
		}
	}
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
async function resolveVenue(params: {
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

main().catch((error) => {
	log("error", "Agent stopped", error);
	process.exit(1);
});
