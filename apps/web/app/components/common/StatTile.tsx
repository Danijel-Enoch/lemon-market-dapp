import { cn } from "@app/lib/utils";
import type { ReactNode } from "react";

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
		<div className={cn("rounded-lg border border-white/10 bg-white/[0.02] p-3", className)}>
			<p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
			<p
				className={cn(
					"mt-1 font-mono text-lg",
					tone === "positive" && "text-lime-400",
					tone === "negative" && "text-red-400",
					(!tone || tone === "neutral") && "text-white",
				)}
			>
				{value}
			</p>
			{hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
		</div>
	);
}

/** Colour a number by sign, for PnL and funding readouts. */
export function toneForValue(value: number): "positive" | "negative" | "neutral" {
	if (value > 0) return "positive";
	if (value < 0) return "negative";
	return "neutral";
}
