import { defineChain } from "viem";
import { base } from "viem/chains";
import type { Chain } from "wagmi/chains";

/**
 * The one chain this app talks to: Base mainnet.
 *
 * Not configurable by id, and that is the point. The vault contracts, the USDC
 * this system settles in, KyberSwap's aggregator and the Relay routes the agent
 * bridges over all exist on Base mainnet and nowhere else — so an id read from
 * the environment could only ever name a chain where every write reverts, while
 * the UI carried on looking healthy. The chain is a fact about the deployment,
 * so it is spelled out here rather than accepted from a build variable.
 *
 * The RPC *endpoint* is still configurable, because that is a real operational
 * choice: a public endpoint rate-limits, and a deployment doing meaningful
 * volume wants its own. Same chain, different door.
 */

/** The subset of the build environment this reads. */
export interface ChainEnv {
	VITE_CHAIN_RPC_URL?: string;
	/** The older, narrower variable. Still honoured so existing `.env` files work. */
	VITE_BASE_RPC_URL?: string;
}

/**
 * Base mainnet, with the configured RPC endpoint if there is one.
 *
 * Built through `defineChain` on top of viem's `base` rather than by spreading
 * a literal, so the canonical multicall and contract addresses come along
 * unchanged — those are what wagmi uses for batched reads, and a hand-copied
 * subset that omits them silently costs a round trip per read.
 */
export function buildChain(source: ChainEnv): Chain {
	const read = (key: keyof ChainEnv) => {
		const trimmed = source[key]?.trim();
		return trimmed ? trimmed : undefined;
	};

	const rpcUrl = read("VITE_CHAIN_RPC_URL") ?? read("VITE_BASE_RPC_URL");
	if (!rpcUrl) return base;

	return defineChain({
		...base,
		rpcUrls: { default: { http: [rpcUrl] } },
	});
}

/** The one chain every wallet interaction in this build targets. */
export const APP_CHAIN: Chain = buildChain(import.meta.env as ChainEnv);

export const APP_CHAIN_RPC_URL = APP_CHAIN.rpcUrls.default.http[0];
