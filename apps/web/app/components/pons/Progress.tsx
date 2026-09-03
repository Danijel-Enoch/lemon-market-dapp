import { cn } from "@app/lib/utils";
import type { ReactNode } from "react";

/**
 * Progress bar.
 *
 * Pons runs progress as a lime gradient on a recessed track. The thin size is
 * the inline form that sits under a card figure; the thick one is the headline
 * form, which adds a bloom under the fill so the bar carries the accent.
 */
export function ProgressBar({
	value,
	size = "sm",
	className,
}: {
	/** 0–1. Clamped, so an over-target ratio renders full rather than overflowing. */
	value: number;
	size?: "xs" | "sm" | "lg";
	className?: string;
}) {
	const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
	const height = size === "xs" ? "h-[3px]" : size === "sm" ? "h-[5px]" : "h-2.5";

	return (
		<div
			role="progressbar"
			aria-valuenow={Math.round(pct)}
			aria-valuemin={0}
			aria-valuemax={100}
			className={cn("w-full overflow-hidden rounded-full bg-[var(--pon-bg-2)]", height, className)}
		>
			<div
				className="h-full rounded-full transition-[width] duration-500"
				style={{
					width: `${pct}%`,
					background: "linear-gradient(90deg, var(--pon-lime-2), var(--pon-lime))",
					boxShadow: size === "lg" ? "0 0 14px -2px var(--pon-glow)" : undefined,
				}}
			/>
		</div>
	);
}

/**
 * Labelled progress — the Pons pattern of a quiet label on the left, the figure
 * in lime on the right, and the bar under both.
 */
export function LabelledProgress({
	label,
	value,
	caption,
	size = "sm",
	className,
}: {
	label: ReactNode;
	value: number;
	caption?: ReactNode;
	size?: "sm" | "lg";
	className?: string;
}) {
	const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

	return (
		<div className={className}>
			<div
				className={cn(
					"flex items-baseline justify-between gap-3",
					size === "lg" ? "mb-2.5" : "mb-2",
				)}
			>
				<span className={cn("text-[var(--pon-fg-2)]", size === "lg" ? "text-[13px]" : "text-xs")}>
					{label}
				</span>
				<span
					className={cn(
						"font-fono font-bold text-[var(--pon-lime)]",
						size === "lg" ? "text-sm" : "text-xs",
					)}
				>
					{Math.round(pct * 100)}%
				</span>
			</div>
			<ProgressBar value={pct} size={size} />
			{caption && <p className="mt-2 t-caption text-[var(--pon-fg-3)]">{caption}</p>}
		</div>
	);
}
