import type { Vault } from "@lemon/client";
import { formatPercent, formatUsdCompact } from "@lemon/client";
import { cn, RiskBadge } from "@lemon/ui";
import { AlertTriangle, ChevronRight, Pause } from "lucide-react";
import { Link } from "react-router";

/**
 * The board.
 *
 * Ranked by realised yield, and the yield column is deliberately the *measured*
 * one — the change in this vault's own share price over the last seven days,
 * annualised. Not a projection from the current funding rate. A funding-based
 * estimate is a much larger number and describes a vault that has not existed
 * for a day as if it had a track record.
 *
 * A vault with too little history shows a dash. That is the honest answer, and
 * it is why the column header says "7d realised" rather than "APY".
 */
export function VaultTable({ vaults }: { vaults: Vault[] }) {
	return (
		<div className="overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
			{/* Header, desktop only — the mobile layout is cards, below. */}
			<div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 border-b border-[var(--pon-line)] px-5 py-3 text-[11px] font-medium tracking-wide text-[var(--pon-fg-3)] uppercase md:grid">
				<div>Vault</div>
				<div className="text-right">7d realised</div>
				<div className="text-right">30d realised</div>
				<div className="text-right">TVL</div>
				<div className="w-5" />
			</div>

			<ul className="divide-y divide-[var(--pon-line)]">
				{vaults.map((vault) => (
					<li key={vault.address}>
						<Link
							to={`/vaults/${vault.address}`}
							className="block px-5 py-4 transition-colors hover:bg-[var(--pon-surface)] focus-visible:bg-[var(--pon-surface)] focus-visible:outline-none"
						>
							{/* Desktop row. */}
							<div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 md:grid">
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

								<YieldCell value={vault.apy7d?.apy ?? null} />
								<YieldCell value={vault.apy30d?.apy ?? null} />

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
										<YieldCell value={vault.apy7d?.apy ?? null} />
										<div className="mt-0.5 text-xs text-[var(--pon-fg-3)]">
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
				className="inline-flex items-center gap-1 rounded-full bg-[var(--pon-fg-4)]/15 px-2 py-0.5 text-[11px] text-[var(--pon-fg-2)]"
				title="An operator has paused this vault. Withdrawals can still be requested."
			>
				<Pause className="size-3" /> Paused
			</span>
		);
	}

	if (vault.navStale) {
		return (
			<span
				className="inline-flex items-center gap-1 rounded-full bg-[var(--pon-amber)]/15 px-2 py-0.5 text-[11px] text-[var(--pon-amber)]"
				title="The agent has not reported a valuation recently, so deposits and withdrawals are on hold until it does."
			>
				<AlertTriangle className="size-3" /> Stale
			</span>
		);
	}

	return null;
}
