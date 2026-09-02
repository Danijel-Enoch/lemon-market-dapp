import { basketApi, carryApi, depositApi, marketsApi, perpApi, spotApi } from "@app/lib/api";
import { useQuery } from "@tanstack/react-query";

/** Pair catalog changes rarely; funding within it moves on a ~5s upstream cycle. */
export function useMarkets(assetClass?: "equity" | "fx") {
	return useQuery({
		queryKey: ["markets", assetClass ?? "all"],
		queryFn: () => marketsApi.list(assetClass),
		refetchInterval: 30_000,
		staleTime: 15_000,
	});
}

export function useMarket(symbol: string | undefined) {
	return useQuery({
		queryKey: ["market", symbol],
		queryFn: () => marketsApi.get(symbol as string),
		enabled: Boolean(symbol),
		refetchInterval: 15_000,
	});
}

/**
 * Routability probes are expensive upstream (two KyberSwap calls per token), so
 * the server caches them for 5 minutes. Polling faster than that here would
 * just return the same cached answer.
 */
export function useSpotTokens() {
	return useQuery({
		queryKey: ["spot-tokens"],
		queryFn: () => spotApi.tokens(),
		// Poll quickly while the first routability probe is still running, then
		// settle back — the server caches results for 5 minutes, so anything
		// faster than that afterwards just re-reads the same cache.
		refetchInterval: (query) =>
			query.state.data && query.state.data.routabilityKnown === false ? 3_000 : 60_000,
		staleTime: 30_000,
	});
}

export function usePerpPositions(trader: string | undefined) {
	return useQuery({
		queryKey: ["perp-positions", trader],
		queryFn: () => perpApi.positions(trader as string),
		enabled: Boolean(trader),
		refetchInterval: 15_000,
	});
}

export function useSpotLimitOrders(
	maker: string | undefined,
	status: "active" | "filled" | "cancelled" = "active",
) {
	return useQuery({
		queryKey: ["spot-limit-orders", maker, status],
		queryFn: () => spotApi.limitOrders(maker as string, status),
		enabled: Boolean(maker),
		refetchInterval: 20_000,
	});
}

export function useBaskets() {
	return useQuery({
		queryKey: ["baskets"],
		queryFn: () => basketApi.list(),
		refetchInterval: 60_000,
	});
}

export function useBasket(id: string | undefined) {
	return useQuery({
		queryKey: ["basket", id],
		queryFn: () => basketApi.get(id as string),
		enabled: Boolean(id),
		refetchInterval: 30_000,
	});
}

export function useCarryCandidates() {
	return useQuery({
		queryKey: ["carry-candidates"],
		queryFn: () => carryApi.candidates(),
		refetchInterval: 60_000,
	});
}

export function useCarryPositions(user: string | undefined) {
	return useQuery({
		queryKey: ["carry-positions", user],
		queryFn: () => carryApi.list(user as string),
		enabled: Boolean(user),
		refetchInterval: 20_000,
	});
}

export function useCarryPosition(id: string | undefined) {
	return useQuery({
		queryKey: ["carry-position", id],
		queryFn: () => carryApi.get(id as string),
		enabled: Boolean(id),
		refetchInterval: 15_000,
	});
}

/**
 * Half-open carry positions.
 *
 * Polled independently of the carry list so the warning can appear anywhere in
 * the app — an unhedged leg is directional exposure the user did not choose,
 * and it should not wait to be discovered on a page they may not visit.
 */
export function useCarryAttention(user: string | undefined) {
	return useQuery({
		queryKey: ["carry-attention", user],
		queryFn: () => carryApi.needsAttention(user as string),
		enabled: Boolean(user),
		refetchInterval: 30_000,
		retry: false,
	});
}

export function useDepositAvailability() {
	return useQuery({
		queryKey: ["deposit-status"],
		queryFn: () => depositApi.status(),
		staleTime: 5 * 60_000,
	});
}

export function useDepositChains(enabled = true) {
	return useQuery({
		queryKey: ["deposit-chains"],
		queryFn: () => depositApi.chains(),
		enabled,
		staleTime: 10 * 60_000,
	});
}
