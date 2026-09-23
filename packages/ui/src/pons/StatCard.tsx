import type { ReactNode } from "react";
import { cn } from "../utils";

/**
 * Stat card.
 *
 * The headline readout: a monospaced caps label over a heavy serif figure,
 * with the delta under it. The figure is the one number in the system set in
 * the serif rather than the mono — The Firm prints its AUM that way, and at
 * this size the serif is what makes a readout read as a statement rather than
 * as a cell. A hairline box, no fill.
 */
export function StatCard({
	label,
	value,
	delta,
	tone,
	className,
}: {
	label: ReactNode;
	value: ReactNode;
	delta?: ReactNode;
	tone?: "positive" | "negative" | "neutral";
	className?: string;
}) {
	return (
		<div
			className={cn(
				// Two of these sit side by side on a phone, where the desktop
				// padding around a 40px figure leaves the label nowhere to go.
				"rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] p-3.5 md:p-5",
				className,
			)}
		>
			<p className="firm-label text-[var(--pon-fg-3)]">{label}</p>
			<p className="font-display mt-2 text-[28px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-[var(--pon-fg-0)] md:mt-3 md:text-[40px]">
				{value}
			</p>
			{delta && (
				<p
					className={cn(
						"mt-2 t-caption md:mt-3",
						tone === "positive" && "text-[var(--pon-up)]",
						tone === "negative" && "text-[var(--pon-down)]",
						(!tone || tone === "neutral") && "text-[var(--pon-fg-3)]",
					)}
				>
					{delta}
				</p>
			)}
		</div>
	);
}

/**
 * Inline stat block — the small three-up readout Pons nests inside a card,
 * on the well surface, under a headline bar or chart.
 */
export function StatBlock({
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
				"rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-3 py-2.5",
				className,
			)}
		>
			<p className="firm-label text-[var(--pon-fg-3)]">{label}</p>
			<p
				className={cn(
					"font-fono mt-1.5 text-[15px] font-semibold",
					tone === "positive" && "text-[var(--pon-up)]",
					tone === "negative" && "text-[var(--pon-down)]",
					(!tone || tone === "neutral") && "text-[var(--pon-fg)]",
				)}
			>
				{value}
			</p>
		</div>
	);
}

/**
 * Bare readout — label over figure with no container at all. Pons uses this in
 * dense strips like the symbol bar, where each cell already has the bar's frame
 * around it and a second border would double up.
 */
export function StatInline({
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
		<div className={className}>
			<p className="firm-label text-[var(--pon-fg-3)]">{label}</p>
			<p
				className={cn(
					"font-fono mt-0.5 text-[12.5px] font-semibold",
					tone === "positive" && "text-[var(--pon-up)]",
					tone === "negative" && "text-[var(--pon-down)]",
					(!tone || tone === "neutral") && "text-[var(--pon-fg)]",
				)}
			>
				{value}
			</p>
		</div>
	);
}

/**
 * Colour a number by sign, for PnL and funding readouts.
 *
 * Lives here rather than in both readout components. They had byte-identical
 * copies before the design system was extracted, which is exactly the drift a
 * shared package exists to stop.
 */
export function toneForValue(value: number): "positive" | "negative" | "neutral" {
	if (value > 0) return "positive";
	if (value < 0) return "negative";
	return "neutral";
}
