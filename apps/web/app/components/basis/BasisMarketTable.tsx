import { MarketLogo } from "@app/components/common/MarketLogo";
import { cn } from "@app/lib/utils";
import type { BasisMarket } from "@lemon/core";
import { formatPercent, formatUsd } from "@lemon/core";
import { ChevronRight } from "lucide-react";
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
 *
 * Mobile is a separate layout rather than a squeezed version of the table. Four
 * numeric columns cannot survive 390px, and the usual fixes are both bad: a
 * horizontal scroller hides the columns that decide the trade behind a gesture
 * nobody performs, and dropping to Net APY alone leaves a row you cannot judge.
 * The phone layout keeps all four, stacked as a headline plus a metric strip.
 */

/** Percent, signed, with a dash for genuinely unknown rather than a false zero. */
function signedPercent(value: number | null, digits = 2): string {
	if (value === null || !Number.isFinite(value)) return "—";
	return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function breakeven(days: number | null): string {
	if (days === null) return "never";
	if (days < 1) return "<1d";
	return `${Math.round(days)}d`;
}

function yieldTone(value: number): string {
	if (value > 0) return "text-[var(--pon-up)]";
	if (value < 0) return "text-[var(--pon-down)]";
	return "text-[var(--pon-fg)]";
}

/** Label over figure — the repeated unit of both layouts. */
function Metric({
	label,
	value,
	className,
	title,
}: {
	label: string;
	value: string;
	className?: string;
	title?: string;
}) {
	return (
		<div title={title}>
			<p className="t-micro text-[var(--pon-fg-3)]">{label}</p>
			<p className={cn("font-fono text-[13px]", className ?? "text-[var(--pon-fg-2)]")}>{value}</p>
		</div>
	);
}

function MarketRow({ market, tourTarget }: { market: BasisMarket; tourTarget?: string }) {
	const blocked = market.blockers.length > 0;
	const { economics } = market;
	const netApy = blocked ? "—" : formatPercent(economics.netApyPercent);

	return (
		<Link
			to={`/markets/${market.id}`}
			data-tour={tourTarget}
			className={cn(
				"block border-b border-[var(--pon-line)] px-4 py-3.5 transition-colors last:border-b-0",
				"hover:bg-[var(--pon-surface-2)] active:bg-[var(--pon-surface-2)]",
				blocked && "opacity-55",
			)}
		>
			{/* ---------------------------------------------------------- phone */}
			<div className="md:hidden">
				<div className="flex items-center gap-3">
					<MarketLogo
						symbol={market.ticker}
						base={market.ticker}
						assetClass={market.assetClass}
						logoUrl={market.logoUrl}
						size={34}
					/>
					<div className="min-w-0 flex-1">
						<p className="truncate text-[15px] font-semibold text-[var(--pon-fg)]">
							{market.ticker}
						</p>
						<p className="truncate t-micro text-[var(--pon-fg-3)]">
							{market.spot.symbol} / {market.perp.symbol}
						</p>
					</div>
					<div className="shrink-0 text-right">
						<p
							className={cn(
								"font-fono text-[17px] font-semibold leading-none",
								yieldTone(economics.netApyPercent),
							)}
						>
							{netApy}
						</p>
						<p className="mt-1 t-micro text-[var(--pon-fg-3)]">Net APY</p>
					</div>
					<ChevronRight size={16} aria-hidden className="shrink-0 text-[var(--pon-fg-4)]" />
				</div>

				{blocked ? (
					<p className="mt-2.5 rounded-[var(--pon-r-sm)] bg-[var(--pon-surface-2)] px-2.5 py-1.5 t-micro leading-relaxed text-[var(--pon-fg-3)]">
						{market.blockers[0]}
					</p>
				) : (
					<div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-[var(--pon-line)] pt-2.5">
						<Metric
							label="Funding APR"
							value={formatPercent(economics.fundingAprPercent)}
							className={yieldTone(economics.fundingAprPercent)}
						/>
						<Metric label="Spread" value={signedPercent(economics.basisPercent)} />
						<Metric label="Breakeven" value={breakeven(economics.breakevenDays)} />
					</div>
				)}
			</div>

			{/* -------------------------------------------------------- desktop */}
			<div className="hidden md:grid md:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_auto] md:items-center md:gap-4">
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

				<Metric
					label="Net APY"
					value={netApy}
					className={cn("text-[14px] font-semibold", yieldTone(economics.netApyPercent))}
				/>
				<Metric
					label="Funding APR"
					value={formatPercent(economics.fundingAprPercent)}
					className={yieldTone(economics.fundingAprPercent)}
					title="Annualised short-side funding, before any costs"
				/>
				{/*
				  Spread and breakeven both derive from the spot price, and a blocked
				  market is usually blocked precisely because that price is not
				  trustworthy. Printing "-42.95%" beside a dashed net APY would
				  contradict the dash — and a reader takes the specific number over
				  the absent one every time.
				*/}
				<Metric
					label="Spread"
					value={blocked ? "—" : signedPercent(economics.basisPercent)}
					title="Perp mark against the executable spot price"
				/>
				<Metric label="Breakeven" value={blocked ? "—" : breakeven(economics.breakevenDays)} />

				<ChevronRight size={16} aria-hidden className="shrink-0 text-[var(--pon-fg-4)]" />
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
			<div className="flex flex-wrap items-baseline justify-between gap-1.5 border-b border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-4 py-2.5">
				<span className="pon-section-label">Basis markets</span>
				{referenceNotionalUsd !== undefined && (
					<span className="t-micro text-[var(--pon-fg-3)]">
						Quoted at {formatUsd(referenceNotionalUsd)} per leg, after the 0.4% round trip
					</span>
				)}
			</div>
			{markets.map((market, index) => (
				<MarketRow
					key={market.id}
					market={market}
					// The walkthrough points at the top row, which is also the one
					// a first-time reader is most likely to open.
					tourTarget={index === 0 ? "market-row" : undefined}
				/>
			))}
		</div>
	);
}
