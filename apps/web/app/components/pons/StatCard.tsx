import { cn } from "@app/lib/utils";
import type { ReactNode } from "react";

/**
 * Stat card.
 *
 * The Pons headline readout: a quiet label, a 38px tabular figure, and a delta
 * line under it coloured by direction. It is a full card — hairline frame, card
 * surface — rather than a flat tile, because Pons puts these in a row of three
 * at the top of a page where they carry the section.
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
				// Two of these sit side by side on a phone, where 22px of padding
				// around a 38px figure leaves the label with nowhere to go.
				"rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-3.5 md:p-[22px]",
				className,
			)}
		>
			<p className="t-caption text-[var(--pon-fg-3)]">{label}</p>
			<p className="font-fono mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-[var(--pon-fg)] md:mt-3 md:text-[38px]">
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
				"rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-3",
				className,
			)}
		>
			<p className="t-micro text-[var(--pon-fg-3)]">{label}</p>
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
			<p className="t-micro text-[var(--pon-fg-3)]">{label}</p>
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

/** Colour a number by sign, for PnL and funding readouts. */
export function toneForValue(value: number): "positive" | "negative" | "neutral" {
	if (value > 0) return "positive";
	if (value < 0) return "negative";
	return "neutral";
}
