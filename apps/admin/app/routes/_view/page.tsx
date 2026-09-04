import { CreateVaultDialog } from "@app/components/CreateVaultDialog";
import { GasPanel } from "@app/components/GasPanel";
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
	useVaultableMarkets,
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

const FACTORY_ADDRESS = (import.meta.env.VITE_VAULT_FACTORY_ADDRESS ?? "") as `0x${string}`;

type Tab = "vaults" | "markets" | "gas" | "runs";

export default function AdminPage() {
	const { data: session, isLoading } = useAdminSession();
	const [tab, setTab] = useState<Tab>("vaults");

	const isAdmin = session?.isAdmin ?? false;
	const { data: vaultData } = useAdminVaults(isAdmin);
	const { data: marketData, isFetching: marketsFetching } = useVaultableMarkets(
		isAdmin && tab === "markets",
	);
	const { data: runData } = useAgentRuns(undefined, isAdmin && tab === "runs");
	// Fetched on every tab, not just its own: an agent out of gas is the failure
	// an operator most needs told about, and burying it behind a click means it
	// is found after the vault has already gone stale.
	const { data: gasData } = useAgentGas(isAdmin);

	const [creating, setCreating] = useState<VaultableMarket | null>(null);
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
	const stale = vaults.filter((v) => v.navStale);
	const needingGas = gasData?.needingTopUp ?? 0;

	return (
		<div className="space-y-6 md:space-y-8">
			<PageHeader
				eyebrow="Operator"
				title="Admin"
				description="Create vaults, watch agent health, and see why each agent did what it did."
			/>

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
											</div>
											<p className="mt-1 text-xs text-[var(--pon-fg-3)]">
												Agent {shortAddress(vault.agentWallet)} ·{" "}
												{vault.lastNavReportAt
													? `reported ${formatRelative(vault.lastNavReportAt)}`
													: "never reported"}{" "}
												· leverage {(vault.lastObservedLeverageBps / 10_000).toFixed(2)}x
											</p>
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
										</div>
									</div>
								</li>
							))}
						</ul>
					)}
				</section>
			)}

			{tab === "markets" && (
				<section className="space-y-3">
					{!FACTORY_ADDRESS && (
						<Alert
							tone="danger"
							title="No factory address configured"
							body="Set VITE_VAULT_FACTORY_ADDRESS to the deployed VaultFactory. Vaults cannot be created without it."
						/>
					)}

					{marketsFetching && !marketData ? (
						<Skeleton className="h-64 w-full rounded-[var(--pon-r-lg,16px)]" />
					) : (
						<ul className="divide-y divide-[var(--pon-line)] overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
							{(marketData?.markets ?? []).map((market) => {
								const both = market.existing.conservative && market.existing.leveraged;
								return (
									<li
										key={market.id}
										className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
									>
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-medium text-[var(--pon-fg-0)]">{market.ticker}</span>
												{market.existing.conservative && (
													<Pill tone="muted">Conservative vault</Pill>
												)}
												{market.existing.leveraged && <Pill tone="muted">Leveraged vault</Pill>}
												{market.reasons.length > 0 && <Pill tone="warning">Not tradable</Pill>}
											</div>
											<p className="mt-1 text-xs text-[var(--pon-fg-3)]">
												{market.name} · net {formatPercent(market.netApyPercent, 1)} · funding{" "}
												{formatPercent(market.fundingAprPercent, 1)}
											</p>
											{market.reasons.length > 0 && (
												<p className="mt-1 text-xs text-[var(--pon-amber)]">{market.reasons[0]}</p>
											)}
										</div>

										<Button
											size="sm"
											disabled={Boolean(both) || !FACTORY_ADDRESS}
											onClick={() => setCreating(market)}
										>
											<Plus className="mr-1.5 size-3.5" />
											{both ? "Both tiers exist" : "Create vault"}
										</Button>
									</li>
								);
							})}
						</ul>
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

			{creating && FACTORY_ADDRESS && (
				<CreateVaultDialog
					market={creating}
					factoryAddress={FACTORY_ADDRESS}
					onClose={() => setCreating(null)}
				/>
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
