import type { SpotTokenInfo, TokenRoutability } from "@lemon/core";
import { pairTokensWithMarkets, probeAllTokens, SPOT_TOKENS } from "@lemon/registry";
import { TtlCache } from "../cache";
import { clients } from "../config";
import { getTokenLogos } from "./logos";
import { getMarkets } from "./markets";

export type SpotToken = SpotTokenInfo;

/**
 * Routability probes cost one KyberSwap call per token per direction, so they
 * are refreshed on a 5-minute cycle rather than per request. Liquidity does not
 * appear or vanish faster than that in practice.
 */
const routabilityCache = new TtlCache<TokenRoutability[]>(
	() => probeAllTokens(clients.kyber),
	5 * 60_000,
);

export interface SpotTokenList {
	tokens: SpotToken[];
	/**
	 * False while the first routability probe is still running. The UI uses it
	 * to say "checking liquidity" instead of rendering every token as
	 * unavailable, which would be actively wrong.
	 */
	routabilityKnown: boolean;
}

export async function getSpotTokens(force = false): Promise<SpotTokenList> {
	const [markets, logos] = await Promise.all([
		getMarkets(),
		getTokenLogos().catch(() => new Map<string, string>()),
	]);
	const paired = pairTokensWithMarkets(markets);

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

export async function getSpotToken(symbol: string): Promise<SpotToken | undefined> {
	const target = symbol.trim().toUpperCase();
	const { tokens } = await getSpotTokens();
	return tokens.find((token) => token.symbol.toUpperCase() === target);
}

export function findSeedToken(symbol: string) {
	const target = symbol.trim().toUpperCase();
	return SPOT_TOKENS.find((token) => token.symbol.toUpperCase() === target);
}

export function invalidateRoutability(): void {
	routabilityCache.invalidate();
}
