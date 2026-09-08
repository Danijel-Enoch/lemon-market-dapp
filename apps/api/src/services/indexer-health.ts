import { vaultFactoryAbi } from "@lemon/contracts";
import { baseClient } from "../chain";
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

export interface IndexerHealth {
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

/**
 * Ask the indexer and the chain, and reconcile the two.
 *
 * Every probe is individually allowed to fail. A degraded answer that names
 * which half is missing is more useful to an operator than an exception, and
 * this is a status endpoint — it reporting an outage as a 500 would be its own
 * small joke.
 */
export async function indexerHealth(): Promise<IndexerHealth> {
	const [ready, indexedBlock, indexed, expected] = await Promise.all([
		probeReady(),
		probeStatus(),
		probeVaultCount(),
		factoryVaultCount(),
	]);

	// The head is only worth asking for once we know there is something to
	// compare it against; an unreachable indexer is unreachable whatever the
	// chain is doing.
	const headBlock = ready.reachable ? await chainHead() : null;

	return classifyIndexer({
		indexerUrl: config.indexerUrl,
		reachable: ready.reachable,
		historicalComplete: ready.complete,
		indexedBlock,
		headBlock,
		indexedVaults: indexed,
		expectedVaults: expected,
	});
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
export function classifyIndexer(probe: IndexerProbe): IndexerHealth {
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
				"Check VAULT_FACTORY_ADDRESS and VAULT_FACTORY_START_BLOCK name the deployment that created them — a start block set after a vault was deployed misses it permanently — then `bun run indexer:reset` to reindex.",
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
			remedy: "Usually a slow or rate-limited RPC. Check BASE_RPC_URL.",
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

/** The highest block the read model has processed, from Ponder's `/status`. */
async function probeStatus(): Promise<number | null> {
	try {
		const response = await fetch(`${config.indexerUrl}/status`, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		const body = (await response.json()) as Record<string, { block?: { number?: number } }>;
		// Keyed by chain name rather than id, and this deployment has exactly one
		// chain — so the highest of whatever is there is the answer without having
		// to agree with Ponder about what the chain is called.
		const blocks = Object.values(body)
			.map((chain) => chain?.block?.number)
			.filter((n): n is number => typeof n === "number" && n > 0);
		return blocks.length ? Math.max(...blocks) : null;
	} catch {
		return null;
	}
}

/** How many vaults the read model is actually serving. */
async function probeVaultCount(): Promise<number | null> {
	try {
		const response = await fetch(`${config.indexerUrl}/vaults`, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		const body = (await response.json()) as { vaults?: unknown[] };
		return Array.isArray(body.vaults) ? body.vaults.length : null;
	} catch {
		return null;
	}
}

/** The chain's head. Null rather than throwing: a status page reports outages. */
async function chainHead(): Promise<number | null> {
	try {
		return Number(await baseClient.getBlockNumber());
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
async function factoryVaultCount(): Promise<number | null> {
	const factory = config.contracts.vaultFactory;
	if (!factory) return null;
	try {
		const count = await baseClient.readContract({
			abi: vaultFactoryAbi,
			address: factory,
			functionName: "vaultCount",
		});
		return Number(count);
	} catch {
		return null;
	}
}
