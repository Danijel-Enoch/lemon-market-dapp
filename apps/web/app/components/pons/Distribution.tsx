import { cn } from "@app/lib/utils";

export type DistributionSlice = {
	label: string;
	/** 0–1 share of the whole. */
	value: number;
	color: string;
};

/**
 * Distribution bar.
 *
 * Pons shows a composition as one continuous pill split into segments, with
 * the legend as a two-column key underneath rather than inline labels — so the
 * bar stays readable when a slice is only a few percent wide.
 */
export function DistributionBar({
	slices,
	className,
}: {
	slices: DistributionSlice[];
	className?: string;
}) {
	const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0) || 1;

	return (
		<div className={className}>
			<div className="flex h-3 overflow-hidden rounded-full">
				{slices.map((slice) => (
					<div
						key={slice.label}
						style={{
							width: `${(Math.max(0, slice.value) / total) * 100}%`,
							background: slice.color,
						}}
					/>
				))}
			</div>

			<div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
				{slices.map((slice) => (
					<div key={slice.label} className="flex items-center justify-between gap-3">
						<span className="inline-flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--pon-fg-2)]">
							<span
								aria-hidden
								className="size-2.5 shrink-0 rounded-[3px]"
								style={{ background: slice.color }}
							/>
							<span className="truncate">{slice.label}</span>
						</span>
						<span className="font-fono shrink-0 text-[12.5px] font-semibold text-[var(--pon-fg)]">
							{Math.round((Math.max(0, slice.value) / total) * 100)}%
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

/** The palette Pons cycles through for composition segments. */
export const DISTRIBUTION_COLORS = [
	"var(--pon-lime)",
	"var(--pon-accent)",
	"var(--pon-accent-2)",
	"var(--pon-purple)",
	"var(--pon-amber)",
	"var(--pon-fg-3)",
] as const;

/**
 * Depth ladder.
 *
 * The Pons order book row: price and size as tabular text over a depth bar that
 * fills from the right. The bar is a background element rather than a sibling
 * so the numbers stay legible at any depth.
 */
export function DepthRow({
	price,
	size,
	depth,
	side,
	onClick,
}: {
	price: string;
	size: string;
	/** 0–1 share of the deepest level in view. */
	depth: number;
	side: "bid" | "ask";
	onClick?: () => void;
}) {
	const bid = side === "bid";
	const Element = onClick ? "button" : "div";

	return (
		<Element
			type={onClick ? "button" : undefined}
			onClick={onClick}
			className={cn(
				"font-fono relative flex w-full items-center justify-between px-1 py-[3px] text-[10.5px]",
				onClick && "hover:bg-[var(--pon-surface-2)]",
			)}
		>
			<span
				aria-hidden
				className="absolute inset-y-0 right-0"
				style={{
					width: `${Math.max(0, Math.min(1, depth)) * 100}%`,
					background: bid ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
				}}
			/>
			<span className="relative" style={{ color: bid ? "var(--pon-up)" : "var(--pon-down)" }}>
				{price}
			</span>
			<span className="relative text-[var(--pon-fg-2)]">{size}</span>
		</Element>
	);
}
