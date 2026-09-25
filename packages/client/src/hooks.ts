import { useQuery } from "@tanstack/react-query";
import { adminApi, authApi, selfApi, vaultApi } from "./api";

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
export function useFundingSeries(
	address: string | undefined,
	window: { days?: number; hours?: number } = { days: 30 },
) {
	return useQuery({
		queryKey: ["funding", address, window.hours ?? null, window.days ?? null],
		queryFn: () => vaultApi.funding(address as string, window),
		enabled: Boolean(address),
		// Shorter on an hourly view: the newest bucket is the hour being paid
		// into, and on an eight-hour chart that bucket is an eighth of what the
		// reader is looking at rather than a thirtieth.
		staleTime: window.hours ? 30_000 : 60_000,
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

export function useVaultableMarkets(enabled: boolean, chainId?: number) {
	return useQuery({
		// The chain is part of the key, not just the request. The three chains
		// offer different boards — Arbitrum has no tokenized equities at all —
		// and a shared key would serve one chain's markets under another's tab
		// until the stale time expired.
		queryKey: ["admin-markets", chainId ?? null],
		queryFn: () => adminApi.markets(chainId),
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

/**
 * What one vault is holding, read live from the venues.
 *
 * Not polled, and deliberately so: it costs a sell quote per market and a
 * Pacifica read, which is a lot to spend every few seconds — and the operator
 * reading it is about to act on it, so a figure that changes under a decision is
 * worse than one that is a minute old. The unwind panel refetches it when a step
 * finishes, which is the moment it has actually changed.
 */
export function useVaultPosition(vault: string | undefined, enabled: boolean) {
	return useQuery({
		queryKey: ["admin-vault-position", vault],
		queryFn: () => adminApi.position(vault as string),
		enabled: enabled && Boolean(vault),
		staleTime: 15_000,
	});
}

/**
 * The hand-run unwind steps against one vault.
 *
 * Polled while the panel is open, because a step takes minutes to hours and the
 * row is the only thing that says how it went. One indexed read per poll — the
 * expensive picture is `useVaultPosition`, which is why the two are separate.
 */
export function useVaultPositionSteps(
	vault: string | undefined,
	enabled: boolean,
	refetchInterval: number | false = 5_000,
) {
	return useQuery({
		queryKey: ["admin-vault-steps", vault],
		queryFn: () => adminApi.positionSteps(vault as string),
		enabled: enabled && Boolean(vault),
		refetchInterval,
	});
}

// ---------------------------------------------------------------------------
// Self-managed positions
// ---------------------------------------------------------------------------

/**
 * Who the API thinks the caller is, if anyone.
 *
 * Distinct from `useAdminSession`, which answers the narrower question of
 * whether the caller may administer the protocol. This one answers "is there a
 * session at all", which is what the self-managed routes gate on — and an
 * ordinary user signing in to see their own positions is not, and must not have
 * to be, an admin.
 *
 * `retry: false` because the failure mode is a 401 for a signed-out visitor,
 * which is the ordinary state rather than a transient error. Retrying it three
 * times makes every anonymous page load three rejected requests.
 */
export function useAccountSession() {
	return useQuery({
		queryKey: ["account-session"],
		queryFn: () => authApi.me(),
		staleTime: 60_000,
		retry: false,
	});
}

/**
 * Whether this deployment offers self-managed positions at all.
 *
 * Effectively static — it answers a question about configuration, not about
 * markets — so it is fetched once and never refetched. The app uses it to decide
 * whether to show the entry points, and a feature that appears and then fails at
 * the last step is worse than one that was never offered.
 */
export function useSelfStatus() {
	return useQuery({
		queryKey: ["self-status"],
		queryFn: () => selfApi.status(),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/**
 * The basis board: every enterable pair, ranked by net yield.
 *
 * Thirty seconds, which is faster than the vault board and slower than a price
 * feed. The ranking moves on funding rates and spot quotes rather than on ticks
 * — funding is published hourly and the routability probe is cached upstream —
 * so a shorter interval would re-fetch the same ordering, and a longer one lets
 * a market that has just become unenterable keep offering a button.
 */
export function useBasisMarkets(chainId?: number) {
	return useQuery({
		queryKey: ["basis-markets", chainId ?? null],
		queryFn: () => selfApi.markets({ chainId }),
		refetchInterval: 30_000,
		staleTime: 15_000,
	});
}

/**
 * One market from the board, by ticker.
 *
 * Served from the board's own cache rather than a second endpoint. The board is
 * one request that already contains every market, so a detail page that fetched
 * its own row would double the upstream load to show data it already had — and
 * could show a *different* price from the row the user just clicked.
 */
export function useBasisMarket(ticker: string | undefined, chainId?: number) {
	const board = useBasisMarkets(chainId);
	const target = ticker?.trim().toUpperCase();

	return {
		...board,
		data: target
			? board.data?.markets.find(
					(market) =>
						market.id.toUpperCase() === target ||
						market.ticker.toUpperCase() === target ||
						market.spot.symbol.toUpperCase() === target ||
						market.perp.pacificaSymbol.toUpperCase() === target,
				)
			: undefined,
	};
}

/**
 * The caller's derived wallet, without creating one.
 *
 * `enabled` is the caller's to set, because this 401s for a signed-out visitor
 * and a rejected request on every page load is noise in the console and a
 * retry loop in the query client.
 */
export function useDerivedWallet(enabled = true) {
	return useQuery({
		queryKey: ["self-wallet"],
		queryFn: () => selfApi.wallet(),
		enabled,
		// An address is derived from a path and cannot change for a given user, so
		// the only thing that moves here is onboarding state.
		staleTime: 60_000,
	});
}

/**
 * Balances across Solana, Pacifica and the venue minimums.
 *
 * Fifteen seconds, the shortest interval in this file, and deliberately so.
 * These are the numbers someone watches while a bridge lands — the one moment
 * in the product where a user is genuinely waiting on a balance to change — and
 * a minute of staleness there reads as a transfer that has gone missing.
 */
export function useSelfBalances(enabled = true) {
	return useQuery({
		queryKey: ["self-balances"],
		queryFn: () => selfApi.balances(),
		enabled,
		refetchInterval: 15_000,
		staleTime: 5_000,
	});
}

/**
 * The caller's positions, with both legs re-read from their venues.
 *
 * Twenty seconds. Each fetch re-reads an ERC-20 balance and the Pacifica
 * account, so this is the most expensive hook here — but it is also the one
 * showing whether someone is currently hedged, and that is not a figure to let
 * go stale while a market moves underneath it.
 */
export function useSelfPositions(options: { enabled?: boolean; includeClosed?: boolean } = {}) {
	return useQuery({
		queryKey: ["self-positions", options.includeClosed ?? false],
		queryFn: () => selfApi.positions({ includeClosed: options.includeClosed }),
		enabled: options.enabled ?? true,
		refetchInterval: 20_000,
		staleTime: 10_000,
	});
}

export function useSelfPosition(id: string | undefined) {
	return useQuery({
		queryKey: ["self-position", id],
		queryFn: () => selfApi.position(id as string),
		enabled: Boolean(id),
		refetchInterval: 20_000,
	});
}

/**
 * One position's history.
 *
 * Append-only and mostly idle, so it is not polled. It changes when the user
 * acts, and the action that changes it can invalidate this key itself — which is
 * cheaper and more immediate than a timer that is wrong in both directions.
 */
export function useSelfPositionEvents(id: string | undefined) {
	return useQuery({
		queryKey: ["self-position-events", id],
		queryFn: () => selfApi.events(id as string),
		enabled: Boolean(id),
		staleTime: 60_000,
	});
}
