import type { ReactNode } from "react";
import { cn } from "../utils";

/**
 * Progress bar.
 *
 * A solid ink fill in a ruled track, square at both ends. The thin size sits
 * under a card figure; the thick one is the headline form. No gradient and no
 * bloom — the bar is a measurement, and this system draws measurements flat.
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
			className={cn(
				"w-full overflow-hidden rounded-none border border-[var(--pon-line)] bg-transparent",
				height,
				className,
			)}
		>
			<div
				className="h-full rounded-none bg-[var(--pon-ink)] transition-[width] duration-500"
				style={{ width: `${pct}%` }}
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
				<span
					className={cn(
						"firm-label text-[var(--pon-fg-2)]",
						size === "lg" ? "text-[11px]" : "text-[10.5px]",
					)}
				>
					{label}
				</span>
				<span
					className={cn(
						"font-fono font-bold text-[var(--pon-fg-0)]",
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
