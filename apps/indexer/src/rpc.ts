/**
 * Which Base endpoints the indexer is allowed to spend.
 *
 * Ponder does not treat its `rpc` list as "primary, then spares". It opens one
 * bucket per URL, measures each one's real requests-per-second by pushing until
 * it is refused, weights selection by observed latency, and on a 429 or a
 * timeout deactivates that bucket and retries the same request against a
 * different one. So the list is a *budget*, not a failover chain: two endpoints
 * is roughly twice the backfill throughput, and one endpoint is a backfill that
 * runs at whatever a shared public node will give a single IP.
 *
 * That is the failure this file exists to fix. With one URL configured, a
 * backfill saturates it in seconds and Ponder then logs
 *
 *   WARN Unable to find available JSON-RPC provider within expected time
 *        rate_limit=[3.47] is_active=[true] is_warming_up=[false]
 *
 * every fifteen seconds, forever. The single-element arrays in that line are the
 * diagnosis — there was only ever one bucket to pick from, it had been throttled
 * down to three requests a second, and no amount of waiting produces a second
 * one. There is no knob that raises the limit; the only fix is more endpoints.
 */

/**
 * The variables this reads, passed in rather than read, so it can be tested.
 *
 * The index signature is what lets `process.env` be handed over as-is instead of
 * cast — every name below is optional, and TypeScript rejects a whole
 * `ProcessEnv` against a type of nothing but optional properties.
 */
export interface RpcEnv {
	PONDER_RPC_URL_BASE?: string;
	RPC_URL_BASE?: string;
	BASE_RPC_URL?: string;
	BASE_RPC_FALLBACK_URLS?: string;
	[name: string]: string | undefined;
}

/**
 * Where to read from when nothing is configured. One endpoint per chain, and not
 * for want of looking.
 *
 * The obvious fix to the stall above is to ship a list of the well-known free
 * endpoints, so an unconfigured deployment gets several buckets instead of one.
 * That was tried on Base, and it does not work — not because the endpoints are
 * slow or rate-limited, but because none of them answers the query this indexer
 * is built on.
 *
 * `LemonVault` is a `factory()` source, so following it means asking for the
 * logs of *every vault at once*: one `eth_getLogs` carrying an array of child
 * addresses and an array of fourteen topics. Against that exact request, on a
 * range Ponder itself chose:
 *
 *   mainnet.base.org               ok
 *   base.gateway.tenderly.co       -32602 invalid params
 *   base-rpc.publicnode.com        -32602 archive requests require a token
 *   base.meowrpc.com               -32000 eth_getLogs is not supported
 *   base-mainnet.public.blastapi.io -32600 up to a 10 block range
 *   base-pokt.nodies.app           -32001 block range too large, max 50
 *   base.drpc.org                  19     temporary internal error
 *
 * Several of those pass a naive check — they answer `eth_chainId`, they serve
 * archive state, they handle a single-address `eth_getLogs` over 500 blocks —
 * and fail only on the shape that matters. Two fail with `-32602`, which viem
 * classifies as a caller error rather than a transient one, so Ponder does not
 * retry and does not shrink the range: the rejection reaches the top as an
 * unhandled rejection and the process exits. Adding those endpoints does not
 * make the indexer more resilient, it makes it crash — and under
 * `restart: unless-stopped`, crash repeatedly.
 *
 * The Arbitrum and X Layer defaults below are each that chain's canonical public
 * endpoint and have **not** been through the test above. Send them the
 * multi-address, multi-topic request before trusting either with a backfill; on
 * X Layer especially, assume you will need a keyed provider.
 */
export const DEFAULT_RPC_URLS: Record<string, readonly string[]> = {
	BASE: ["https://mainnet.base.org"],
	ARBITRUM: ["https://arb1.arbitrum.io/rpc"],
	XLAYER: ["https://rpc.xlayer.tech"],
};

/** Retained under its original name: one chain's default is still a list of one. */
export const DEFAULT_BASE_RPC_URLS = DEFAULT_RPC_URLS.BASE;

/** Comma separated, trimmed, blanks dropped. One URL is just a list of one. */
function list(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

/**
 * The endpoints to hand Ponder for one chain, in the order they were configured.
 *
 * `PONDER_RPC_URL_<CHAIN>` replaces the app-wide endpoint rather than adding to
 * it, which is the meaning it already had — the indexer's load is not the API's,
 * and an endpoint bought for the backfill should not have the app's shared node
 * quietly appended to it. `<CHAIN>_RPC_FALLBACK_URLS` is added in both cases,
 * because it is the chain-wide "here is more capacity" list and the indexer is
 * the process that needs it most.
 *
 * The app-wide endpoint is `RPC_URL_<CHAIN>` — the name `.env.example`, both
 * compose files, `scripts/deploy-contracts.sh` and the agent use — with
 * `<CHAIN>_RPC_URL` read after it because `BASE_RPC_URL` is that name for Base
 * and predates the suffix. Reading only the older spelling is how a deployment
 * that set `RPC_URL_XLAYER` everywhere backfills X Layer from the public node
 * anyway, at the few requests a second it will give a single IP.
 *
 * Emptiness is decided after trimming, not with `??`. Compose writes
 * `PONDER_RPC_URL_BASE: ${PONDER_RPC_URL_BASE:-}` for an unset variable, and an
 * empty string is not nullish — so a nullish-coalescing chain reads it as a
 * deliberate choice, skips `BASE_RPC_URL`, and configures the chain with no
 * endpoint at all.
 *
 * Deduplicated because Ponder would otherwise open two buckets against one node
 * and measure each at the full rate — which double-counts capacity that does not
 * exist, and is how a list that looks redundant gets throttled anyway.
 *
 * Nothing here falls back to another chain's variables. An Arbitrum source
 * configured with `BASE_RPC_URL` would backfill cleanly against a chain that has
 * no factory on it and serve an empty app, which is the exact failure the whole
 * per-chain split exists to prevent.
 */
export function resolveRpc(envSuffix: string, env: RpcEnv): string[] {
	const primary = list(env[`PONDER_RPC_URL_${envSuffix}`]);
	const shared = [...list(env[`RPC_URL_${envSuffix}`]), ...list(env[`${envSuffix}_RPC_URL`])];
	const configured = [
		...(primary.length > 0 ? primary : shared),
		...list(env[`${envSuffix}_RPC_FALLBACK_URLS`]),
	];

	const endpoints = [...new Set(configured)];
	if (endpoints.length > 0) return endpoints;

	const fallback = DEFAULT_RPC_URLS[envSuffix];
	if (!fallback) {
		throw new Error(
			`No RPC endpoint configured for ${envSuffix} and no default to fall back on. Set PONDER_RPC_URL_${envSuffix}.`,
		);
	}
	return [...fallback];
}

/** Base's endpoints. Kept as its own name because most callers still mean Base. */
export function resolveBaseRpc(env: RpcEnv): string[] {
	return resolveRpc("BASE", env);
}
