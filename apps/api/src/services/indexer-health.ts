import { vaultFactoryAbi } from "@lemon/contracts";
import { allChains, requireChainInfo } from "@lemon/core";
import { clientFor } from "../chain";
import { config } from "../config";

/**
 * Whether the read model can be believed.
 *
 * Worth its own service because the indexer's failure mode is silence. It does
 * not crash and it does not 500 — it answers every request with `200 []`, and a
 * dashboard reading that shows an empty board, zero TVL and no vaults, which is
 * indistinguishable from a protocol nobody has deposited into. Every other
 * number on the operator console is downstream of this one, so if it is wrong
 * the whole page is wrong and says nothing about it.
 *
 * Four questions, in the order that a wrong answer to each invalidates the next:
 *
 *  1. **Is it there at all?** A connection refused is the easy case.
 *  2. **Has it finished its backfill?** Ponder serves before it is ready and
 *     answers `/ready` with a 503 until historical indexing completes. During
 *     that window the tables may not even exist yet.
 *  3. **Does it hold every vault the factory has created?** This is the one that
 *     matters and the one nothing else catches. The chain knows exactly how many
 *     vaults exist; if the read model holds fewer while claiming to be finished,
 *     it is not behind, it is *wrong*, and no amount of waiting fixes it.
 *  4. **Is it keeping up?** Ordinary lag, measured in blocks against the head.
 */

/**
 * How far behind the head is still "in sync".
 *
 * Base produces a block every two seconds, so thirty blocks is about a minute —
 * comfortably longer than a poll interval and a reorg, and short enough that a
 * genuinely stalled indexer does not sit here looking green.
 */
const IN_SYNC_BLOCKS = 30;

/** Ponder answers before it is ready, so these are cheap and must not hang the page. */
const PROBE_TIMEOUT_MS = 4_000;

export type IndexerState =
	/** Nothing is answering. The board and every vault page will be empty. */
	| "unreachable"
	/** Answering, but still replaying history. Its numbers are incomplete by definition. */
	| "backfilling"
	/** Finished, and still missing vaults the chain says exist. Waiting will not fix it. */
	| "incomplete"
	/** Finished and complete, but lagging the head far enough to notice. */
	| "behind"
	| "synced";

/**
 * One probe's verdict, with no knowledge of any other chain.
 *
 * Split from `IndexerHealth` so `classifyIndexer` keeps its shape: it judges a
 * single sync against a single chain, and is reused unchanged for each of them.
 */
export interface IndexerVerdict {
	state: IndexerState;
	/** What this means for the dashboard, in a sentence an operator can act on. */
	summary: string;
	/** What to do about it, when there is something to do. */
	remedy: string | null;
	indexerUrl: string;

	/** Whether Ponder considers historical indexing complete. */
	historicalComplete: boolean;
	/** The highest block the read model has processed, or null if it did not say. */
	indexedBlock: number | null;
	/** The chain's head, or null when the RPC could not be reached. */
	headBlock: number | null;
	blocksBehind: number | null;

	/**
	 * Vaults in the read model against vaults the factory has created.
	 *
	 * `expected` is null when no factory is configured or the RPC is down —
	 * unknown, which is different from zero and must not be rendered as a
	 * mismatch.
	 */
	vaults: { indexed: number | null; expected: number | null };
}

export interface IndexerHealth extends IndexerVerdict {
	/**
	 * The same verdict, per chain, for every chain this deployment indexes.
	 *
	 * The single verdict above is the worst of these, which is what a dashboard
	 * badge should show — but it cannot say *which* chain is unhappy, and with
	 * chains indexed independently that is the whole question. A chain with no
	 * factory configured is absent rather than reported as zero-of-something:
	 * it is not indexed, so it has nothing to be behind on.
	 */
	chains: IndexerChainHealth[];
}

/** One chain's sync state, named. */
export interface IndexerChainHealth {
	chainId: number;
	/** Ponder's key for the chain, and this deployment's env suffix in lower case. */
	key: string;
	/** As a person would say it — "X Layer". */
	name: string;
	state: IndexerState;
	summary: string;
	indexedBlock: number | null;
	headBlock: number | null;
	blocksBehind: number | null;
	vaults: { indexed: number | null; expected: number | null };
}

/**
 * Ask the indexer and the chain, and reconcile the two.
 *
 * Every probe is individually allowed to fail. A degraded answer that names
 * which half is missing is more useful to an operator than an exception, and
 * this is a status endpoint — it reporting an outage as a 500 would be its own
 * small joke.
 */
