import type { ReactNode } from "react";
import { cn } from "../utils";

/**
 * Readout tile.
 *
 * The compact Pons stat: a hairline panel on the well surface with a quiet
 * label over a tabular figure. This is the dense form used inside cards and
 * strips — for the headline three-up row at the top of a page, use StatCard.
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
				"rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-3",
				className,
			)}
		>
			<p className="t-micro text-[var(--pon-fg-3)]">{label}</p>
			<p
				className={cn(
					"font-fono mt-1.5 text-base font-semibold leading-tight",
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
