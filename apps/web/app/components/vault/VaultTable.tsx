import type { Vault } from "@lemon/client";
import { formatPercent, formatUsdCompact, formatUsdSigned } from "@lemon/client";
import { cn, RiskBadge } from "@lemon/ui";
import { AlertTriangle, ChevronRight, Pause } from "lucide-react";
import { Link } from "react-router";
import { ProjectedYieldCell } from "./ProjectedYield";

/**
 * The board.
 *
 * Three yield columns, and the split between them is the point. The realised
 * ones are *measured* — the change in this vault's own share price, annualised
 * — and a vault with too little history shows a dash there, because that is the
 * honest answer. It is why those headers say "realised" rather than "APY".
 *
 * The projected column is the opposite kind of claim: what the vault would pay
 * if the current funding rate held, net of its buffer, venue costs and both
 * fees. It exists because the realised columns cannot serve the person the
 * board is for. Someone choosing where to put money into a vault that nobody
 * has deposited into yet is looking at two dashes, and a projection is the only
 * thing that can be said to them at all.
 *
 * Ranking still follows realised yield. A projection is an extrapolation from a
 * rate that reprices hourly, and sorting the board by it would let a market
 * having an unusual afternoon top a list that reads as a track record.
 */
export function VaultTable({ vaults }: { vaults: Vault[] }) {
	return (
		<div className="overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
			{/* Header, desktop only — the mobile layout is cards, below. */}
			<div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 border-b border-[var(--pon-line)] px-5 py-3 text-[11px] font-medium tracking-wide text-[var(--pon-fg-3)] uppercase md:grid">
				<div>Vault</div>
				<div
					className="text-right"
					title="What this vault would pay if the current funding rate held, after its idle buffer, venue costs and both fees. A projection, not a measurement."
				>
					Projected
				</div>
				<div className="text-right">7d realised</div>
				<div className="text-right">30d realised</div>
				<div
					className="text-right"
					title="Every funding payment this vault has been paid since its agent began reporting settlements, added up. Gross, before fees — a measurement, not a rate."
				>
					Funding earned
				</div>
				<div className="text-right">TVL</div>
				<div className="w-5" />
			</div>

			<ul className="divide-y divide-[var(--pon-line)]">
				{vaults.map((vault) => (
					<li key={vault.address}>
						<Link
							to={`/vaults/${vault.address}`}
							data-tour="vault-link"
							className="block px-5 py-4 transition-colors hover:bg-[var(--pon-lime-dim)] focus-visible:bg-[var(--pon-lime-dim)] focus-visible:outline-none"
						>
							{/* Desktop row. */}
							<div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] items-center gap-4 md:grid">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="truncate font-medium text-[var(--pon-fg-0)]">
											{vault.ticker ?? vault.symbol}
										</span>
										<RiskBadge tier={vault.tier} leverageLabel={vault.leverageLabel} size="sm" />
										<VaultWarnings vault={vault} />
									</div>
									<p className="mt-0.5 truncate text-xs text-[var(--pon-fg-3)]">
										<span className="text-[var(--pon-fg-4)]">{vault.assetClassLabel}</span>
										<span className="mx-1.5 text-[var(--pon-fg-4)]">·</span>
										{vault.name}
									</p>
								</div>

								<ProjectedYieldCell outlook={vault.outlook} />
								<YieldCell value={vault.apy7d?.apy ?? null} />
								<YieldCell value={vault.apy30d?.apy ?? null} />
								<FundingCell vault={vault} />

								<div className="text-right">
									<div className="font-medium tabular-nums text-[var(--pon-fg-0)]">
										{formatUsdCompact(vault.totalAssets)}
									</div>
									<div className="text-xs text-[var(--pon-fg-3)]">
										{vault.depositorCount} depositor{vault.depositorCount === 1 ? "" : "s"}
									</div>
								</div>

								<ChevronRight className="size-5 text-[var(--pon-fg-4)]" />
							</div>

							{/* Mobile card. */}
							<div className="md:hidden">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="truncate font-medium text-[var(--pon-fg-0)]">
												{vault.ticker ?? vault.symbol}
											</span>
											<VaultWarnings vault={vault} />
										</div>
										<div className="mt-1.5 flex flex-wrap items-center gap-2">
											<RiskBadge tier={vault.tier} leverageLabel={vault.leverageLabel} size="sm" />
											<span className="text-[11px] text-[var(--pon-fg-4)]">
												{vault.assetClassLabel}
											</span>
										</div>
									</div>
									<div className="text-right">
										<ProjectedYieldCell outlook={vault.outlook} />
										<div className="mt-0.5 text-[11px] text-[var(--pon-fg-4)]">projected</div>
										<div className="mt-1 text-xs text-[var(--pon-fg-3)]">
											{formatUsdCompact(vault.totalAssets)} TVL
										</div>
									</div>
								</div>
							</div>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

/**
 * The one column on this board denominated in money rather than in percent.
 *
 * It answers a different question from the three beside it. Those are rates,
 * which compare vaults of any size; this is the total a vault has actually been
 * paid, which does not — a large vault earning poorly out-earns a small one
 * doing well. Both belong here, and the column is deliberately the last of the
 * four so the rates are read first.
 *
 * The dash is a real state, not a zero. A vault whose agent has not reported a
 * settlement has nothing measured yet, and "$0.00" would say the opposite.
 */
function FundingCell({ vault }: { vault: Vault }) {
	const settlements = vault.fundingSettlementCount ?? 0;

	if (settlements === 0) {
		return (
			<div className="text-right">
				<span
					className="tabular-nums text-[var(--pon-fg-4)]"
					title="No funding settlements reported for this vault yet."
				>
					—
				</span>
			</div>
		);
	}

	const total = BigInt(vault.cumulativeFunding ?? "0");

	return (
		<div className="text-right">
			<div
				className={cn(
					"font-medium tabular-nums",
					total > 0n
						? "text-[var(--pon-up)]"
						: total < 0n
							? "text-[var(--pon-down)]"
							: "text-[var(--pon-fg)]",
				)}
			>
				{formatUsdSigned(total)}
			</div>
			<div className="text-xs text-[var(--pon-fg-3)]">
				{settlements.toLocaleString("en-US")} settlement{settlements === 1 ? "" : "s"}
			</div>
		</div>
	);
}

function YieldCell({ value }: { value: number | null }) {
	if (value === null) {
		return (
			<div className="text-right">
				<span
					className="text-[var(--pon-fg-4)] tabular-nums"
					title="Not enough NAV history yet to measure a return over this window."
				>
					—
				</span>
			</div>
		);
	}

	return (
		<div className="text-right">
			<span
				className={cn(
					"font-medium tabular-nums",
					value > 0
						? "text-[var(--pon-up)]"
						: value < 0
							? "text-[var(--pon-down)]"
							: "text-[var(--pon-fg)]",
				)}
			>
				{formatPercent(value, 1)}
			</span>
		</div>
	);
}

/**
 * The two states a depositor needs to see before clicking.
 *
 * A stale NAV means the vault will refuse deposits *and* withdrawals until the
 * agent reports again, which is not something to discover after typing an
 * amount. A pause is the operator having stopped it deliberately.
 */
function VaultWarnings({ vault }: { vault: Vault }) {
	if (vault.paused) {
		return (
			<span
				className="inline-flex items-center gap-1 rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-2 py-0.5 text-[11px] text-[var(--pon-fg-2)]"
				title="An operator has paused this vault. Withdrawals can still be requested."
			>
				<Pause className="size-3" /> Paused
			</span>
		);
	}

	if (vault.navStale) {
		return (
			<span
				className="inline-flex items-center gap-1 rounded-[var(--pon-r-sm)] border border-[var(--pon-amber)] px-2 py-0.5 text-[11px] text-[var(--pon-amber)]"
				title="The agent has not reported a valuation recently, so deposits and withdrawals are on hold until it does."
			>
				<AlertTriangle className="size-3" /> Stale
			</span>
		);
	}

	return null;
}
