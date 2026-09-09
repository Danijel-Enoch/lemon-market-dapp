import { numberFromEnv } from "./economics";

/**
 * How long to leave an action alone after it has just failed.
 *
 * The tick loop has no memory. It sleeps a minute, rebuilds the whole picture
 * from chain state, and reaches the same conclusion — which is exactly right for
 * a healthy vault and exactly wrong for one whose forced action cannot succeed.
 * A deleverage that reverts, a rebalance the venue rejects as too small, a swap
 * with no route: each of them is re-decided sixty seconds later, re-executed,
 * and re-failed, at up to fourteen hundred attempts a day. Every attempt that
 * gets far enough to place one leg pays for that leg.
 *
 * So a failure buys silence. Not a lock — the action is still permitted, still
 * offered, still the right thing to want — but the agent stops paying to
 * discover that it is still impossible, and backs off further each time it is
 * proved right.
 *
 * **Keyed per action and per market, not per vault.** A rebalance that cannot be
 * placed on NVDA says nothing about whether a redemption can be paid out of
 * TSLA, and one failing leg must never quiet the whole vault.
 *
 * **Cleared by success, and by anything else working.** The backoff is about one
 * action being stuck, not about the vault being unwell, so a completed attempt
 * wipes it entirely rather than halving it.
 */

/** The first wait after a failure. Two ticks, so a transient blip costs one skip. */
export const COOLDOWN_BASE_SECONDS = numberFromEnv("COOLDOWN_BASE_SECONDS", 120);

/**
 * The longest the agent will wait before trying again.
 *
 * Bounded because a cooldown is a way of being patient, not a way of giving up.
 * Conditions the agent cannot influence — a dry pool, a venue minimum a growing
 * position will eventually clear, a market that reopens — resolve on their own
 * schedule, and an unbounded backoff would still be asleep when they did.
 */
export const COOLDOWN_MAX_SECONDS = numberFromEnv("COOLDOWN_MAX_SECONDS", 1800); // 30 min

export interface ActionCooldown {
	/**
	 * Seconds until this action may be attempted again; zero when it is clear.
	 *
	 * Returns the remaining time rather than a boolean so the caller can say how
	 * long it is waiting. "REBALANCE NVDA is backing off" is a shrug; "backing off
	 * for another 7 minutes after 3 failures" is something an operator can act on.
	 */
	blockedFor(key: string): number;
	/** Record a failure and extend the wait. */
	failed(key: string): void;
	/** Record a success and clear the wait entirely. */
	succeeded(key: string): void;
	/** How many consecutive failures stand against this key. For log lines. */
	failures(key: string): number;
}

/** How an action is named for the purposes of backing off. */
export function cooldownKey(kind: string, market: string | null): string {
	return `${kind}:${market ?? "-"}`;
}

interface Entry {
	failures: number;
	/** Unix seconds before which the action is not attempted. */
	until: number;
}

/**
 * In-memory, and deliberately not persisted.
 *
 * A restart clears every backoff, which is the behaviour worth having: the most
 * common reason an operator restarts the agent is that they have just fixed the
 * thing it was failing on, and a cooldown that survived that would make the fix
 * look like it had not worked.
 */
export function createCooldown(
	now: () => number = () => Math.floor(Date.now() / 1000),
): ActionCooldown {
	const entries = new Map<string, Entry>();

	return {
		blockedFor(key) {
			const entry = entries.get(key);
			if (!entry) return 0;
			const remaining = entry.until - now();
			return remaining > 0 ? remaining : 0;
		},

		failed(key) {
			const entry = entries.get(key) ?? { failures: 0, until: 0 };
			entry.failures += 1;
			// Doubling from the base, capped. The exponent is one less than the
			// failure count so the first failure waits the base interval rather than
			// twice it — the common case is a transient upstream error, and making
			// the cheapest recovery the slowest one would be backwards.
			const backoff = Math.min(
				COOLDOWN_MAX_SECONDS,
				COOLDOWN_BASE_SECONDS * 2 ** (entry.failures - 1),
			);
			entry.until = now() + backoff;
			entries.set(key, entry);
		},

		succeeded(key) {
			entries.delete(key);
		},

		failures(key) {
			return entries.get(key)?.failures ?? 0;
		},
	};
}
