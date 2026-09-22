import type { SpotTokenInfo, TokenRoutability } from "@lemon/core";
import { DEFAULT_CHAIN_ID, requireChainInfo } from "@lemon/core";
import { pairTokensWithMarkets, probeAllTokens, spotTokensFor } from "@lemon/registry";
import { TtlCache } from "../cache";
import { clients } from "../config";
import { getTokenLogos } from "./logos";
import { getMarkets } from "./markets";

export type SpotToken = SpotTokenInfo;

/**
 * One probe cache per chain, created on first use.
 *
 * Per chain rather than one shared cache because the probes are per chain: a
 * token's routability is a fact about its own pools, and merging the results
 * would have Arbitrum's WETH answer for Base's. Keyed by chain id, which is
 * also what stops a cache miss on one chain invalidating another's.
 *
 * Probes cost one aggregator call per token per direction — and on X Layer up
 * to three, since LI.FI may try the USDG hop — so they are refreshed on a
 * 5-minute cycle rather than per request. Liquidity does not appear or vanish
 * faster than that in practice.
 */
const routabilityCaches = new Map<number, TtlCache<TokenRoutability[]>>();

function routabilityFor(chainId: number): TtlCache<TokenRoutability[]> {
	const existing = routabilityCaches.get(chainId);
	if (existing) return existing;

	const cache = new TtlCache<TokenRoutability[]>(
		() => probeAllTokens(clients.aggregatorFor(chainId), spotTokensFor(chainId)),
		5 * 60_000,
	);
	routabilityCaches.set(chainId, cache);
	return cache;
}

export interface SpotTokenList {
	tokens: SpotToken[];
	/**
	 * False while the first routability probe is still running. The UI uses it
	 * to say "checking liquidity" instead of rendering every token as
	 * unavailable, which would be actively wrong.
	 */
	routabilityKnown: boolean;
}

/**
 * One chain's spot catalog.
 *
 * The chain is explicit and defaults to this deployment's primary one, because
 * most callers are the Base-facing board that predates there being a choice.
 * Anything scoped to a vault passes the vault's chain.
 */
export async function getSpotTokens(
	chainId: number = DEFAULT_CHAIN_ID,
	force = false,
): Promise<SpotTokenList> {
	const chain = requireChainInfo(chainId);
	const routabilityCache = routabilityFor(chain.id);

	const [markets, logos] = await Promise.all([
		getMarkets(),
		getTokenLogos().catch(() => new Map<string, string>()),
	]);
	const paired = pairTokensWithMarkets(markets, spotTokensFor(chain.id));

	// The first probe takes a few seconds. Rather than block the catalog behind
	// it, serve what we have and let the probe fill in — a cached result is used
	// when present, otherwise the refresh runs in the background.
	let routability = routabilityCache.peek();
	if (force || !routability) {
		const pending = routabilityCache.get(force).catch(() => [] as TokenRoutability[]);
		if (routability === null) {
			// Nothing cached at all: wait briefly so a fast probe still lands on
			// the first paint, but do not hold the response open indefinitely.
			routability = await Promise.race([
				pending,
				new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
			]);
		}
	}

	const bySymbol = new Map((routability ?? []).map((entry) => [entry.symbol, entry]));

	return {
		routabilityKnown: routability !== null,
		tokens: paired.map((token) => {
			const probe = bySymbol.get(token.symbol);
			return {
				...token,
				logoUrl: logos.get(token.symbol.toUpperCase()) ?? null,
				buyable: probe?.buyable ?? false,
				sellable: probe?.sellable ?? false,
				buyPriceImpactPercent: probe?.buyPriceImpactPercent ?? null,
				spotPriceUsd: probe?.spotPriceUsd ?? null,
				// A failed probe is reported as such rather than as "no liquidity".
				probeFailed: probe?.probeFailed ?? false,
				routabilityCheckedAt: probe?.checkedAt ?? null,
			};
		}),
	};
}

export async function getSpotToken(
	symbol: string,
	chainId: number = DEFAULT_CHAIN_ID,
): Promise<SpotToken | undefined> {
	const target = symbol.trim().toUpperCase();
	const { tokens } = await getSpotTokens(chainId);
	return tokens.find((token) => token.symbol.toUpperCase() === target);
}

export function findSeedToken(symbol: string, chainId: number = DEFAULT_CHAIN_ID) {
	const target = symbol.trim().toUpperCase();
	return spotTokensFor(chainId).find((token) => token.symbol.toUpperCase() === target);
}

/** Drop cached probes. Every chain when none is named — an operator forcing a refresh means all of it. */
export function invalidateRoutability(chainId?: number): void {
	if (chainId === undefined) {
		for (const cache of routabilityCaches.values()) cache.invalidate();
		return;
	}
	routabilityCaches.get(chainId)?.invalidate();
}