export async function indexerHealth(): Promise<IndexerHealth> {
	const [ready, byChain] = await Promise.all([probeReady(), probeStatusByChain()]);

	/**
	 * Only chains this deployment actually indexes.
	 *
	 * The set is derived from the factory addresses, exactly as `ponder.config.ts`
	 * derives its sources — so the two cannot disagree about which chains exist.
	 * Asking about a chain with no factory would compare an empty read model
	 * against a contract that was never deployed, which is how this check came to
	 * report "0 of the 4 vaults" on a deployment whose four vaults are on a chain
	 * it had been told not to index.
	 */
	const configured = allChains().filter((info) => Boolean(config.factories[info.envSuffix]));

	const chains: IndexerChainHealth[] = await Promise.all(
		configured.map(async (info) => {
			const indexedBlock = byChain[info.key] ?? null;
			const [headBlock, expected, indexed] = ready.reachable
				? await Promise.all([
						chainHead(info.id),
						factoryVaultCount(info.id),
						probeVaultCount(info.id),
					])
				: [null, null, null];

			const verdict = classifyIndexer({
				indexerUrl: config.indexerUrl,
				reachable: ready.reachable,
				historicalComplete: ready.complete,
				indexedBlock,
				headBlock,
				indexedVaults: indexed,
				expectedVaults: expected,
			});

			return {
				chainId: info.id,
				key: info.key,
				name: info.name,
				state: verdict.state,
				summary: verdict.summary,
				indexedBlock: verdict.indexedBlock,
				headBlock: verdict.headBlock,
				blocksBehind: verdict.blocksBehind,
				vaults: verdict.vaults,
			};
		}),
	);

	/**
	 * The headline is the worst chain, not an average.
	 *
	 * An operator needs to know something is wrong before they need to know how
	 * much of it is fine, and a deployment where Base is synced and X Layer is
	 * missing vaults is a deployment with a problem.
	 */
	const worst = [...chains].sort((a, b) => severity(b.state) - severity(a.state))[0];

	const totals = chains.reduce(
		(acc, chain) => ({
			indexed: sum(acc.indexed, chain.vaults.indexed),
			expected: sum(acc.expected, chain.vaults.expected),
		}),
		{ indexed: null as number | null, expected: null as number | null },
	);

	// Nothing configured anywhere: fall back to the single-chain shape so the
	// card still explains itself rather than rendering an empty list.
	if (!worst) {
		const verdict = classifyIndexer({
			indexerUrl: config.indexerUrl,
			reachable: ready.reachable,
			historicalComplete: ready.complete,
			indexedBlock: null,
			headBlock: null,
			indexedVaults: null,
			expectedVaults: null,
		});
		return { ...verdict, chains: [] };
	}

	const headline = classifyIndexer({
		indexerUrl: config.indexerUrl,
		reachable: ready.reachable,
		historicalComplete: ready.complete,
		indexedBlock: worst.indexedBlock,
		headBlock: worst.headBlock,
		indexedVaults: totals.indexed,
		expectedVaults: totals.expected,
	});

	return { ...headline, chains };
}

/** Worst first. The order the operator should be told about them in. */
function severity(state: IndexerState): number {
	switch (state) {
		case "unreachable":
			return 4;
		case "incomplete":
			return 3;
		case "backfilling":
			return 2;
		case "behind":
			return 1;
		default:
			return 0;
	}
}

/** Adds two counts where both are known; unknown plus anything stays unknown. */
function sum(a: number | null, b: number | null): number | null {
	if (a === null) return b;
	if (b === null) return a;
	return a + b;
}

export interface IndexerProbe {
	indexerUrl: string;
	reachable: boolean;
	historicalComplete: boolean;
	indexedBlock: number | null;
	headBlock: number | null;
	indexedVaults: number | null;
	expectedVaults: number | null;
}

/**
 * Turn the probe results into a verdict.
 *
 * Separated from the I/O because the decision is the part worth being sure
 * about, and the ordering of these branches is load-bearing: each one's answer
 * would be misleading if a branch above it were also true. An unreachable
 * indexer is not "behind", and an indexer still backfilling is not "missing
 * vaults" — it simply has not got to them yet, and reporting that as a
 * misconfiguration would send an operator to reset a perfectly healthy sync.
 */
