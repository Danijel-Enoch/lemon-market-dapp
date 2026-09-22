import { allChains, type ChainId, DEFAULT_CHAIN_ID, requireChainInfo } from "@lemon/core";
import { type Chain, createPublicClient, fallback, http, type PublicClient } from "viem";
import { arbitrum, base, xLayer } from "viem/chains";
import { config } from "./config";

/**
 * One read client per chain, built once.
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
 *  - **A chain.** The old clients passed none, so viem did not know where
 *    multicall3 lives and could not have batched contract reads even if asked.
 *  - **Multicall.** Concurrent `readContract` calls collapse into one
 *    `aggregate3`. This is why the legs in `getLivePosition` are now issued
 *    together rather than one after another — sequential awaits cannot batch.
 *  - **Somewhere else to go.** The chain's fallback list is tried in order when
 *    the primary fails, which for a rate limit is the difference between a
 *    degraded page and a correct one.
 *
 * One per chain rather than one shared client, because a client carries the
 * chain it reads from. A single client asked for an Arbitrum address's balance
 * would answer with that address's balance *on Base* — which for an agent
 * wallet, whose address is identical on both, is a real number about the wrong
 * chain, and reads as a funded wallet when the one that matters is empty.
 */

const DEFINITIONS: Record<ChainId, Chain> = {
	8453: base,
	42161: arbitrum,
	196: xLayer,
};

function buildClient(chainId: ChainId): PublicClient {
	const info = requireChainInfo(chainId);
	const endpoints = config.rpc[info.envSuffix];

	/**
	 * One pass over the endpoints, not three.
	 *
	 * `fallback` carries its own `retryCount`, and it re-runs the *whole* list —
	 * three passes over three endpoints is nine attempts at a node that is
	 * already refusing us, which is how a rate limit becomes self-sustaining.
	 * Each endpoint keeps its own retries instead (viem backs off on 429 and
	 * honours `Retry-After`), and when those are spent we move to the next one
	 * rather than starting the list over.
	 */
	const transport = fallback(
		endpoints.map((url) => http(url, { batch: config.rpcBatch, retryCount: 3, retryDelay: 250 })),
		{ retryCount: 0 },
	);

	return createPublicClient({
		chain: DEFINITIONS[chainId],
		transport,
		// A short window rather than zero. Reads issued in one `Promise.all` land
		// in the same tick and would batch either way, but 16ms also catches the
		// two callers that ask for overlapping data a render apart.
		batch: { multicall: { wait: 16 } },
	}) as PublicClient;
}

const clients = new Map<number, PublicClient>(
	allChains().map((info) => [info.id, buildClient(info.id)]),
);

/**
 * The client for one chain.
 *
 * Throws on an unknown id rather than falling back to Base. A fallback here
 * would not surface anywhere: the read succeeds, returns a plausible number for
 * the same address on the wrong chain, and every figure derived from it looks
 * ordinary.
 */
export function clientFor(chainId: number): PublicClient {
	const client = clients.get(requireChainInfo(chainId).id);
	if (!client) throw new Error(`No RPC client for chain ${chainId}.`);
	return client;
}

/**
 * Base's client, under the name the rest of the API already uses.
 *
 * Retained because a good deal of this service genuinely is Base-specific — the
 * spot token registry and the KyberSwap routes are Base-side by construction —
 * and rewriting those call sites to `clientFor(8453)` would say less, not more.
 * Anything that reads *a vault's* chain must use `clientFor` instead.
 */
export const baseClient: PublicClient = clientFor(DEFAULT_CHAIN_ID);

export type BaseClient = typeof baseClient;
