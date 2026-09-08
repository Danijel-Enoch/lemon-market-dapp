import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { config } from "./config";

/**
 * The one Base client this process reads through.
 *
 * Every RPC read in the API used to build its own client inline — six call
 * sites, a fresh `createPublicClient` per request. That is what a 429 from the
 * public node is actually reporting: nothing was shared, so nothing could be
 * batched or deduplicated, and the two `balanceOf` calls a single vault page
 * needs went out as two separate HTTP round trips to an endpoint that counts
 * them per IP.
 *
 * Constructed once here instead, with three things a per-call client could not
 * have had:
 *
 *  - **A chain.** The old clients passed none, so viem did not know where Base's
 *    multicall3 lives and could not have batched contract reads even if asked.
 *  - **Multicall.** Concurrent `readContract` calls collapse into one
 *    `aggregate3`. This is why the legs in `getLivePosition` are now issued
 *    together rather than one after another — sequential awaits cannot batch.
 *  - **Somewhere else to go.** `BASE_RPC_FALLBACK_URLS` is tried in order when
 *    the primary fails, which for a rate limit is the difference between a
 *    degraded page and a correct one.
 */

/** Primary first, then the configured fallbacks. Duplicates would retry the same node twice. */
const endpoints = [...new Set([config.baseRpcUrl, ...config.baseRpcFallbackUrls])];

/**
 * One pass over the endpoints, not three.
 *
 * `fallback` carries its own `retryCount`, and it re-runs the *whole* list —
 * three passes over three endpoints is nine attempts at a node that is already
 * refusing us, which is how a rate limit becomes self-sustaining. Each endpoint
 * keeps its own retries instead (viem backs off on 429 and honours
 * `Retry-After`), and when those are spent we move to the next one rather than
 * starting the list over.
 */
const transport = fallback(
	endpoints.map((url) => http(url, { batch: config.baseRpcBatch, retryCount: 3, retryDelay: 250 })),
	{ retryCount: 0 },
);

export const baseClient = createPublicClient({
	chain: base,
	transport,
	// A short window rather than zero. Reads issued in one `Promise.all` land in
	// the same tick and would batch either way, but 16ms also catches the two
	// callers that ask for overlapping data a render apart.
	batch: { multicall: { wait: 16 } },
});

export type BaseClient = typeof baseClient;
