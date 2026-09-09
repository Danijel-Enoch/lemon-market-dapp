import { ACTIVITY_FILTERS, ActivityFeed, CHAIN_FILTERS } from "@app/components/vault/ActivityFeed";
import { DepositPanel } from "@app/components/vault/DepositPanel";
import { FundingChart, FundingToday } from "@app/components/vault/FundingChart";
import { HedgePanel } from "@app/components/vault/HedgePanel";
import { NavChart, navChange } from "@app/components/vault/NavChart";
import { PositionPanel } from "@app/components/vault/PositionPanel";
import { WithdrawPanel } from "@app/components/vault/WithdrawPanel";
import {
	formatDateTime,
	formatPercent,
	formatRelative,
	formatUsd,
	formatUsdCompact,
	formatUsdSigned,
	shortAddress,
	useAgentTransfers,
	useFundingSeries,
	useLivePosition,
	useNavSeries,
	usePortfolio,
	useVault,
	useVaultActivity,
	type Vault,
} from "@lemon/client";
import {
	ChipGroup,
	cn,
	EmptyState,
	RiskBadge,
	riskDescription,
	Skeleton,
	StatCard,
} from "@lemon/ui";
import { AlertTriangle, ArrowLeft, ExternalLink, Vault as VaultIcon } from "lucide-react";
import { useState } from "react";
import { Link, type MetaFunction, useParams } from "react-router";
import { useAccount } from "wagmi";

/**
 * Titled from the address rather than the ticker.
 *
 * `meta` runs before the vault has loaded, and the ticker only exists in that
 * response — so the alternative is a title that says "Vault" for a moment and
 * then changes, which is worse in a tab strip than a stable, if terse, one.
 */
export const meta: MetaFunction = ({ params }) => {
	const address = typeof params.id === "string" ? params.id : "";
	const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
	return [
		{ title: short ? `Vault ${short} — Lemon` : "Vault — Lemon" },
		{
			name: "description",
			content:
				"A fully hedged vault on Base. Deposit USDC, hold a share token, and earn what the market pays to hold this asset — with every trade the agent makes across Base and Solana published for you to check.",
		},
	];
};

