import { EmptyPanel } from "@app/components/common/EmptyState";
import { useCarryPositions } from "@app/hooks/useMarketData";
import type { CarryPositionRecord } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { formatPercent, formatUsd } from "@lemon/core";
import { Scale } from "lucide-react";
import { Link } from "react-router";
import { useConnection } from "wagmi";

const STATUS_STYLES: Record<CarryPositionRecord["status"], { label: string; className: string }> = {
	VALIDATING: { label: "Preparing", className: "bg-gray-500/15 text-[var(--ink-2)]" },
	SPOT_FILLED: { label: "Unhedged", className: "bg-red-500/15 text-red-400" },
	OPEN: { label: "Open", className: "bg-lime-500/15 text-lime-400" },
	UNWINDING: { label: "Unwinding", className: "bg-amber-500/15 text-amber-400" },
	SPOT_CLOSED: { label: "Closing", className: "bg-amber-500/15 text-amber-400" },
	CLOSED: { label: "Closed", className: "bg-gray-500/15 text-[var(--ink-2)]" },
	ORPHANED: { label: "Needs attention", className: "bg-red-500/20 text-red-300" },
	FAILED: { label: "Failed", className: "bg-gray-500/15 text-[var(--ink-2)]" },
};

export function CarryPositionList() {
	const { address } = useConnection();
	const { data, isLoading, error } = useCarryPositions(address);

	if (!address) return null;
	if (isLoading) {
		return <p className="py-6 text-center text-sm text-[var(--ink-2)]">Loading positions…</p>;
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
							"flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-colors",
							needsAttention
								? "border-red-500/40 bg-red-500/5 hover:border-red-500/60"
								: "border-[var(--line-soft)] bg-[var(--surface-3)] hover:border-white/25",
						)}
					>
						<div className="flex items-center gap-3">
							<div>
								<p className="font-medium">
									{position.tokenSymbol}
									<span className="ml-2 text-xs text-[var(--ink-2)]">
										vs {position.avantisSymbol}
									</span>
								</p>
								<p className="text-xs text-[var(--ink-2)]">
									{formatUsd(position.notionalUsd)} per leg · {position.perpLeverage}x short
								</p>
							</div>
						</div>

						<div className="flex items-center gap-4">
							{position.entryNetApyPct !== null && (
								<div className="text-right">
									<p className="text-[11px] uppercase text-white/35">Entry APY</p>
									<p
										className={cn(
											"font-fono text-sm",
											position.entryNetApyPct >= 0 ? "text-lime-400" : "text-red-400",
										)}
									>
										{formatPercent(position.entryNetApyPct)}
									</p>
								</div>
							)}
							<span
								className={cn(
									"rounded px-2 py-1 text-[11px] font-medium uppercase",
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
