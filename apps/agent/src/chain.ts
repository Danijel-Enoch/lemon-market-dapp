import { type ChainInfo, DEFAULT_CHAIN_ID, requireChainInfo } from "@lemon/core";
import type { Chain } from "viem";
import { defineChain } from "viem";
import { arbitrum, base, xLayer } from "viem/chains";

/**
 * The chain this agent process writes to.
 *
 * **One process serves one chain.** That is the whole design, and it is not a
 * limitation working around a missing feature. Everything the agent does is
 * bound to a single chain at once — the wallet client signs with its id, the
 * USDC it moves is that chain's, the vault it reports NAV to lives there, and
 * the bridge quotes it as the origin. A process that tried to serve several
 * would need a separate client, nonce stream and in-flight ledger per chain, and
 * the failure mode of getting that wrong is not a reverted transaction: reads
 * against an address that holds nothing on this chain return zero, and a NAV of
 * zero reported to a funded vault wipes out every holder's share price.
 *
 * So `AGENT_CHAIN_ID` selects which chain, and the worker skips every vault that
 * is not on it. Run one container per chain with a different value.
 *
 * The id is still validated against the registry rather than trusted. An
 * unknown id would otherwise produce a process that ticks cleanly and skips
 * every vault it sees, which reads as "no vaults configured" rather than as a
 * typo in an environment variable.
 */
export const AGENT_CHAIN: ChainInfo = requireChainInfo(
	process.env.AGENT_CHAIN_ID?.trim() || DEFAULT_CHAIN_ID,
);

const DEFINITIONS: Record<number, Chain> = {
	8453: base,
	42161: arbitrum,
	196: xLayer,
};

/**
 * The endpoint for this agent's chain.
 *
 * `RPC_URL_<CHAIN>` first, then the chain's own legacy name where it has one,
 * then viem's public default. Nothing falls through to another chain's variable:
 * an Arbitrum agent pointed at a Base node would read zero balances from
 * addresses that hold real funds on Arbitrum, which is the NAV-wipe above.
 */
export function agentRpcUrl(): string {
	const suffixed = process.env[`RPC_URL_${AGENT_CHAIN.envSuffix}`]?.trim();
	if (suffixed) return suffixed;

	// The variable that existed when Base was the only chain. Still Base-only.
	if (AGENT_CHAIN.envSuffix === "BASE") {
		const legacy = process.env.BASE_RPC_URL?.trim();
		if (legacy) return legacy;
	}

	return DEFINITIONS[AGENT_CHAIN.id].rpcUrls.default.http[0] as string;
}

/**
 * viem's definition for this agent's chain, with the configured endpoint.
 *
 * Built through `defineChain` on top of viem's own rather than by spreading a
 * literal, so the canonical multicall and contract addresses come along
 * unchanged.
 */
export function resolveAgentChain(): Chain {
	const definition = DEFINITIONS[AGENT_CHAIN.id];
	const rpcUrl = agentRpcUrl();
	if (rpcUrl === definition.rpcUrls.default.http[0]) return definition;

	return defineChain({ ...definition, rpcUrls: { default: { http: [rpcUrl] } } });
}
