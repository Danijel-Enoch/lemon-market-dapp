import { EmptyPanel } from "@app/components/common/EmptyState";
import { useCarryPositions } from "@app/hooks/useMarketData";
import type { CarryPositionRecord } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { formatPercent, formatUsd } from "@lemon/core";
import { Scale } from "lucide-react";
import { Link } from "react-router";
import { useConnection } from "wagmi";

const STATUS_STYLES: Record<CarryPositionRecord["status"], { label: string; className: string }> = {
	VALIDATING: {
		label: "Preparing",
		className: "border-[var(--pon-line-2)] bg-[var(--pon-surface-2)] text-[var(--pon-fg-3)]",
	},
	SPOT_FILLED: {
		label: "Unhedged",
		className: "border-[var(--pon-down)] bg-[var(--pon-down)]/12 text-[var(--pon-down)]",
	},
	OPEN: {
		label: "Open",
		className: "border-[var(--pon-lime)] bg-[var(--pon-lime-dim)] text-[var(--pon-lime)]",
	},
	UNWINDING: {
		label: "Unwinding",
		className: "border-[var(--pon-amber)] bg-[var(--pon-amber)]/12 text-[var(--pon-amber)]",
	},
	SPOT_CLOSED: {
		label: "Closing",
		className: "border-[var(--pon-amber)] bg-[var(--pon-amber)]/12 text-[var(--pon-amber)]",
	},
	CLOSED: {
		label: "Closed",
		className: "border-[var(--pon-line-2)] bg-[var(--pon-surface-2)] text-[var(--pon-fg-3)]",
	},
	ORPHANED: {
		label: "Needs attention",
		className: "border-[var(--pon-down)] bg-[var(--pon-down)]/20 text-[var(--pon-down)]",
	},
	FAILED: {
		label: "Failed",
		className: "border-[var(--pon-line-2)] bg-[var(--pon-surface-2)] text-[var(--pon-fg-3)]",
	},
};

export function CarryPositionList() {
	const { address } = useConnection();
	const { data, isLoading, error } = useCarryPositions(address);

	if (!address) return null;
	if (isLoading) {
		return (
			<p className="py-6 text-center text-[13px] text-[var(--pon-fg-3)]">Loading positions…</p>
		);
	}
	if (error) {
		return (
			<EmptyPanel icon={Scale} title="Position history unavailable">
				Cash-and-carry positions need a configured database. Set DATABASE_URL and run the migrations
				to enable them.
			</EmptyPanel>
		);
	}

	const positions = data?.positions ?? [];
	if (!positions.length) {
		return (
			<EmptyPanel icon={Scale} title="No carry positions yet">
				Build one above to hold spot and short the matching perp in a single flow.
			</EmptyPanel>
		);
	}

	return (
		<div className="space-y-2">
			{positions.map((position) => {
				const status = STATUS_STYLES[position.status];
				// SPOT_FILLED and ORPHANED both mean live, unhedged exposure.
				const needsAttention = position.status === "ORPHANED" || position.status === "SPOT_FILLED";

				return (
					<Link
						key={position.id}
						to={`/carry/${position.id}`}
						className={cn(
							"flex flex-wrap items-center justify-between gap-3 rounded-[var(--pon-r-md)] border p-4 transition-colors",
							needsAttention
								? "border-[var(--pon-down)] bg-[var(--pon-down)]/8 hover:bg-[var(--pon-down)]/12"
								: "border-[var(--pon-line)] bg-[var(--pon-surface)] hover:border-[var(--pon-line-2)]",
						)}
					>
						<div className="flex items-center gap-3">
							<div>
								<p className="text-[14px] font-semibold text-[var(--pon-fg)]">
									{position.tokenSymbol}
									<span className="ml-2 t-caption font-normal text-[var(--pon-fg-3)]">
										vs {position.perpSymbol}
									</span>
								</p>
								<p className="mt-0.5 t-caption text-[var(--pon-fg-3)]">
									{formatUsd(position.notionalUsd)} per leg · {position.perpLeverage}x short
								</p>
							</div>
						</div>

						<div className="flex items-center gap-4">
							{position.entryNetApyPct !== null && (
								<div className="text-right">
									<p className="t-micro uppercase tracking-[0.08em] text-[var(--pon-fg-3)]">
										Entry APY
									</p>
									<p
										className={cn(
											"font-fono text-sm font-semibold",
											position.entryNetApyPct >= 0
												? "text-[var(--pon-up)]"
												: "text-[var(--pon-down)]",
										)}
									>
										{formatPercent(position.entryNetApyPct)}
									</p>
								</div>
							)}
							<span
								className={cn(
									"rounded-[var(--pon-r-sm)] border px-2 py-0.5 text-[10px] font-semibold uppercase",
									status.className,
								)}
							>
								{status.label}
							</span>
						</div>
					</Link>
				);
			})}
		</div>
	);
}
