import type { ReactNode } from "react";
import { cn } from "../utils";

/**
 * Key/value row — the Pons summary line used under order forms and inside
 * detail panels, where a full feed row would be too heavy.
 */
export function DetailRow({
	label,
	value,
	tone,
	className,
}: {
	label: ReactNode;
	value: ReactNode;
	tone?: "positive" | "negative" | "neutral";
	className?: string;
}) {
	return (
		<div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
			<span className="t-caption text-[var(--pon-fg-3)]">{label}</span>
			<span
				className={cn(
					"font-fono text-[12.5px]",
					tone === "positive" && "text-[var(--pon-up)]",
					tone === "negative" && "text-[var(--pon-down)]",
					(!tone || tone === "neutral") && "text-[var(--pon-fg)]",
				)}
			>
				{value}
			</span>
		</div>
	);
}
