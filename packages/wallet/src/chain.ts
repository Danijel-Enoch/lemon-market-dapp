import { allChains, CHAIN_REGISTRY, type ChainId, DEFAULT_CHAIN_ID } from "@lemon/core";
import type { Address, Chain } from "viem";
import { defineChain } from "viem";
import { arbitrum, base, xLayer } from "viem/chains";

/**
 * The chains this build can talk to, and which of them are actually live.
 *
 * This file used to be one chain, pinned, with a comment explaining at length
 * why an id from the environment was a bug rather than a feature. That argument
 * still holds and is why the *set* is still a closed literal below — nothing
 * here accepts a chain id from configuration. What changed is that there is now
 * more than one deployment, so the question is no longer "which chain" but
 * "which of the three known chains has a factory on it".
 *
 * That distinction is what keeps the old guarantee intact. A chain with no
 * configured factory is not offered to the user at all, so switching to it is
 * not something the UI can do — which is the same protection the single-chain
 * pin gave, expressed as a filter rather than as a constant.
 */

/** viem's definition for each chain we know about. Keyed by our own registry's id. */
const DEFINITIONS: Record<ChainId, Chain> = {
	8453: base,
	42161: arbitrum,
	196: xLayer,
};

/**
 * The subset of the build environment this reads.
 *
 * Per-chain and suffixed, because a deployment running Base and Arbitrum needs
 * to point them at different nodes and a single `VITE_CHAIN_RPC_URL` cannot say
 * that. The two unsuffixed names are the ones that existed when there was one
 * chain; they still work, and they still mean Base.
 */
export interface ChainEnv {
	VITE_RPC_URL_BASE?: string;
	VITE_RPC_URL_ARBITRUM?: string;
	VITE_RPC_URL_XLAYER?: string;
	VITE_VAULT_FACTORY_ADDRESS_BASE?: string;
	VITE_VAULT_FACTORY_ADDRESS_ARBITRUM?: string;
	VITE_VAULT_FACTORY_ADDRESS_XLAYER?: string;
	/** The older, narrower names. Still honoured, and still Base, so existing `.env` files work. */
	VITE_CHAIN_RPC_URL?: string;
	VITE_BASE_RPC_URL?: string;
	VITE_VAULT_FACTORY_ADDRESS?: string;
}

function read(source: ChainEnv, key: keyof ChainEnv): string | undefined {
	const trimmed = source[key]?.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * The factory on a chain, or undefined if this deployment has none there.
 *
 * This is the enabled/disabled switch for a whole chain, and deriving it from
 * the factory rather than from a separate `VITE_ENABLED_CHAINS` list is
 * deliberate: two lists that have to agree eventually disagree, and the way
 * that one would fail is a chain offered in the network switcher with nothing
 * deployed on it — a connect flow that dead-ends after the user has already
 * approved a network add.
 */
export function factoryFor(chainId: ChainId, source: ChainEnv): Address | undefined {
	const suffix = CHAIN_REGISTRY[chainId].envSuffix;
	const explicit = read(source, `VITE_VAULT_FACTORY_ADDRESS_${suffix}` as keyof ChainEnv);
	const legacy =
		chainId === DEFAULT_CHAIN_ID ? read(source, "VITE_VAULT_FACTORY_ADDRESS") : undefined;
	return (explicit ?? legacy) as Address | undefined;
}

/** The configured endpoint for a chain, or undefined to use viem's public default. */
function rpcFor(chainId: ChainId, source: ChainEnv): string | undefined {
	const suffix = CHAIN_REGISTRY[chainId].envSuffix;
	const explicit = read(source, `VITE_RPC_URL_${suffix}` as keyof ChainEnv);
	if (explicit) return explicit;
	if (chainId !== DEFAULT_CHAIN_ID) return undefined;
	return read(source, "VITE_CHAIN_RPC_URL") ?? read(source, "VITE_BASE_RPC_URL");
}

/**
 * One chain, with the configured RPC endpoint if there is one.
 *
 * Built through `defineChain` on top of viem's own definition rather than by
 * spreading a literal, so the canonical multicall and contract addresses come
 * along unchanged — those are what wagmi uses for batched reads, and a
 * hand-copied subset that omits them silently costs a round trip per read.
 */
export function buildChain(chainId: ChainId, source: ChainEnv): Chain {
	const definition = DEFINITIONS[chainId];
	const rpcUrl = rpcFor(chainId, source);
	if (!rpcUrl) return definition;

	return defineChain({
		...definition,
		rpcUrls: { default: { http: [rpcUrl] } },
	});
}

export interface EnabledChain {
	chain: Chain;
	factory: Address;
	rpcUrl: string;
}

/**
 * Every chain this deployment has a factory on, in registry order.
 *
 * Order matters more than it looks: the first entry is what wagmi treats as the
 * default network for a fresh connection, and Base is first in the registry.
 * A deployment that wants Arbitrum to be the front door should say so by not
 * configuring a Base factory, not by reordering this.
 */
export function resolveEnabledChains(source: ChainEnv): EnabledChain[] {
	return allChains().flatMap((info) => {
		const factory = factoryFor(info.id, source);
		if (!factory) return [];
		const chain = buildChain(info.id, source);
		return [{ chain, factory, rpcUrl: chain.rpcUrls.default.http[0] as string }];
	});
}

const ENV = import.meta.env as ChainEnv;

/**
 * The chains this build offers, resolved once.
 *
 * Falls back to Base rather than to an empty list. An unconfigured local
 * checkout has no factory anywhere, and an empty `chains` array is not a
 * degraded wagmi config — it is one that throws on construction, so the app
 * would not boot at all rather than boot and tell the developer what is
 * missing. The admin console already has that message; this keeps it reachable.
 */
export const ENABLED_CHAINS: EnabledChain[] = (() => {
	const resolved = resolveEnabledChains(ENV);
	if (resolved.length > 0) return resolved;
	const chain = buildChain(DEFAULT_CHAIN_ID, ENV);
	return [
		{
			chain,
			factory: "0x0000000000000000000000000000000000000000",
			rpcUrl: chain.rpcUrls.default.http[0] as string,
		},
	];
})();

/**
 * The chain a fresh session starts on.
 *
 * Still named `APP_CHAIN` because most of the app genuinely does mean "the one
 * we are on" — a deposit panel, a network-mismatch banner. Only code that works
 * across vaults from different chains needs the full list.
 */
export const APP_CHAIN: Chain = ENABLED_CHAINS[0].chain;
export const APP_CHAIN_RPC_URL: string = ENABLED_CHAINS[0].rpcUrl;

export function isEnabledChain(chainId: number | undefined): boolean {
	return ENABLED_CHAINS.some((entry) => entry.chain.id === chainId);
}

export function enabledChain(chainId: number | undefined): EnabledChain | undefined {
	return ENABLED_CHAINS.find((entry) => entry.chain.id === chainId);
}
