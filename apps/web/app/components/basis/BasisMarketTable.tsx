import { MarketLogo } from "@app/components/common/MarketLogo";
import { cn } from "@app/lib/utils";
import type { BasisMarket } from "@lemon/core";
import { formatPercent, formatUsd } from "@lemon/core";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";

/**
 * The board.
 *
 * One row per tradable pair, ranked by net yield after costs. Three decisions
 * here are deliberate and worth keeping:
 *
 *   * **Net APY leads, funding APR follows.** Gross funding is the number every
 *     venue advertises and the one that most often misleads — a market can pay
 *     the best funding on the board and still lose money once a thin pool's
 *     slippage and four taker fills are priced in. Leading with the gross
 *     number would rank exactly that market first.
 *   * **Blocked markets stay on the board**, greyed, with their reason. A
 *     symbol that silently disappears is indistinguishable from one that was
 *     never listed.
 *   * **An unpriced spread renders as a dash, never as 0.00%.** Zero reads as
 *     "fairly priced"; the truth is that nobody is quoting a leg.
 */

/** Percent, signed, with a dash for genuinely unknown rather than a false zero. */
function signedPercent(value: number | null, digits = 2): string {
	if (value === null || !Number.isFinite(value)) return "—";
	return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function yieldTone(value: number): string {
	if (value > 0) return "text-[var(--pon-up)]";
	if (value < 0) return "text-[var(--pon-down)]";
	return "text-[var(--pon-fg)]";
}

function MarketRow({ market }: { market: BasisMarket }) {
	const blocked = market.blockers.length > 0;
	const { economics } = market;

	return (
		<Link
			to={`/markets/${market.id}`}
			className={cn(
				"group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--pon-line)] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--pon-surface-2)] md:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_auto] md:gap-4",
				blocked && "opacity-55",
			)}
		>
			{/* Identity */}
			<div className="flex min-w-0 items-center gap-3">
				<MarketLogo
					symbol={market.ticker}
					base={market.ticker}
					assetClass={market.assetClass}
					logoUrl={market.logoUrl}
					size={30}
				/>
				<div className="min-w-0">
					<p className="truncate text-[13.5px] font-semibold text-[var(--pon-fg)]">
						{market.ticker}
						<span className="ml-2 t-micro font-normal text-[var(--pon-fg-3)]">
							{market.spot.symbol} / {market.perp.symbol}
						</span>
					</p>
					<p className="truncate t-micro text-[var(--pon-fg-3)]">
						{blocked ? market.blockers[0] : market.name}
					</p>
				</div>
			</div>

			{/* Net APY — the headline, because it is the number to decide on. */}
			<div className="hidden md:block">
				<p className="t-micro text-[var(--pon-fg-3)]">Net APY</p>
				<p
					className={cn("font-fono text-[14px] font-semibold", yieldTone(economics.netApyPercent))}
				>
					{blocked ? "—" : formatPercent(economics.netApyPercent)}
				</p>
			</div>

			<div className="hidden md:block">
				<p className="t-micro text-[var(--pon-fg-3)]">Funding APR</p>
				<p
					className={cn("font-fono text-[13px]", yieldTone(economics.fundingAprPercent))}
					title="Annualised short-side funding, before any costs"
				>
					{formatPercent(economics.fundingAprPercent)}
				</p>
			</div>

			{/*
			  Spread and breakeven both derive from the spot price, and a blocked
			  market is usually blocked precisely because that price is not
			  trustworthy. Printing "-42.95%" beside a dashed net APY would
			  contradict the dash — and a reader takes the specific number over
			  the absent one every time.
			*/}
			<div className="hidden md:block">
				<p className="t-micro text-[var(--pon-fg-3)]">Spread</p>
				<p
					className="font-fono text-[13px] text-[var(--pon-fg-2)]"
					title="Perp mark against the executable spot price"
				>
					{blocked ? "—" : signedPercent(economics.basisPercent)}
				</p>
			</div>

			<div className="hidden md:block">
				<p className="t-micro text-[var(--pon-fg-3)]">Breakeven</p>
				<p className="font-fono text-[13px] text-[var(--pon-fg-2)]">
					{blocked
						? "—"
						: economics.breakevenDays === null
							? "never"
							: economics.breakevenDays < 1
								? "<1 day"
								: `${Math.round(economics.breakevenDays)}d`}
				</p>
			</div>

			{/* Mobile keeps only the number the decision turns on. */}
			<div className="flex items-center gap-3 md:gap-0">
				<div className="text-right md:hidden">
					<p className="t-micro text-[var(--pon-fg-3)]">Net APY</p>
					<p
						className={cn(
							"font-fono text-[14px] font-semibold",
							yieldTone(economics.netApyPercent),
						)}
					>
						{blocked ? "—" : formatPercent(economics.netApyPercent)}
					</p>
				</div>
				<ArrowUpRight
					size={16}
					aria-hidden
					className="shrink-0 text-[var(--pon-fg-4)] transition-colors group-hover:text-[var(--pon-lime)]"
				/>
			</div>
		</Link>
	);
}

export function BasisMarketTable({
	markets,
	referenceNotionalUsd,
}: {
	markets: BasisMarket[];
	/** The size every row is quoted at, named so the numbers are not read as size-free. */
	referenceNotionalUsd?: number;
}) {
	return (
		<div className="overflow-hidden rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface)]">
			<div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-4 py-2.5">
				<span className="pon-section-label">Basis markets</span>
				{referenceNotionalUsd !== undefined && (
					<span className="t-micro text-[var(--pon-fg-3)]">
						Yields quoted at {formatUsd(referenceNotionalUsd)} per leg, after the 0.4% round trip
					</span>
				)}
			</div>
			{markets.map((market) => (
				<MarketRow key={market.id} market={market} />
			))}
		</div>
	);
}
