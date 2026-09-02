import { cn } from "@app/lib/utils";
import type { ReactNode } from "react";

/**
 * Readout tile.
 *
 * The Avantis treatment: a flat surface with no border, a quiet sentence-case
 * label, and the figure itself set in the mono face with tabular numerals so a
 * row of tiles never jitters as values tick.
 */
export function StatTile({
	label,
	value,
	hint,
	tone,
	className,
}: {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	tone?: "positive" | "negative" | "neutral";
	className?: string;
}) {
	return (
		<div className={cn("rounded-lg bg-[var(--surface-3)] px-4 py-3.5", className)}>
			<p className="t-caption text-[var(--ink-2)]">{label}</p>
			<p
				className={cn(
					"mt-1.5 font-fono text-xl leading-[1.4]",
					tone === "positive" && "text-lime-400",
					tone === "negative" && "text-red-400",
					(!tone || tone === "neutral") && "text-[var(--ink-1)]",
				)}
			>
				{value}
			</p>
			{hint && <p className="mt-0.5 t-micro text-[var(--ink-2)]">{hint}</p>}
		</div>
	);
}

/** Colour a number by sign, for PnL and funding readouts. */
export function toneForValue(value: number): "positive" | "negative" | "neutral" {
	if (value > 0) return "positive";
	if (value < 0) return "negative";
	return "neutral";
}
