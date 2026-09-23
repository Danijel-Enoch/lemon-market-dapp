import type { ReactNode } from "react";
import { cn } from "../utils";

/**
 * Key/value row — the summary line used under order forms and inside detail
 * panels. Ruled top and bottom by its neighbours rather than boxed, which is
 * how The Firm lists a set of facts.
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
		<div
			className={cn(
				"flex items-baseline justify-between gap-4 border-b border-[var(--pon-line)] py-2 last:border-b-0",
				className,
			)}
		>
			<span className="t-caption text-[var(--pon-fg-3)]">{label}</span>
			<span
				className={cn(
					"font-fono text-[12.5px] font-bold",
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
