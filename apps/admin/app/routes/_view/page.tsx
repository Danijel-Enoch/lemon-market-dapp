import { CloseVaultDialog } from "@app/components/CloseVaultDialog";
import { CreateVaultDialog } from "@app/components/CreateVaultDialog";
import { GasPanel } from "@app/components/GasPanel";
import { IndexerCard } from "@app/components/IndexerCard";
import { VaultMarketsDialog } from "@app/components/VaultMarketsDialog";
import {
	adminApi,
	formatPercent,
	formatRelative,
	formatUsdCompact,
	shortAddress,
	useAdminSession,
	useAdminVaults,
	useAgentGas,
	useAgentRuns,
	useIndexerHealth,
	useVaultableMarkets,
	type Vault,
	type VaultableMarket,
} from "@lemon/client";
import {
	Button,
	cn,
	EmptyState,
	PageHeader,
	RiskBadge,
	Segmented,
	Skeleton,
	StatCard,
} from "@lemon/ui";
import { ENABLED_CHAINS } from "@lemon/wallet";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { MetaFunction } from "react-router";

/**
 * Where the public app lives.
 *
 * The console links out to it rather than rendering vault pages of its own: the
 * depositor-facing view already exists, and a second implementation of it would
 * be a second thing to keep truthful.
 */
const PUBLIC_APP_URL = import.meta.env.VITE_PUBLIC_APP_URL ?? "http://localhost:3002";

export const meta: MetaFunction = () => [
	{ title: "Lemon Admin" },
	// Deliberately not indexed. There is nothing secret behind it, but a
	// dashboard in search results invites probing that costs us nothing to avoid.
	{ name: "robots", content: "noindex" },
];

/**
 * The chains this console can create vaults on, and their factories.
 *
 * Derived from the build's configured factories rather than listed separately —
 * a chain with no factory is not offered, which is the same rule the public app
 * uses. `ENABLED_CHAINS` carries a zero-address entry when nothing at all is
 * configured, which is what the warning below detects.
 */
const ZERO = "0x0000000000000000000000000000000000000000";

type Tab = "vaults" | "markets" | "gas" | "runs";