export function classifyIndexer(probe: IndexerProbe): IndexerVerdict {
	const { indexerUrl, indexedBlock, headBlock } = probe;
	const indexed = probe.indexedVaults;
	const expected = probe.expectedVaults;
	const ready = { reachable: probe.reachable, complete: probe.historicalComplete };

	if (!ready.reachable) {
		return {
			state: "unreachable",
			summary: `The indexer at ${indexerUrl} is not answering, so every vault figure on this page is missing rather than zero.`,
			remedy: "Start it with `bun run dev:indexer`, or check the service is up in production.",
			indexerUrl,
			historicalComplete: false,
			indexedBlock: null,
			headBlock: null,
			blocksBehind: null,
			vaults: { indexed: null, expected },
		};
	}

	const blocksBehind =
		headBlock !== null && indexedBlock !== null ? Math.max(0, headBlock - indexedBlock) : null;

	if (!ready.complete) {
		return {
			state: "backfilling",
			summary: blocksBehind
				? `The indexer is still replaying history — ${blocksBehind.toLocaleString()} blocks behind the head. Its numbers are incomplete until it finishes.`
				: "The indexer is still replaying history. Its numbers are incomplete until it finishes.",
			remedy:
				"Nothing to do but wait. A backfill from a fresh start block takes a while on a public RPC.",
			indexerUrl,
			historicalComplete: false,
			indexedBlock,
			headBlock,
			blocksBehind,
			vaults: { indexed, expected },
		};
	}

	// The check that catches a read model which is finished and wrong. A vault
	// the chain has created and the indexer has not is not a delay — it is a
	// stale schema, a start block set after the vault was deployed, or an
	// indexer pointed at a different factory. All three look like an empty board.
	if (indexed !== null && expected !== null && indexed < expected) {
		return {
			state: "incomplete",
			summary: `The indexer says it has finished, but holds ${indexed} of the ${expected} vaults the factory has created. Waiting will not fix this.`,
			remedy:
				"Check VAULT_FACTORY_ADDRESS_<CHAIN> and VAULT_FACTORY_START_BLOCK_<CHAIN> name the deployment that created them — a start block set after a vault was deployed misses it permanently, and a chain with no factory address configured is not indexed at all — then `bun run indexer:reset` to reindex.",
			indexerUrl,
			historicalComplete: true,
			indexedBlock,
			headBlock,
			blocksBehind,
			vaults: { indexed, expected },
		};
	}

	if (blocksBehind !== null && blocksBehind > IN_SYNC_BLOCKS) {
		return {
			state: "behind",
			summary: `The indexer has finished its backfill but is ${blocksBehind.toLocaleString()} blocks behind the head, so recent deposits and withdrawals may not be shown yet.`,
			remedy:
				"Usually a slow or rate-limited RPC. Check RPC_URL_<CHAIN> — and note that with several chains indexed independently, one slow endpoint puts only its own chain's vaults behind.",
			indexerUrl,
			historicalComplete: true,
			indexedBlock,
			headBlock,
			blocksBehind,
			vaults: { indexed, expected },
		};
	}

	return {
		state: "synced",
		summary:
			expected === null
				? "The indexer is in sync with the chain."
				: `The indexer is in sync with the chain and holds all ${expected} vault${expected === 1 ? "" : "s"}.`,
		remedy: null,
		indexerUrl,
		historicalComplete: true,
		indexedBlock,
		headBlock,
		blocksBehind,
		vaults: { indexed, expected },
	};
}

/**
 * Ponder's own readiness, which is the only source for it.
 *
 * A 503 here is not an error — it is the documented answer for "still
 * backfilling", and treating it as a failure would report a healthy indexer
 * doing exactly what it should as an outage.
 */
async function probeReady(): Promise<{ reachable: boolean; complete: boolean }> {
	try {
		const response = await fetch(`${config.indexerUrl}/ready`, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		return { reachable: true, complete: response.ok };
	} catch {
		return { reachable: false, complete: false };
	}
}

/**
 * The block each chain has reached, from Ponder's `/status`.
 *
 * Keyed by chain name, which is `ChainInfo.key` — the registry calls that
 * agreement out as load-bearing, and this is one of the three places that
 * depends on it. An earlier version took the maximum across the whole object
 * on the grounds that there was only ever one chain; with several, that
 * reported the furthest-ahead chain's block as though it were everyone's, so a
 * stalled chain sitting behind a healthy one looked synced.
 */
async function probeStatusByChain(): Promise<Record<string, number>> {
	try {
		const response = await fetch(`${config.indexerUrl}/status`, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		if (!response.ok) return {};
		const body = (await response.json()) as Record<string, { block?: { number?: number } }>;
		const out: Record<string, number> = {};
		for (const [key, chain] of Object.entries(body ?? {})) {
			const block = chain?.block?.number;
			if (typeof block === "number" && block > 0) out[key] = block;
		}
		return out;
	} catch {
		return {};
	}
}

/** How many vaults the read model is serving for one chain. */
async function probeVaultCount(chainId: number): Promise<number | null> {
	try {
		// Scoped, because the unscoped list is every chain's vaults and comparing
		// that against one factory's count is the mismatch this file exists to
		// report — only inverted, and therefore silent.
		const response = await fetch(`${config.indexerUrl}/vaults?chainId=${chainId}`, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		const body = (await response.json()) as { vaults?: unknown[] };
		return Array.isArray(body.vaults) ? body.vaults.length : null;
	} catch {
		return null;
	}
}

/** A chain's head. Null rather than throwing: a status page reports outages. */
async function chainHead(chainId: number): Promise<number | null> {
	try {
		return Number(await clientFor(chainId).getBlockNumber());
	} catch {
		return null;
	}
}

/**
 * How many vaults the factory has created, from the chain.
 *
 * The ground truth the read model is checked against. Null when no factory is
 * configured or the call fails — unknown, which the caller must not render as a
 * mismatch, because "we could not ask" and "the answer is zero" are different
 * statements and only one of them is an alarm.
 */
async function factoryVaultCount(chainId: number): Promise<number | null> {
	const factory = config.factories[requireChainInfo(chainId).envSuffix];
	if (!factory) return null;
	try {
		const count = await clientFor(chainId).readContract({
			abi: vaultFactoryAbi,
			address: factory,
			functionName: "vaultCount",
		});
		return Number(count);
	} catch {
		return null;
	}
}
