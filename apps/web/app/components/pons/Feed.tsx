import { cn } from "@app/lib/utils";
import type { ReactNode } from "react";

/**
 * Row lists.
 *
 * Pons has one row rhythm for every stream on the site — trades, launches,
 * fills: a leading mark, a two-line identity in the middle, a right-aligned
 * two-line figure, and a hairline between rows that the last row drops.
 */

export function RowList({ className, children }: { className?: string; children: ReactNode }) {
	return <div className={cn("[&>*:last-child]:border-b-0", className)}>{children}</div>;
}

export function FeedRow({
	mark,
	title,
	subtitle,
	value,
	meta,
	tone,
	className,
}: {
	mark?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	value?: ReactNode;
	meta?: ReactNode;
	tone?: "positive" | "negative" | "neutral";
	className?: string;
}) {
	return (
		<div
			className={cn("flex items-center gap-3 border-b border-[var(--pon-line)] py-2.5", className)}
		>
			{mark && <div className="shrink-0">{mark}</div>}
			<div className="min-w-0 flex-1">
				<div className="truncate text-[13px] font-semibold text-[var(--pon-fg)]">{title}</div>
				{subtitle && (
					<div className="font-fono truncate t-micro text-[var(--pon-fg-3)]">{subtitle}</div>
				)}
			</div>
			{(value || meta) && (
				<div className="shrink-0 text-right">
					{value && (
						<div
							className={cn(
								"font-fono text-xs font-semibold",
								tone === "positive" && "text-[var(--pon-up)]",
								tone === "negative" && "text-[var(--pon-down)]",
								(!tone || tone === "neutral") && "text-[var(--pon-fg)]",
							)}
						>
							{value}
						</div>
					)}
					{meta && <div className="t-micro text-[var(--pon-fg-3)]">{meta}</div>}
				</div>
			)}
		</div>
	);
}

/**
 * Square asset mark — the rounded tile Pons puts at the head of a feed row,
 * holding a logo, a glyph or a flat colour.
 */
export function AssetMark({
	children,
	color = "var(--pon-surface-2)",
	size = 32,
	className,
}: {
	children?: ReactNode;
	color?: string;
	size?: number;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"flex shrink-0 items-center justify-center overflow-hidden rounded-[9px]",
				className,
			)}
			style={{ width: size, height: size, background: color, fontSize: size * 0.5 }}
		>
			{children}
		</span>
	);
}

/**
 * Direction arrow — the coloured glyph that opens a trade row. Kept as its own
 * piece so buy/sell colour is decided once rather than at every call site.
 */
export function DirectionMark({ side }: { side: "buy" | "sell" | "long" | "short" }) {
	const up = side === "buy" || side === "long";
	return (
		<span
			aria-hidden
			className="text-sm"
			style={{ color: up ? "var(--pon-up)" : "var(--pon-down)" }}
		>
			{up ? "↗" : "↙"}
		</span>
	);
}

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
