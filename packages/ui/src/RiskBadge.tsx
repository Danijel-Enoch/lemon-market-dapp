import { Shield, TrendingUp } from "lucide-react";
import { cn } from "./utils";

/**
 * The tier, stated plainly.
 *
 * These are two different products, not two settings, and the badge is the main
 * place a user encounters that. So it says what the tier *means* — "no leverage"
 * rather than "conservative" — because the label alone tells someone nothing
 * about whether the position they are buying can be liquidated.
 */
export function RiskBadge({
	tier,
	leverageLabel,
	className,
	size = "md",
}: {
	tier: "CONSERVATIVE" | "LEVERAGED";
	leverageLabel?: string;
	className?: string;
	size?: "sm" | "md";
}) {
	const conservative = tier === "CONSERVATIVE";
	const Icon = conservative ? Shield : TrendingUp;

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-[var(--pon-r-sm)] border font-mono tracking-[-0.02em] whitespace-nowrap",
				size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]",
				conservative
					? "border-[var(--pon-accent)] bg-transparent text-[var(--pon-accent)]"
					: "border-[var(--pon-amber)] bg-[var(--pon-lime-dim)] text-[var(--pon-amber)]",
				className,
			)}
		>
			<Icon className={size === "sm" ? "size-3" : "size-3.5"} />
			{conservative ? "No leverage" : `Leveraged ${leverageLabel ?? ""}`.trim()}
		</span>
	);
}

/**
 * The one-line explanation that goes with the badge.
 *
 * Both sentences name the actual risk rather than gesturing at it. "Can be
 * liquidated" is the fact a leveraged depositor needs, and softening it into
 * "higher risk" would leave them to guess what kind.
 */
export function riskDescription(tier: "CONSERVATIVE" | "LEVERAGED"): string {
	return tier === "CONSERVATIVE"
		? "The hedge is fully collateralised, so no price move can liquidate it. You earn what the market pays on capital put to work one-for-one."
		: "The hedge runs at 2–3x, which multiplies what the same capital earns and introduces a liquidation price. A sharp move against it can lose capital.";
}
