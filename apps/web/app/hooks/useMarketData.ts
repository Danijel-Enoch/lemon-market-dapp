import { basisApi, depositApi, pointsApi } from "@app/lib/api";
import { useQuery } from "@tanstack/react-query";

/**
 * The basis board.
 *
 * Two clocks are folded into one poll here. Funding and marks move on a ~5s
 * upstream cycle, but the liquidity probe behind every row is cached server-side
 * for five minutes — so polling faster than 30s buys fresher funding and the
 * same stale routability. While the first probe is still running the board
 * polls hard, because every row reads as unenterable until it lands.
 */
export function useBasisMarkets(assetClass?: "equity" | "crypto") {
	return useQuery({
		queryKey: ["basis-markets", assetClass ?? "all"],
		queryFn: () => basisApi.markets(assetClass),
		refetchInterval: (query) =>
			query.state.data && query.state.data.routabilityKnown === false ? 3_000 : 30_000,
		staleTime: 15_000,
	});
}

export function useBasisMarket(id: string | undefined) {
	return useQuery({
		queryKey: ["basis-market", id],
		queryFn: () => basisApi.market(id as string),
		enabled: Boolean(id),
		refetchInterval: 15_000,
	});
}

export function useBasisPositions(user: string | undefined) {
	return useQuery({
		queryKey: ["basis-positions", user],
		queryFn: () => basisApi.positions(user as string),
		enabled: Boolean(user),
		refetchInterval: 20_000,
	});
}

export function useBasisPosition(id: string | undefined) {
	return useQuery({
		queryKey: ["basis-position", id],
		queryFn: () => basisApi.position(id as string),
		enabled: Boolean(id),
		refetchInterval: 15_000,
	});
}

/**
 * Half-open positions.
 *
 * Polled independently of the position list so the warning can appear anywhere
 * in the app — an unhedged leg is directional exposure the user did not choose,
 * and it should not wait to be discovered on a page they may not visit.
 */
export function useBasisAttention(user: string | undefined) {
	return useQuery({
		queryKey: ["basis-attention", user],
		queryFn: () => basisApi.needsAttention(user as string),
		enabled: Boolean(user),
		refetchInterval: 30_000,
		retry: false,
	});
}

export function useLeaderboard(limit = 100) {
	return useQuery({
		queryKey: ["points-leaderboard", limit],
		queryFn: () => pointsApi.leaderboard(limit),
		refetchInterval: 60_000,
	});
}

export function usePointsProfile(address: string | undefined) {
	return useQuery({
		queryKey: ["points-profile", address],
		queryFn: () => pointsApi.profile(address as string),
		enabled: Boolean(address),
		refetchInterval: 60_000,
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
