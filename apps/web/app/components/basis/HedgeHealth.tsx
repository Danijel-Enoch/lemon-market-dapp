import { Callout } from "@app/components/common/Callout";
import { Button } from "@app/components/ui/button";
import { useHedgeHealth } from "@app/hooks/useMarketData";
import { basisApi } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { formatQuantity, formatUsd } from "@lemon/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Is this position still delta neutral, and what would fix it.
 *
 * Drift is real and routine rather than exceptional: the perp leg is floored
 * onto the venue's lot grid when it opens, partial fills land short, and an ADL
 * can shrink the hedge without warning. None of that is visible from the
 * position's stored plan, which describes what was intended — so this reads
 * both venues live and compares what actually exists.
 *
 * Measured in **units of the underlying**, not dollars. Two legs holding the
 * same number of units are neutral at any price; a dollar comparison would
 * report fresh "drift" on every tick and invite the user to trade against a
 * position that never moved.
 */

function exposureCopy(
	exposure: "neutral" | "long" | "short",
	symbol: string,
	perpSymbol: string,
): string {
	if (exposure === "neutral") return "Both legs match. Price moves cancel out.";
	if (exposure === "long") {
		return `You are holding more ${symbol} than the short covers, so you are exposed to the price of ${perpSymbol} on the difference.`;
	}
	return `The short on ${perpSymbol} is larger than the ${symbol} backing it, so you are short on the difference.`;
}

export function HedgeHealthCard({
	positionId,
	tokenSymbol,
	perpSymbol,
	isOpen,
}: {
	positionId: string;
	tokenSymbol: string;
	perpSymbol: string;
	/** Only an open position has a hedge to measure. */
	isOpen: boolean;
}) {
	const queryClient = useQueryClient();
	const { data: health, isLoading, error } = useHedgeHealth(positionId, isOpen);

	const rebalance = useMutation({
		mutationFn: () => basisApi.rebalance(positionId),
		onSuccess: (result) => {
			toast.success(
				result.traded
					? "Rebalanced — the short now matches the spot leg."
					: "Already balanced. Nothing needed trading.",
			);
			queryClient.invalidateQueries({ queryKey: ["basis-health", positionId] });
			queryClient.invalidateQueries({ queryKey: ["basis-position", positionId] });
		},
		onError: (cause) => toast.error(cause instanceof Error ? cause.message : "Could not rebalance"),
	});

	if (!isOpen) return null;

	if (isLoading) {
		return (
			<div className="rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-5">
				<p className="t-caption text-[var(--pon-fg-3)]">Checking the hedge…</p>
			</div>
		);
	}

	if (error || !health) {
		return (
			<Callout tone="warning" title="Cannot read the hedge right now">
				The venue did not answer, so the two legs could not be compared. This says nothing about the
				position itself — it is still whatever it was.
			</Callout>
		);
	}

	const drifted = health.exposure !== "neutral";

	return (
		<div
			className={cn(
				"rounded-[var(--pon-r-lg)] border bg-[var(--pon-surface)] p-5",
				drifted ? "border-[var(--pon-amber)]/50" : "border-[var(--pon-line)]",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-2">
					<Activity
						size={15}
						aria-hidden
						className={drifted ? "text-[var(--pon-amber)]" : "text-[var(--pon-up)]"}
					/>
					<h2 className="pon-section-label">Hedge</h2>
				</div>
				<span
					className={cn(
						"rounded-[var(--pon-r-sm)] border px-2 py-0.5 text-[10px] font-semibold uppercase",
						drifted
							? "border-[var(--pon-amber)] bg-[var(--pon-amber)]/12 text-[var(--pon-amber)]"
							: "border-[var(--pon-up)] bg-[var(--pon-up)]/12 text-[var(--pon-up)]",
					)}
				>
					{drifted ? `${health.exposure} exposure` : "neutral"}
				</span>
			</div>

			<div className="mt-4 grid grid-cols-3 gap-2.5">
				{[
					{ label: "Spot held", value: `${formatQuantity(health.spotUnits, 4)}` },
					{ label: "Short", value: `${formatQuantity(health.perpUnits, 4)}` },
					{
						label: "Gap",
						value: `${health.driftPercent > 0 ? "+" : ""}${health.driftPercent.toFixed(2)}%`,
						tone: drifted ? "text-[var(--pon-amber)]" : undefined,
					},
				].map((cell) => (
					<div
						key={cell.label}
						className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3 py-2.5"
					>
						<p className="t-micro text-[var(--pon-fg-3)]">{cell.label}</p>
						<p
							className={cn(
								"font-fono mt-1 text-[13px] font-semibold",
								cell.tone ?? "text-[var(--pon-fg)]",
							)}
						>
							{cell.value}
						</p>
					</div>
				))}
			</div>

			<p className="mt-3 text-[12.5px] leading-relaxed text-[var(--pon-fg-2)]">
				{exposureCopy(health.exposure, tokenSymbol, perpSymbol)}
				{drifted && (
					<>
						{" "}
						That is {formatUsd(Math.abs(health.deltaUsd))} of directional exposure at the current
						mark.
					</>
				)}
			</p>

			{health.shouldRebalance ? (
				<div className="mt-4 space-y-2">
					<Button
						type="button"
						disabled={rebalance.isPending}
						onClick={() => rebalance.mutate()}
						className="w-full sm:w-auto"
					>
						{rebalance.isPending
							? "Rebalancing…"
							: `${health.correctionUnits > 0 ? "Short" : "Buy back"} ${formatQuantity(Math.abs(health.correctionUnits), 4)} ${perpSymbol.split("/")[0]}`}
					</Button>
					<p className="t-micro leading-relaxed text-[var(--pon-fg-4)]">
						{/* Naming the cost up front: a rebalance is a taker fill, and a
						    user who does not know that will wonder where the money went. */}
						Trades the perp leg only — no wallet signature, no gas. It is a taker fill, so it costs
						0.1% of the traded amount.
					</p>
				</div>
			) : (
				drifted && (
					<p className="mt-4 t-micro leading-relaxed text-[var(--pon-fg-4)]">
						The gap is smaller than one lot on this market, so there is no order that would close
						it. Carrying it costs less than trading it.
					</p>
				)
			)}
		</div>
	);
}
