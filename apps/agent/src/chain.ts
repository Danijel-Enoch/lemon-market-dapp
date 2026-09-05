import type { Chain } from "viem";
import { defineChain } from "viem";
import { base } from "viem/chains";

/**
 * The chain this agent writes to: Base mainnet.
 *
 * Not selectable by id. The agent signs transactions against the vault
 * contracts, KyberSwap's router and Circle's USDC, all of which exist on Base
 * mainnet — so a configurable chain id could only ever point this process at a
 * network where every transaction it sends reverts, while its logs read as
 * ordinary failures.
 *
 * The endpoint is still configurable. `BASE_RPC_URL` swaps which node the agent
 * talks to without changing which chain it is on, which is the only part of
 * this a deployment genuinely chooses.
 */
export function resolveAgentChain(): Chain {
	const rpcUrl = process.env.BASE_RPC_URL?.trim();
	if (!rpcUrl) return base;

	return defineChain({
		...base,
		rpcUrls: { default: { http: [rpcUrl] } },
	});
}
