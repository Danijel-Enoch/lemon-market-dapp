import type { ReactNode } from "react";
import { cn } from "../utils";

/**
 * Readout tile.
 *
 * The compact stat: a hairline cell with a monospaced caps label over a
 * tabular figure. This is the dense form used inside cards and strips — for
 * the headline three-up row at the top of a page, use StatCard, which sets its
 * figure in the serif.
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
		<div
			className={cn(
				"rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-3 py-2.5",
				className,
			)}
		>
			<p className="firm-label text-[var(--pon-fg-3)]">{label}</p>
			<p
				className={cn(
					"font-fono mt-1.5 text-[17px] font-bold leading-tight",
					tone === "positive" && "text-[var(--pon-up)]",
					tone === "negative" && "text-[var(--pon-down)]",
					(!tone || tone === "neutral") && "text-[var(--pon-fg)]",
				)}
			>
				{value}
			</p>
			{hint && <p className="mt-1 t-micro text-[var(--pon-fg-3)]">{hint}</p>}
		</div>
	);
}
