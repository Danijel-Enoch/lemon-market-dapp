import { createLogger, DEFAULT_CHAIN_ID, formatDuration, type LogLevel } from "@lemon/core";
import { prisma } from "@lemon/db";
import { NearMpcClient } from "@lemon/near-mpc";
import { createPublicClient, createWalletClient, http } from "viem";
import { advisorFromEnv } from "./advisor";
import { AGENT_CHAIN, agentRpcUrl, resolveAgentChain } from "./chain";
import { createCooldown } from "./cooldown";
// The trading runtime, which this process drives and `scripts/rebalance-hedge.ts`
// borrows. It lives outside this module precisely because this one starts
// ticking on import — see the note at the top of `runtime.ts`.
import { type IndexedVault, relay, resolveVenue } from "./runtime";
import { createSolanaExecutor } from "./solana";
import { VaultClient } from "./vault";
import { agentWalletFor } from "./wallet";
import { type QueueEntry, type TickResult, tick, type WorkerDeps } from "./worker";

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

main().catch((error) => {
	log("error", "Agent stopped", error);
	process.exit(1);
});