/** USDC on Base. The vault's asset, and what a deposit is denominated in. */
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export default function VaultDetailPage() {
	const { id } = useParams<{ id: string }>();
	const { address } = useAccount();

	const { data: vault, isLoading, isError } = useVault(id);
	const { data: navData } = useNavSeries(id, 30);
	const { data: funding } = useFundingSeries(id, 30);
	const { data: portfolio } = usePortfolio(address);

	const [kindFilter, setKindFilter] = useState("");
	const [chainFilter, setChainFilter] = useState("");
	const { data: activityData } = useVaultActivity(id, {
		kind: kindFilter || undefined,
		chain: chainFilter || undefined,
	});
	const { data: transferData } = useAgentTransfers(id);
	const { data: livePosition } = useLivePosition(id);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-32 w-full rounded-[var(--pon-r-lg,16px)]" />
				<Skeleton className="h-64 w-full rounded-[var(--pon-r-lg,16px)]" />
			</div>
		);
	}

	if (isError || !vault) {
		return (
			<EmptyState
				icon={VaultIcon}
				title="No vault here"
				description="That address is not a vault this deployment knows about."
				action={
					<Link to="/vaults" className="text-sm text-[var(--pon-lime)] underline">
						Back to the board
					</Link>
				}
			/>
		);
	}

	const points = navData?.points ?? [];
	const change30d = navChange(points);
	const pending = portfolio?.pendingWithdrawals.find(
		(w) => w.vault.toLowerCase() === vault.address.toLowerCase(),
	);
	const holding = portfolio?.holdings.find(
		(h) => h.vault.address.toLowerCase() === vault.address.toLowerCase(),
	);

	return (
		<div className="space-y-6">
			<Link
				to="/vaults"
				className="inline-flex items-center gap-1.5 text-sm text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]"
			>
				<ArrowLeft className="size-4" /> All vaults
			</Link>

			{/* --- header ---------------------------------------------------- */}
			<div className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5 md:p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-2xl font-semibold text-[var(--pon-fg-0)] md:text-3xl">
								{vault.ticker ?? vault.symbol}
							</h1>
							<RiskBadge tier={vault.tier} leverageLabel={vault.leverageLabel} />
						</div>
						<p className="mt-1 text-sm text-[var(--pon-fg-2)]">{vault.name}</p>
						<p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--pon-fg-3)]">
							{riskDescription(vault.tier)}
						</p>
					</div>

					<a
						href={`https://basescan.org/address/${vault.address}`}
						target="_blank"
						rel="noreferrer noopener"
						className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pon-line-2)] px-3 py-1.5 text-xs text-[var(--pon-fg-2)] hover:border-[var(--pon-lime)] hover:text-[var(--pon-lime)]"
					>
						{shortAddress(vault.address)} <ExternalLink className="size-3" />
					</a>
				</div>

				{(vault.paused || vault.navStale) && (
					<div className="mt-4 flex gap-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/10 px-4 py-3 text-sm">
						<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--pon-amber)]" />
						<p className="text-[var(--pon-fg-2)]">
							{vault.paused
								? "An operator has paused this vault. Deposits are stopped; withdrawal requests and existing shares are unaffected."
								: `The agent last reported a valuation ${vault.lastNavReportAt ? formatRelative(vault.lastNavReportAt) : "a while ago"}. Until it reports again the vault will not price a deposit or pay out a withdrawal.`}
						</p>
					</div>
				)}
			</div>

			{/* --- headline numbers ------------------------------------------ */}
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
				<StatCard
					label="Share price"
					value={formatUsd(vault.pricePerShare, 4)}
					delta={change30d === null ? undefined : `${formatPercent(change30d, 2)} over 30d`}
					tone={change30d === null ? "neutral" : change30d >= 0 ? "positive" : "negative"}
				/>
				<StatCard
					label="Projected"
					value={vault.outlook.available ? formatPercent(vault.outlook.netApyPercent, 1) : "—"}
					delta={vault.outlook.available ? "if funding holds" : undefined}
					tone={
						!vault.outlook.available
							? "neutral"
							: vault.outlook.netApyPercent > 0
								? "positive"
								: "negative"
					}
				/>
				<StatCard
					label="7d realised"
					value={formatPercent(vault.apy7d?.apy ?? null, 1)}
					tone={
						(vault.apy7d?.apy ?? 0) > 0
							? "positive"
							: (vault.apy7d?.apy ?? 0) < 0
								? "negative"
								: "neutral"
					}
				/>
				<FundingEarnedCard vault={vault} />
				<StatCard label="Total deposits" value={formatUsdCompact(vault.totalAssets)} />
				<StatCard
					label="Deployed"
					value={formatUsdCompact(vault.deployedAssets)}
					delta={`${formatUsdCompact(vault.idleAssets)} idle`}
				/>
			</div>

			{/* --- chart + actions ------------------------------------------- */}
			<div className="grid gap-5 lg:grid-cols-[1fr_380px]">
				<div className="space-y-5">
					<section className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
						<div className="mb-4 flex items-baseline justify-between">
							<h2 className="font-medium text-[var(--pon-fg-0)]">Share price</h2>
							<span className="text-xs text-[var(--pon-fg-3)]">Last 30 days</span>
						</div>
						<NavChart points={points} />
						<p className="mt-3 text-xs leading-relaxed text-[var(--pon-fg-4)]">
							One point per funding period. A hedged position earns when the venue settles funding —
							hourly on Pacifica — and nothing in between, so that is the interval the agent reports
							on and the interval this line is drawn on. Every yield figure on this page is computed
							from this series, so you can check them against it.
						</p>
					</section>

					{/*
					 * Under the share price rather than beside it, deliberately.
					 *
					 * The two charts answer questions that only sound alike. The line
					 * above is what a share is worth after everything — funding, both
					 * fees, and whatever the spot and perp legs did to each other; this
					 * is the funding on its own, gross, which is the part the strategy
					 * is actually for. Reading them in that order is the argument the
					 * page is making, and side by side would invite them to be read as
					 * two views of one number.
					 */}
					<section className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
						<div className="mb-4 flex items-start justify-between gap-4">
							<div>
								<h2 className="font-medium text-[var(--pon-fg-0)]">Funding earned</h2>
								<span className="text-xs text-[var(--pon-fg-3)]">Last 30 days, per UTC day</span>
							</div>
							<FundingToday
								amount={funding?.today ?? "0"}
								settlements={funding?.todaySettlements ?? 0}
							/>
						</div>
						<FundingChart points={funding?.points ?? []} />
						<p className="mt-3 text-xs leading-relaxed text-[var(--pon-fg-4)]">
							One bar per UTC day, summed across every market the vault runs — the venue settles
							hourly, so a day is up to twenty-four payments. Gross: this is what the strategy
							collected, before the management and performance fees and before venue costs, all of
							which come out of the share price above. A bar below the line is a day the short paid
							rather than received, which is an ordinary outcome and not an error. Each bar is the
							sum of the FUNDING_SETTLED rows in the feed below, so the two can be checked against
							each other.
						</p>
					</section>

					{holding && (
						<section className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-lime)]/20 bg-[var(--pon-bg-2)] p-5">
							<h2 className="font-medium text-[var(--pon-fg-0)]">Your position</h2>
							<dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
								<Metric label="Shares" value={`${Number(holding.shares) / 1e18}`.slice(0, 10)} />
								<Metric label="Value" value={formatUsd(holding.valueUsd)} />
								<Metric label="Deposited" value={formatUsd(holding.netDeposited)} />
								<Metric
									label="Unrealised"
									value={formatUsd(
										(BigInt(holding.valueUsd) - BigInt(holding.netDeposited)).toString(),
									)}
									tone={BigInt(holding.valueUsd) >= BigInt(holding.netDeposited) ? "up" : "down"}
								/>
							</dl>
						</section>
					)}

					{livePosition && <PositionPanel position={livePosition} />}

					{/* Directly under the two legs, because it is a statement about the
					    relationship between them: how far they have drifted apart, and
					    whether the venue will accept the order that would close the gap.
					    A drift the agent cannot correct otherwise looks like an agent
					    that has stopped working. */}
					{livePosition?.markets && livePosition.markets.length > 0 && (
						<HedgePanel markets={livePosition.markets} />
					)}

					{/* --- the money trail ------------------------------------ */}
					<section className="space-y-4">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<div>
								<h2 className="font-medium text-[var(--pon-fg-0)]">Agent activity</h2>
								<p className="mt-0.5 text-sm text-[var(--pon-fg-3)]">
									Every trade and transfer, on every chain. Public, and linked to the chain it
									happened on.
								</p>
							</div>
						</div>

						<div className="flex flex-wrap gap-2">
							<ChipGroup
								options={ACTIVITY_FILTERS}
								value={kindFilter}
								onChange={setKindFilter}
								aria-label="Filter by action"
							/>
							<ChipGroup
								options={CHAIN_FILTERS}
								value={chainFilter}
								onChange={setChainFilter}
								aria-label="Filter by chain"
							/>
						</div>

						<ActivityFeed
							activity={activityData?.activity ?? []}
							emptyMessage={
								kindFilter || chainFilter
									? "Nothing matches those filters."
									: "The agent has not traded this vault yet."
							}
						/>
					</section>

					{/* --- capital in and out of the contract ------------------ */}
					{(transferData?.transfers.length ?? 0) > 0 && (
						<section className="space-y-3">
							<div>
								<h2 className="font-medium text-[var(--pon-fg-0)]">Capital movements</h2>
								<p className="mt-0.5 text-sm text-[var(--pon-fg-3)]">
									USDC leaving the vault for the agent to trade, and coming back.
								</p>
							</div>
							<ul className="divide-y divide-[var(--pon-line)] overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
								{transferData?.transfers.map((t) => (
									<li
										key={t.id}
										className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
									>
										<div>
											<span className="font-medium text-[var(--pon-fg-0)]">
												{t.direction === "WITHDRAW" ? "Vault → agent" : "Agent → vault"}
											</span>
											<span className="ml-2 text-xs text-[var(--pon-fg-4)]">
												{formatDateTime(t.timestamp)}
											</span>
										</div>
										<div className="flex items-center gap-3">
											<span className="tabular-nums text-[var(--pon-fg)]">
												{formatUsd(t.amount)}
											</span>
											<a
												href={`https://basescan.org/tx/${t.txHash}`}
												target="_blank"
												rel="noreferrer noopener"
												className="text-[var(--pon-fg-4)] hover:text-[var(--pon-lime)]"
											>
												<ExternalLink className="size-3.5" />
											</a>
										</div>
									</li>
								))}
							</ul>
						</section>
					)}
				</div>

				{/* --- sidebar ------------------------------------------------ */}
				<div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
					<DepositPanel vault={vault} usdcAddress={USDC_ADDRESS} />
					<WithdrawPanel vault={vault} pending={pending} />

					{/* What the vault actually holds, and in what proportion. A vault may
					    run several markets at once — one spot leg and one short each,
					    sharing a margin account — and a depositor choosing between vaults
					    is choosing between these lists more than anything else on the
					    page. */}
					{vault.markets.length > 0 && (
						<div className="space-y-2 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5 text-xs leading-relaxed text-[var(--pon-fg-3)]">
							<h3 className="text-sm font-medium text-[var(--pon-fg-0)]">
								{vault.markets.length === 1 ? "Market" : "Markets"}
							</h3>
							<ul className="space-y-1.5 pt-0.5">
								{vault.markets
									.filter((market) => market.enabled)
									.map((market) => (
										<li key={market.ticker} className="flex items-baseline justify-between gap-3">
											<span className="text-[var(--pon-fg)]">{market.ticker}</span>
											<span className="font-mono text-[11px] text-[var(--pon-fg-4)]">
												{market.spotTokenSymbol} / {market.perpSymbol}
											</span>
											{vault.markets.filter((m) => m.enabled).length > 1 && (
												<span className="tabular-nums text-[var(--pon-fg-2)]">
													{(market.targetWeightBps / 100).toFixed(0)}%
												</span>
											)}
										</li>
									))}
							</ul>
							<p className="pt-1">
								{vault.markets.filter((m) => m.enabled).length === 1
									? "Long the spot token on Base against an equal-notional short on Pacifica."
									: "Each market is long its spot token on Base against an equal-notional short on Pacifica. The percentages are targets the agent works towards one market at a time, not a promise about any given moment."}
							</p>
						</div>
					)}

					{/* A vault standing down is the most material thing that can happen to
					    a position short of a pause, and it shows up in the activity feed
					    either way — so it is said plainly rather than left to be inferred
					    from a position that quietly went to zero. */}
					{vault.closeRequestedAt && (
						<div className="space-y-2 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/10 p-5 text-xs leading-relaxed text-[var(--pon-fg-2)]">
							<h3 className="text-sm font-medium text-[var(--pon-fg-0)]">Standing down</h3>
							<p>
								{vault.closeCompletedAt
									? "An operator has wound this vault's positions down. The capital is back in the contract and is not earning funding; deposits and withdrawals work as normal."
									: "An operator has asked the agent to close every position and return the capital to the vault. It is being unwound now."}
							</p>
						</div>
					)}

					<div className="space-y-2 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5 text-xs leading-relaxed text-[var(--pon-fg-3)]">
						<h3 className="text-sm font-medium text-[var(--pon-fg-0)]">Mandate</h3>
						<p>
							Current leverage{" "}
							<span className="text-[var(--pon-fg)]">
								{(vault.lastObservedLeverageBps / 10_000).toFixed(2)}x
							</span>{" "}
							against a ceiling of {(vault.maxLeverageBps / 10_000).toFixed(0)}x, which the contract
							enforces on every valuation the agent reports.
						</p>
						<p>
							Depositing adds to the existing position rather than starting a new one: the agent
							buys more of a spot leg and puts more margin behind the short already open against it.
						</p>
						<p className="pt-1">
							The agent's wallets and both legs are shown in full under Open position.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

