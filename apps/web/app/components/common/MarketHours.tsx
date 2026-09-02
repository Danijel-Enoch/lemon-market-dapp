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
				"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
				market.isOpen
					? "border-lime-500/30 bg-lime-500/10 text-lime-300"
					: "border-gray-500/30 bg-gray-500/10 text-gray-400",
				className,
			)}
		>
			<span
				className={cn("size-1.5 rounded-full", market.isOpen ? "bg-lime-400" : "bg-gray-500")}
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