export default function AdminPage() {
	const { data: session, isLoading } = useAdminSession();
	const [tab, setTab] = useState<Tab>("vaults");

	/**
	 * Which chain the operator is looking at.
	 *
	 * Vault creation is per chain end to end: the board, the factory, and the
	 * agent wallet's derivation path all depend on it. Defaulting to the first
	 * enabled chain keeps a single-chain deployment exactly as it was.
	 */
	const [chainId, setChainId] = useState<number>(ENABLED_CHAINS[0].chain.id);
	const activeChain = ENABLED_CHAINS.find((c) => c.chain.id === chainId) ?? ENABLED_CHAINS[0];
	const factoryAddress = activeChain.factory;
	const hasFactory = factoryAddress !== ZERO;

	// Declared above the queries because one of them is gated on whether the
	// market editor is open — the editor's "add a market" list comes from the
	// same curated board the Create tab uses.
	const [creating, setCreating] = useState<VaultableMarket | null>(null);
	const [editingMarkets, setEditingMarkets] = useState<Vault | null>(null);
	const [closingVault, setClosingVault] = useState<Vault | null>(null);

	const isAdmin = session?.isAdmin ?? false;
	const { data: vaultData } = useAdminVaults(isAdmin);
	// Also fetched while a market editor is open, which is on the Vaults tab: the
	// editor offers markets to add and the pairing comes from this board, never
	// from a ticker the browser typed.
	const { data: marketData, isFetching: marketsFetching } = useVaultableMarkets(
		isAdmin && (tab === "markets" || editingMarkets !== null),
		chainId,
	);
	const { data: runData } = useAgentRuns(undefined, isAdmin && tab === "runs");
	// Fetched on every tab, not just its own: an agent out of gas is the failure
	// an operator most needs told about, and burying it behind a click means it
	// is found after the vault has already gone stale.
	const { data: gasData } = useAgentGas(isAdmin);
	// On every tab too, and for a stronger reason than gas: an indexer that has
	// stopped makes every other figure on this page wrong without making any of
	// them look wrong.
	const { data: indexerHealth } = useIndexerHealth(isAdmin);

	// A failed mutation used to be an unhandled rejection and a button that did
	// nothing. An operator has no way to tell that apart from a no-op.
	const [actionError, setActionError] = useState<string | null>(null);
	const [busyVault, setBusyVault] = useState<string | null>(null);
	const queryClient = useQueryClient();

	async function toggleAgent(address: string, enabled: boolean) {
		setActionError(null);
		setBusyVault(address);
		try {
			await adminApi.setAgent(address, enabled);
			queryClient.invalidateQueries({ queryKey: ["admin-vaults"] });
		} catch (error) {
			setActionError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusyVault(null);
		}
	}

	/**
	 * Ask for a correction, then leave it alone.
	 *
	 * No optimistic state and no spinner waiting for a result: the agent ticks on
	 * its own interval, so the honest feedback is "asked, pending" until it
	 * reports back. Pretending otherwise would mean a button that looks like it
	 * finished before anything has happened.
	 */
	async function rebalance(address: string) {
		setActionError(null);
		setBusyVault(address);
		try {
			await adminApi.rebalance(address);
			queryClient.invalidateQueries({ queryKey: ["admin-vaults"] });
		} catch (error) {
			setActionError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusyVault(null);
		}
	}

	if (isLoading) {
		return <Skeleton className="h-64 w-full rounded-[var(--pon-r-lg,16px)]" />;
	}

	if (!isAdmin) {
		return (
			<EmptyState
				icon={Lock}
				title="Not available"
				description="This dashboard is for protocol operators. Sign in with an admin wallet to reach it."
			/>
		);
	}

	const vaults = vaultData?.vaults ?? [];
	const overdue = vaultData?.queue.overdue ?? [];
	const ripe = vaultData?.queue.ripe ?? [];

	// A market is offered only when both legs actually work: the Base token can
	// be round-tripped, and nothing else about the pair is blocking. The rest stay
	// reachable behind a disclosure rather than vanishing, because "not listed"
	// and "listed but unroutable today" need to look different to an operator.
	const allMarkets = marketData?.markets ?? [];
	const creatableMarkets = allMarkets.filter((m) => m.spotTradable && m.reasons.length === 0);
	const blockedMarkets = allMarkets.filter((m) => !m.spotTradable || m.reasons.length > 0);
	const stale = vaults.filter((v) => v.navStale);
	const needingGas = gasData?.needingTopUp ?? 0;

	return (
		<div className="space-y-6 md:space-y-8">
			<PageHeader
				eyebrow="Operator"
				title="Admin"
				description="Create vaults, watch agent health, and see why each agent did what it did."
			/>

			{/* First, because everything below it is read through the indexer. A
			    dashboard whose numbers are all wrong should say so at the top rather
			    than let an operator read them and act. */}
			<IndexerCard health={indexerHealth} />

			{/* The two things that need a human today, before anything else. */}
			{(overdue.length > 0 || stale.length > 0) && (
				<div className="space-y-2">
					{overdue.length > 0 && (
						<Alert
							tone="danger"
							title={`${overdue.length} withdrawal${overdue.length === 1 ? " is" : "s are"} past the 7-day deadline`}
							body="The agent has not closed enough of the position to pay them. Check that it is running and that the spot leg can still be routed."
						/>
					)}
					{stale.length > 0 && (
						<Alert
							tone="warning"
							title={`${stale.length} vault${stale.length === 1 ? "" : "s"} not reporting`}
							body="Deposits and withdrawals are blocked on-chain until a fresh valuation lands. This is the agent being down, not the contract."
						/>
					)}
					{needingGas > 0 && (
						<Alert
							tone="warning"
							title={`${needingGas} agent${needingGas === 1 ? " is" : "s are"} low on gas`}
							body="An agent that runs out does not crash — it silently fails every write until its vault goes stale. Top it up under Gas."
						/>
					)}
				</div>
			)}

			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<StatCard label="Vaults" value={String(vaults.length)} />
				<StatCard
					label="Total deposits"
					value={formatUsdCompact(
						vaults.reduce((sum, v) => sum + BigInt(v.totalAssets), 0n).toString(),
					)}
				/>
				<StatCard label="Ripe withdrawals" value={String(ripe.length)} />
				<StatCard
					label="Overdue"
					value={String(overdue.length)}
					tone={overdue.length > 0 ? "negative" : "neutral"}
				/>
			</div>

			<Segmented<Tab>
				options={[
					{ value: "vaults", label: "Vaults" },
					{ value: "markets", label: "Create" },
					{
						value: "gas",
						label: needingGas > 0 ? `Gas ${needingGas}` : "Gas",
					},
					{ value: "runs", label: "Agent log" },
				]}
				value={tab}
				onChange={setTab}
			/>

			{actionError && <Alert tone="danger" title="That did not go through" body={actionError} />}

			{tab === "vaults" && (
				<section className="space-y-3">
					{vaults.length === 0 ? (
						<EmptyState
							icon={ShieldCheck}
							title="No vaults yet"
							description="Open the Create tab to add one from the basis board."
						/>
					) : (
						<ul className="divide-y divide-[var(--pon-line)] overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
							{vaults.map((vault) => (
								<li key={vault.address} className="px-5 py-4">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<a
													href={`${PUBLIC_APP_URL}/vaults/${vault.address}`}
													target="_blank"
													rel="noreferrer noopener"
													className="font-medium text-[var(--pon-fg-0)] hover:text-[var(--pon-lime)]"
												>
													{vault.ticker ?? vault.symbol}
												</a>
												<RiskBadge
													tier={vault.tier}
													leverageLabel={vault.leverageLabel}
													size="sm"
												/>
												{vault.navStale && <Pill tone="warning">Not reporting</Pill>}
												{vault.paused && <Pill tone="muted">Paused</Pill>}
												{!vault.agentEnabled && <Pill tone="muted">Agent off</Pill>}
												{!vault.perpSymbol && <Pill tone="danger">No venue config</Pill>}
												{/* The most consequential state a vault can be in short of a
												    pause, so it is a badge rather than something an operator has
												    to open a dialog to discover. The two phases are separated
												    because "ordered" and "actually flat" are minutes to hours
												    apart, and that gap is what an operator who has just given
												    the order is watching for. */}
												{vault.closeRequestedAt && (
													<Pill tone={vault.closeCompletedAt ? "muted" : "warning"}>
														{vault.closeCompletedAt ? "Closed out" : "Closing"}
													</Pill>
												)}
												{/* Pending only. Once the agent has answered, the answer itself
												    is printed below — a badge that stayed would say a request
												    exists without saying what came of it. */}
												{vault.rebalanceRequestedAt && !vault.rebalanceCompletedAt && (
													<Pill tone="warning">Rebalance asked</Pill>
												)}
											</div>
											<p className="mt-1 text-xs text-[var(--pon-fg-3)]">
												Agent {shortAddress(vault.agentWallet)} ·{" "}
												{vault.lastNavReportAt
													? `reported ${formatRelative(vault.lastNavReportAt)}`
													: "never reported"}{" "}
												· leverage {(vault.lastObservedLeverageBps / 10_000).toFixed(2)}x
											</p>
											{/* The agent's own words about the last hand-asked rebalance.
											    Printed in full, because the useful ones are the refusals — "the
											    correction is worth $3.45, under the venue's $10 minimum order"
											    is the difference between an operator understanding a small
											    vault and pressing the button again every hour. */}
											{vault.rebalanceOutcome && (
												<p className="mt-1 text-xs text-[var(--pon-fg-4)]">
													Last rebalance request: {vault.rebalanceOutcome}
												</p>
											)}
											{/* A vault runs one basis position per market. On the row rather
											    than behind the editor, because otherwise a three-market vault
											    is indistinguishable from a one-market vault at a glance. */}
											{vault.markets.length > 0 && (
												<p className="mt-1 text-xs text-[var(--pon-fg-4)]">
													{vault.markets
														.filter((m) => m.enabled)
														.map((m) => `${m.ticker} ${(m.targetWeightBps / 100).toFixed(0)}%`)
														.join(" · ")}
													{vault.markets.some((m) => !m.enabled) &&
														` · ${vault.markets.filter((m) => !m.enabled).length} retired`}
												</p>
											)}
										</div>

										<div className="flex items-center gap-4">
											<div className="text-right">
												<p className="font-medium tabular-nums text-[var(--pon-fg-0)]">
													{formatUsdCompact(vault.totalAssets)}
												</p>
												<p className="text-xs text-[var(--pon-fg-3)]">
													{formatUsdCompact(vault.idleAssets)} idle
												</p>
											</div>
											<div className="flex flex-wrap justify-end gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => setEditingMarkets(vault)}
												>
													Markets
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={busyVault === vault.address}
													onClick={() => toggleAgent(vault.address, !vault.agentEnabled)}
												>
													{busyVault === vault.address
														? "Working…"
														: vault.agentEnabled
															? "Stop agent"
															: "Start agent"}
												</Button>
												{/* Disabled under a close order and with the agent stopped,
												    because in both cases the API refuses it — better to say so
												    with the control than with an error after the click. */}
												<Button
													variant="outline"
													size="sm"
													disabled={
														busyVault === vault.address ||
														!vault.agentEnabled ||
														vault.closeRequestedAt !== null
													}
													onClick={() => rebalance(vault.address)}
												>
													Rebalance now
												</Button>
												<Button variant="outline" size="sm" onClick={() => setClosingVault(vault)}>
													{vault.closeRequestedAt ? "Resume trading" : "Close positions"}
												</Button>
											</div>
										</div>
									</div>
								</li>
							))}
						</ul>
					)}
				</section>
			)}

			{tab === "markets" && (
				<section className="space-y-4">
					{ENABLED_CHAINS.length > 1 && (
						<Segmented<string>
							aria-label="Chain"
							options={ENABLED_CHAINS.map((c) => ({
								value: String(c.chain.id),
								label: c.chain.name,
							}))}
							value={String(chainId)}
							onChange={(next) => setChainId(Number(next))}
						/>
					)}

					{!hasFactory && (
						<Alert
							tone="danger"
							title={`No factory address configured for ${activeChain.chain.name}`}
							body={`Set VITE_VAULT_FACTORY_ADDRESS_${activeChain.chain.name.toUpperCase().replace(/[^A-Z]/g, "")} to the deployed VaultFactory. Vaults cannot be created on this chain without it.`}
						/>
					)}

					{marketsFetching && !marketData ? (
						<Skeleton className="h-64 w-full rounded-[var(--pon-r-lg,16px)]" />
					) : (
						<>
							<p className="text-sm text-[var(--pon-fg-3)]">
								Only markets whose spot token can be bought and sold on {activeChain.chain.name}{" "}
								today. A vault holds that token against the perp short, so one without a live route
								both ways would take deposits it could not open or could not unwind. The three
								chains do not offer the same board — Arbitrum lists no tokenized equities at all.
							</p>

							{creatableMarkets.length === 0 ? (
								<EmptyState
									icon={AlertTriangle}
									title="No market can be vaulted right now"
									description={`Every paired market is missing a spot route on ${activeChain.chain.name} or has a perp leg that is not accepting positions. The full list is below.`}
								/>
							) : (
								<ul className="divide-y divide-[var(--pon-line)] overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
									{creatableMarkets.map((market) => (
										<MarketRow
											key={market.id}
											market={market}
											canCreate={hasFactory}
											onCreate={setCreating}
											chainName={activeChain.chain.name}
										/>
									))}
								</ul>
							)}

							{/* Kept, not hidden. An operator who cannot find NVDA needs to see that
							    it is listed and unroutable today, not conclude it was never paired —
							    but it does not belong in the list of things they can act on. */}
							{blockedMarkets.length > 0 && (
								<details className="overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
									<summary className="cursor-pointer px-5 py-3.5 text-sm text-[var(--pon-fg-2)]">
										{blockedMarkets.length} market{blockedMarkets.length === 1 ? "" : "s"} cannot be
										vaulted right now
									</summary>
									<ul className="divide-y divide-[var(--pon-line)] border-t border-[var(--pon-line)]">
										{blockedMarkets.map((market) => (
											<MarketRow
												key={market.id}
												market={market}
												canCreate={false}
												onCreate={setCreating}
												chainName={activeChain.chain.name}
											/>
										))}
									</ul>
								</details>
							)}
						</>
					)}
				</section>
			)}

			{tab === "gas" && <GasPanel gas={gasData?.gas ?? []} />}

			{tab === "runs" && (
				<section className="space-y-3">
					<p className="text-sm text-[var(--pon-fg-3)]">
						Every agent tick, with the reason it gave. A run marked{" "}
						<span className="text-[var(--pon-fg)]">advised</span> had its action chosen by the
						language model from the options the policy allowed; the rest were the policy alone.
					</p>
					{(runData?.runs.length ?? 0) === 0 ? (
						<EmptyState title="No agent runs recorded yet" />
					) : (
						<ul className="divide-y divide-[var(--pon-line)] overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
							{runData?.runs.map((run) => (
								<li key={run.id} className="px-5 py-3.5">
									<div className="flex flex-wrap items-baseline gap-2">
										<span
											className={cn(
												"rounded px-1.5 py-0.5 text-[11px] font-medium",
												run.error
													? "bg-[var(--pon-down)]/15 text-[var(--pon-down)]"
													: "bg-[var(--pon-surface-2)] text-[var(--pon-fg-2)]",
											)}
										>
											{run.action}
										</span>
										{run.market && <Pill tone="muted">{run.market}</Pill>}
										{run.advised && <Pill tone="muted">advised</Pill>}
										<span className="text-xs text-[var(--pon-fg-4)]">
											{shortAddress(run.vaultAddress)} · {new Date(run.createdAt).toLocaleString()}
										</span>
									</div>
									<p className="mt-1 text-sm text-[var(--pon-fg-2)]">{run.rationale}</p>
									{run.error && <p className="mt-1 text-sm text-[var(--pon-down)]">{run.error}</p>}
								</li>
							))}
						</ul>
					)}
				</section>
			)}

			{creating && hasFactory && (
				<CreateVaultDialog
					market={creating}
					chainId={chainId}
					factoryAddress={factoryAddress}
					onClose={() => setCreating(null)}
				/>
			)}

			{editingMarkets && (
				<VaultMarketsDialog
					vault={editingMarkets}
					board={allMarkets}
					onClose={() => setEditingMarkets(null)}
				/>
			)}

			{closingVault && (
				<CloseVaultDialog vault={closingVault} onClose={() => setClosingVault(null)} />
			)}
		</div>
	);
}