/**
 * What the vault has actually been paid, as opposed to what it might pay.
 *
 * The other four headline cards are rates: a share price, a projection, two
 * annualised windows. This is the only one denominated in money the strategy has
 * already earned, which is the question a depositor asks first and the app could
 * not answer until the agent began reporting settlements.
 *
 * Two states, and the empty one matters. A vault whose agent has not yet
 * reported a settlement has *no* total — not a zero — and showing "$0.00" there
 * would read as a strategy that has earned nothing rather than one nobody has
 * measured yet. The dash and its caption say which.
 *
 * Gross, and labelled so. This is funding before management, performance and
 * venue fees; the share price above is what a depositor kept. Presenting the
 * larger number without that word would be the more flattering of two readings
 * and the wrong one.
 */
function FundingEarnedCard({ vault }: { vault: Vault }) {
	const settlements = vault.fundingSettlementCount ?? 0;

	if (settlements === 0) {
		return (
			<StatCard
				label="Funding earned"
				value="—"
				delta="no settlements reported yet"
				tone="neutral"
			/>
		);
	}

	const total = BigInt(vault.cumulativeFunding ?? "0");

	return (
		<StatCard
			label="Funding earned"
			value={formatUsdSigned(total)}
			delta={
				<span title="Gross funding across every settlement reported on-chain, before management, performance and venue fees.">
					gross, over {settlements.toLocaleString("en-US")} settlement
					{settlements === 1 ? "" : "s"}
				</span>
			}
			tone={total > 0n ? "positive" : total < 0n ? "negative" : "neutral"}
		/>
	);
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
	return (
		<div>
			<dt className="text-xs text-[var(--pon-fg-3)]">{label}</dt>
			<dd
				className={cn(
					"mt-0.5 font-medium tabular-nums",
					tone === "up"
						? "text-[var(--pon-up)]"
						: tone === "down"
							? "text-[var(--pon-down)]"
							: "text-[var(--pon-fg-0)]",
				)}
			>
				{value}
			</dd>
		</div>
	);
}
