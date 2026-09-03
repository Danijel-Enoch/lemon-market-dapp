import { cn } from "@app/lib/utils";
import type { Market } from "@lemon/core";

function formatWhen(timestamp: number | null): string | null {
	if (!timestamp) return null;
	return new Date(timestamp * 1000).toLocaleString(undefined, {
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * Market-hours indicator.
 *
 * Equities and FX follow real trading calendars, so a closed market rejects
 * orders outright. Showing the reopen time turns a dead button into something
 * the user can plan around.
 */
export function MarketHoursBadge({ market, className }: { market: Market; className?: string }) {
	const when = formatWhen(market.isOpen ? market.nextClose : market.nextOpen);

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 t-micro",
				market.isOpen
					? "border-[var(--pon-lime)] bg-[var(--pon-lime-dim)] font-semibold text-[var(--pon-lime)]"
					: "border-[var(--pon-line)] bg-[var(--pon-surface-2)] text-[var(--pon-fg-3)]",
				className,
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					market.isOpen ? "animate-pon-pulse bg-[var(--pon-lime)]" : "bg-[var(--pon-fg-3)]",
				)}
				aria-hidden
			/>
			{market.isOpen ? "Open" : "Closed"}
			{when && (
				<span className="opacity-70">
					· {market.isOpen ? "closes" : "opens"} {when}
				</span>
			)}
		</span>
	);
}