function Alert({ tone, title, body }: { tone: "danger" | "warning"; title: string; body: string }) {
	return (
		<div
			className={cn(
				"flex gap-3 rounded-[var(--pon-r-md,12px)] border p-4",
				tone === "danger"
					? "border-[var(--pon-down)]/30 bg-[var(--pon-down)]/10"
					: "border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/10",
			)}
		>
			<AlertTriangle
				className={cn(
					"mt-0.5 size-4 shrink-0",
					tone === "danger" ? "text-[var(--pon-down)]" : "text-[var(--pon-amber)]",
				)}
			/>
			<div className="text-sm">
				<p className="font-medium text-[var(--pon-fg-0)]">{title}</p>
				<p className="mt-1 text-[var(--pon-fg-2)]">{body}</p>
			</div>
		</div>
	);
}

function Pill({
	tone,
	children,
}: {
	tone: "muted" | "warning" | "danger";
	children: React.ReactNode;
}) {
	return (
		<span
			className={cn(
				"rounded-full px-2 py-0.5 text-[11px]",
				tone === "muted" && "bg-[var(--pon-surface-2)] text-[var(--pon-fg-2)]",
				tone === "warning" && "bg-[var(--pon-amber)]/15 text-[var(--pon-amber)]",
				tone === "danger" && "bg-[var(--pon-down)]/15 text-[var(--pon-down)]",
			)}
		>
			{children}
		</span>
	);
}

