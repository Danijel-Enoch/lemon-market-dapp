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
 * Funding paid per UTC day.
 *
 * Held a little less long than the NAV series. Today's bucket is the one figure
 * on this page that fills in through the day — every settlement adds to it — and
 * a five-minute cache would show a stale "today" for most of the hour it changed
 * in. The historical days behind it do not move at all.
 */
export function useFundingSeries(address: string | undefined, days = 30) {
	return useQuery({
		queryKey: ["funding", address, days],
		queryFn: () => vaultApi.funding(address as string, days),
		enabled: Boolean(address),
		staleTime: 60_000,
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

/**
 * What one agent's wallets could send back.
 *
 * Not folded into `useAgentGas`: it costs a fee estimate per chain on top of
 * the balance read, and it is only ever wanted for the one vault whose withdraw
 * form is open. Not polled either — the operator is about to act on the figure,
 * and a number that changes under a half-filled form is worse than a stale one.
 */
export function useWithdrawableGas(vault: string | undefined, enabled: boolean) {
	return useQuery({
		queryKey: ["admin-gas-withdrawable", vault],
		queryFn: () => adminApi.withdrawableGas(vault as string),
		enabled: enabled && Boolean(vault),
		staleTime: 15_000,
	});
}

/**
 * Whether an agent's Pacifica side is set up.
 *
 * Enabled per vault rather than for the whole list: it is two round trips —
 * Solana for the token account, Pacifica for the account itself — and the
 * answer only matters where an operator is looking at one vault.
 */
export function usePacificaAccount(vault: string | undefined, enabled: boolean) {
	return useQuery({
		queryKey: ["admin-pacifica-account", vault],
		queryFn: () => adminApi.pacificaAccount(vault as string),
		enabled: enabled && Boolean(vault),
		staleTime: 30_000,
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

/**
 * The markets one vault runs.
 *
 * Per vault rather than for the whole list, because it is only ever wanted for
 * the vault whose market editor is open. Not polled: an operator is about to
 * edit these, and a list that reorders itself under a half-filled form is worse
 * than a slightly stale one.
 */
export function useVaultMarkets(vault: string | undefined, enabled: boolean) {
	return useQuery({
		queryKey: ["admin-vault-markets", vault],
		queryFn: () => adminApi.vaultMarkets(vault as string),
		enabled: enabled && Boolean(vault),
		staleTime: 30_000,
	});
}

/**
 * Whether the read model can be believed.
 *
 * Polled on every tab rather than behind one, and faster than the gas check,
 * because this is the failure that makes every other number on the page wrong
 * without making any of them look wrong. Twenty seconds is enough to catch an
 * indexer that has fallen over between two glances at the dashboard.
 */
export function useIndexerHealth(enabled: boolean) {
	return useQuery({
		queryKey: ["admin-indexer"],
		queryFn: () => adminApi.indexer(),
		enabled,
		refetchInterval: 20_000,
		staleTime: 10_000,
	});
}
