import { describe, expect, it } from "bun:test";
import { classifyIndexer, type IndexerProbe } from "../src/services/indexer-health";

/**
 * The verdict the operator console leads with.
 *
 * Worth testing exhaustively because the states are easy to confuse and the
 * consequence of confusing them is an operator sent to do the wrong thing: a
 * reset on a healthy backfill throws away an hour's work, and a shrug at a
 * genuinely broken read model leaves the whole dashboard quietly lying.
 */

const HEAD = 51_000_000;

function probe(overrides: Partial<IndexerProbe> = {}): IndexerProbe {
	return {
		indexerUrl: "http://localhost:42069",
		reachable: true,
		historicalComplete: true,
		indexedBlock: HEAD,
		headBlock: HEAD,
		indexedVaults: 3,
		expectedVaults: 3,
		...overrides,
	};
}

describe("classifyIndexer", () => {
	it("is in sync when it has caught up and holds every vault", () => {
		const health = classifyIndexer(probe());
		expect(health.state).toBe("synced");
		expect(health.remedy).toBeNull();
	});

	it("reports nothing answering as unreachable", () => {
		const health = classifyIndexer(probe({ reachable: false }));
		expect(health.state).toBe("unreachable");
		// The distinction the whole card exists to draw.
		expect(health.summary).toContain("missing rather than zero");
	});

	/**
	 * Ponder serves before it is ready. During that window the tables may not
	 * exist at all, so every figure is legitimately absent rather than wrong.
	 */
	it("reports an unfinished backfill as catching up", () => {
		const health = classifyIndexer(
			probe({ historicalComplete: false, indexedBlock: HEAD - 40_000, indexedVaults: 0 }),
		);
		expect(health.state).toBe("backfilling");
		expect(health.blocksBehind).toBe(40_000);
	});

	/**
	 * The one that matters, and the exact state that made an empty board look
	 * like a protocol nobody had deposited into: finished, answering happily, and
	 * missing vaults the chain says exist.
	 */
	it("catches a read model that has finished and is still missing vaults", () => {
		const health = classifyIndexer(probe({ indexedVaults: 0, expectedVaults: 3 }));
		expect(health.state).toBe("incomplete");
		expect(health.summary).toContain("0 of the 3");
		expect(health.remedy).toContain("VAULT_FACTORY_START_BLOCK");
	});

	/**
	 * A backfill that has not reached the vaults yet is not a misconfiguration.
	 * Reporting it as one would send an operator to reset a healthy sync.
	 */
	it("does not call a mid-backfill shortfall a misconfiguration", () => {
		const health = classifyIndexer(
			probe({ historicalComplete: false, indexedVaults: 0, expectedVaults: 3 }),
		);
		expect(health.state).toBe("backfilling");
	});

	/**
	 * "We could not ask the chain" and "the chain says zero" are different
	 * statements, and only one of them is an alarm. An unknown expectation must
	 * never raise a mismatch.
	 */
	it("treats an unknown vault count as unknown rather than as a mismatch", () => {
		const health = classifyIndexer(probe({ indexedVaults: 0, expectedVaults: null }));
		expect(health.state).toBe("synced");
		expect(health.vaults.expected).toBeNull();
	});

	it("does not raise a mismatch when the indexer holds more than the factory reports", () => {
		// Can happen for a moment around a creation the RPC has not caught up with.
		expect(classifyIndexer(probe({ indexedVaults: 4, expectedVaults: 3 })).state).toBe("synced");
	});

	it("reports ordinary lag as behind", () => {
		const health = classifyIndexer(probe({ indexedBlock: HEAD - 500 }));
		expect(health.state).toBe("behind");
		expect(health.blocksBehind).toBe(500);
	});

	/** A block or two is a poll interval, not an incident. */
	it("tolerates a few blocks of lag", () => {
		expect(classifyIndexer(probe({ indexedBlock: HEAD - 5 })).state).toBe("synced");
	});

	/**
	 * Ordering: a broken read model outranks lag. Both are true here, and sending
	 * an operator to look at their RPC would waste the trip.
	 */
	it("reports a missing vault ahead of the lag that comes with it", () => {
		const health = classifyIndexer(probe({ indexedBlock: HEAD - 5_000, indexedVaults: 1 }));
		expect(health.state).toBe("incomplete");
	});

	it("never claims a lag it could not measure", () => {
		const health = classifyIndexer(probe({ headBlock: null }));
		expect(health.blocksBehind).toBeNull();
		expect(health.state).toBe("synced");
	});
});
