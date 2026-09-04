import { useQuery } from "@tanstack/react-query";
import { adminApi, vaultApi } from "./api";

/**
 * Data hooks.
 *
 * Poll intervals are set by how fast the underlying thing actually moves, not by
 * how fast it could be fetched. A vault's share price changes when the agent
 * reports, which is every fifteen minutes at most — polling it every five
 * seconds would spend a hundred requests to see the same number.
 */

/** The board. Share prices move on NAV reports, so a minute is ample. */
export function useVaults() {
	return useQuery({
		queryKey: ["vaults"],
		queryFn: () => vaultApi.list(),
		refetchInterval: 60_000,
		staleTime: 30_000,
	});
}

export function useVault(address: string | undefined) {
	return useQuery({
		queryKey: ["vault", address],
		queryFn: () => vaultApi.get(address as string),
		enabled: Boolean(address),
		refetchInterval: 30_000,
	});
}

export function useProtocolStats() {
	return useQuery({
		queryKey: ["protocol-stats"],
		queryFn: () => vaultApi.stats(),
		refetchInterval: 60_000,
	});
}

export function useNavSeries(address: string | undefined, days = 30) {
	return useQuery({
		queryKey: ["nav", address, days],
		queryFn: () => vaultApi.nav(address as string, days),
		enabled: Boolean(address),
		// The series only grows at the far end, and a chart that redraws every
		// thirty seconds is a chart nobody can read a value off.
		staleTime: 5 * 60_000,
	});
}

/**
 * The activity feed.
 *
 * Polled faster than the rest. It is the page people watch when they want to
 * know what the agent is doing right now, and a stale feed there reads as an
 * agent that has stopped.
 */
export function useVaultActivity(
	address: string | undefined,
	filters: { kind?: string; chain?: string } = {},
) {
	return useQuery({
		queryKey: ["activity", address, filters.kind ?? "", filters.chain ?? ""],
		queryFn: () => vaultApi.activity(address as string, { limit: 100, ...filters }),
		enabled: Boolean(address),
		refetchInterval: 20_000,
	});
}

export function useAllActivity(filters: { kind?: string; chain?: string } = {}) {
	return useQuery({
		queryKey: ["activity-all", filters.kind ?? "", filters.chain ?? ""],
		queryFn: () => vaultApi.allActivity({ limit: 100, ...filters }),
		refetchInterval: 20_000,
	});
}

/**
 * The live position, read from the venues rather than from a report.
 *
 * Slower than the feed on purpose: each call is a Base RPC read, a Kyber quote
 * and three Pacifica requests, and the underlying position changes on the
 * agent's cadence rather than by the second.
 */
export function useLivePosition(address: string | undefined) {
	return useQuery({
		queryKey: ["position", address],
		queryFn: () => vaultApi.position(address as string),
		enabled: Boolean(address),
		refetchInterval: 60_000,
		staleTime: 30_000,
		// A venue being down should leave the rest of the page working, so this
		// fails quietly rather than retrying into a spinner.
		retry: 1,
	});
}

export function useAgentTransfers(address: string | undefined) {
	return useQuery({
		queryKey: ["transfers", address],
		queryFn: () => vaultApi.transfers(address as string),
		enabled: Boolean(address),
		refetchInterval: 60_000,
	});
}

/**
 * Someone's holdings and queue position.
 *
 * Polled at fifteen seconds, faster than the board. A user who has just
 * deposited or just requested a withdrawal is watching this page for their
 * action to appear, and the indexer is a block or two behind the transaction.
 */
export function usePortfolio(owner: string | undefined) {
	return useQuery({
		queryKey: ["portfolio", owner],
		queryFn: () => vaultApi.portfolio(owner as string),
		enabled: Boolean(owner),
		refetchInterval: 15_000,
	});
}

// --- admin ----------------------------------------------------------------

export function useAdminSession() {
	return useQuery({
		queryKey: ["admin-session"],
		queryFn: () => adminApi.session(),
		staleTime: 60_000,
		retry: false,
	});
}

export function useVaultableMarkets(enabled: boolean) {
	return useQuery({
		queryKey: ["admin-markets"],
		queryFn: () => adminApi.markets(),
		enabled,
		// The board runs a live liquidity probe per row, so it is expensive
		// upstream. Two minutes, and a manual refresh button on the page.
		staleTime: 120_000,
	});
}

export function useAdminVaults(enabled: boolean) {
	return useQuery({
		queryKey: ["admin-vaults"],
		queryFn: () => adminApi.vaults(),
		enabled,
		refetchInterval: 30_000,
	});
}

/**
 * Agent gas balances.
 *
 * Polled slowly: a balance only moves when the agent spends or an operator tops
 * up, and each call is one RPC per chain per vault. The alert it drives is about
 * a wallet draining over days, not seconds.
 */
export function useAgentGas(enabled: boolean) {
	return useQuery({
		queryKey: ["admin-gas"],
		queryFn: () => adminApi.gas(),
		enabled,
		refetchInterval: 120_000,
		staleTime: 60_000,
	});
}

export function useAgentRuns(vault: string | undefined, enabled: boolean) {
	return useQuery({
		queryKey: ["agent-runs", vault ?? "all"],
		queryFn: () => adminApi.runs(vault),
		enabled,
		refetchInterval: 30_000,
	});
}