/**
 * One row on the Create tab.
 *
 * Shared by the creatable list and the blocked disclosure so the two cannot
 * drift into showing different things about the same market. `canCreate` is
 * passed in rather than derived here: the blocked list renders the identical row
 * with the button disabled, which is what makes the reason legible next to the
 * thing it is blocking.
 */
function MarketRow({
	market,
	canCreate,
	onCreate,
	chainName,
}: {
	market: VaultableMarket;
	canCreate: boolean;
	onCreate: (market: VaultableMarket) => void;
	/** The chain this board is for. The badge names it rather than assuming Base. */
	chainName: string;
}) {
	const bothTiersExist = Boolean(market.existing.conservative && market.existing.leveraged);
	const spotUnavailable = !market.spotTradable;
	const blocked = spotUnavailable || market.reasons.length > 0;
	const disabled = bothTiersExist || !canCreate;

	return (
		<li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium text-[var(--pon-fg-0)]">{market.ticker}</span>
					<span className="font-mono text-[11px] text-[var(--pon-fg-4)]">{market.spot.symbol}</span>
					{market.existing.conservative && <Pill tone="muted">Conservative vault</Pill>}
					{market.existing.leveraged && <Pill tone="muted">Leveraged vault</Pill>}
					{spotUnavailable && <Pill tone="danger">No spot on {chainName}</Pill>}
					{/* Not "perp blocked": `reasons` also carries spot problems that are
					    not routability — thin liquidity, most often — and naming the
					    wrong leg sends an operator to look at the wrong venue. The
					    actual sentence is printed below, so the badge only has to say
					    that something is. */}
					{!spotUnavailable && market.reasons.length > 0 && <Pill tone="warning">Blocked</Pill>}
					{market.spot.probeFailed && <Pill tone="muted">Liquidity unknown</Pill>}
				</div>
				<p className="mt-1 text-xs text-[var(--pon-fg-3)]">
					{market.name} · net {formatPercent(market.netApyPercent, 1)} · funding{" "}
					{formatPercent(market.fundingAprPercent, 1)}
				</p>
				{market.reasons.length > 0 && (
					<p className="mt-1 text-xs text-[var(--pon-amber)]">{market.reasons[0]}</p>
				)}
			</div>

			{/* A disabled primary button is still a lime button, and at a glance it
			    reads as pressable — an operator clicks it, nothing happens, and the
			    reason is a line of text they have already skimmed past. Blocked rows
			    get the outline variant and a label that names the state instead. */}
			<Button
				size="sm"
				variant={disabled ? "outline" : "shine"}
				disabled={disabled}
				onClick={() => onCreate(market)}
			>
				{!disabled && <Plus className="mr-1.5 size-3.5" />}
				{bothTiersExist ? "Both tiers exist" : blocked ? "Unavailable" : "Create vault"}
			</Button>
		</li>
	);
}
