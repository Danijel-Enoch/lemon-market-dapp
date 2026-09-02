import { useMarkets } from "@app/hooks/useMarketData";
import { cn } from "@app/lib/utils";
import { Link } from "react-router";

/**
 * The live market strip that fills the wide block in the hero stat row.
 *
 * Avantis parks a chart there; a scrolling tape of what is actually listed says
 * the same thing with real data. The track is duplicated so the CSS marquee in
 * `globals.css` can loop at -50% without a visible seam.
 */
export function MarketTicker({ className }: { className?: string }) {
	const { data } = useMarkets();
	const markets = data?.markets ?? [];

	if (markets.length === 0) {
		return (
			<div
				className={cn(
					"flex items-center justify-center rounded-lg bg-[var(--surface-3)] px-6",
					className,
				)}
			>
				<span className="t-label text-[var(--ink-2)]">Loading markets…</span>
			</div>
		);
	}

	const track = markets.slice(0, 24);

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-lg bg-[var(--surface-3)]",
				// Fade both ends so items enter and leave the strip rather than
				// being clipped mid-glyph.
				"[mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]",
				className,
			)}
		>
			<div
				className="flex h-full w-max items-center gap-8 px-6 animate-scroll-ticker"
				style={{ ["--scroll-ticker-duration" as string]: "70s" }}
			>
				{[...track, ...track].map((market, index) => (
					<Link
						key={`${market.symbol}-${index}`}
						to={`/trade/${market.symbol.replace("/", "-")}`}
						className="group flex shrink-0 items-center gap-2.5"
					>
						{market.logoUrl ? (
							<img
								src={market.logoUrl}
								alt=""
								width={20}
								height={20}
								className="size-5 shrink-0 rounded-full object-contain"
								aria-hidden
							/>
						) : (
							<span
								className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-5)] text-[9px] font-medium text-[var(--ink-2)]"
								aria-hidden
							>
								{market.base.slice(0, 2)}
							</span>
						)}
						<span className="whitespace-nowrap font-fono t-caption text-[var(--ink-1)] transition-colors group-hover:text-lime-400">
							{market.base}
						</span>
						<span
							className={cn(
								"whitespace-nowrap font-fono t-micro",
								market.isOpen ? "text-lime-400/80" : "text-[var(--ink-2)]",
							)}
						>
							{market.maxLeverage}x
						</span>
					</Link>
				))}
			</div>
		</div>
	);
}
