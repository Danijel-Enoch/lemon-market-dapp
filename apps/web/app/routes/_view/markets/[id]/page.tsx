import { BasisTicket } from "@app/components/basis/BasisTicket";
import { PriceChart } from "@app/components/chart/PriceChart";
import { Callout } from "@app/components/common/Callout";
import { MarketLogo } from "@app/components/common/MarketLogo";
import { StatTile, toneForValue } from "@app/components/common/StatTile";
import { Badge } from "@app/components/ui/badge";
import { MobileActionBar, Sheet } from "@app/components/ui/sheet";
import { Skeleton } from "@app/components/ui/skeleton";
import { useBasisMarket } from "@app/hooks/useMarketData";
import { formatPercent, formatUsd } from "@lemon/core";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, type MetaFunction, useParams } from "react-router";

export const meta: MetaFunction = ({ params }) => [
	{ title: `${String(params.id ?? "Market").toUpperCase()} basis — Lemon` },
	{
		name: "description",
		content: "Spot-versus-perp basis: live spread, funding, costs and the position ticket.",
	},
];

/** A spread nobody is quoting is unknown, not flat. */
function spread(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return "—";
	return `${value > 0 ? "+" : ""}${value.toFixed(3)}%`;
}

function price(value: number | null): string {
	return value === null ? "—" : formatUsd(value);
}

export default function MarketDetailPage() {
	const { id } = useParams();
	const { data: market, isLoading, isError } = useBasisMarket(id);
	// On a phone the ticket lives in a sheet behind a thumb-reachable bar. Below
	// the chart it would mean scrolling away from the price to place the trade.
	const [ticketOpen, setTicketOpen] = useState(false);

	if (isLoading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-[120px]" />
				<Skeleton className="h-[420px]" />
			</div>
		);
	}

	if (isError || !market) {
		return (
			<div className="space-y-4">
				<Link to="/" className="inline-flex items-center gap-1.5 t-caption text-[var(--pon-fg-3)]">
					<ArrowLeft size={14} aria-hidden /> All markets
				</Link>
				<Callout tone="danger" title="No such basis market">
					A basis market exists only where both legs do — a Base token the aggregator can route
					into, and a Pacifica perp on the same underlying. Nothing here matches {id}.
				</Callout>
			</div>
		);
	}

	const { economics, spot, perp } = market;
	const blocked = market.blockers.length > 0;

	return (
		// Extra bottom room on small screens: the sticky action bar sits above the
		// tab bar, and without this the last card hides behind both.
		<div className="space-y-5 pb-16 md:space-y-7 lg:pb-0">
			<Link
				to="/"
				className="inline-flex items-center gap-1.5 t-caption text-[var(--pon-fg-3)] transition-colors hover:text-[var(--pon-fg)]"
			>
				<ArrowLeft size={14} aria-hidden /> All markets
			</Link>

			{/* Identity bar */}
			<header className="flex flex-wrap items-center gap-3 rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-4 py-3.5 md:gap-4 md:px-5 md:py-4">
				<MarketLogo
					symbol={market.ticker}
					base={market.ticker}
					assetClass={market.assetClass}
					logoUrl={market.logoUrl}
					size={38}
				/>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-display text-[20px] font-bold text-[var(--pon-fg-0)] md:text-[22px]">
							{market.ticker}
						</h1>
						<Badge>{market.assetClass === "equity" ? "Tokenized stock" : "Crypto"}</Badge>
						{blocked && <Badge>Unavailable</Badge>}
					</div>
					<p className="mt-0.5 t-caption text-[var(--pon-fg-3)]">
						{market.name} · long {spot.symbol} on Base, short {perp.symbol} on Pacifica
					</p>
				</div>
				<div className="text-right">
					<p className="t-micro text-[var(--pon-fg-3)]">Net APY</p>
					<p
						className={
							economics.netApyPercent >= 0
								? "font-fono text-[22px] font-semibold text-[var(--pon-up)] md:text-[26px]"
								: "font-fono text-[22px] font-semibold text-[var(--pon-down)] md:text-[26px]"
						}
					>
						{blocked ? "—" : formatPercent(economics.netApyPercent)}
					</p>
				</div>
			</header>

			{market.blockers.map((blocker) => (
				<Callout key={blocker} tone="danger" title="This market cannot be entered right now">
					{blocker}
				</Callout>
			))}

			<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
				<div className="space-y-5 md:space-y-6">
					{/* The economics, in the order a decision actually uses them. */}
					<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
						<StatTile
							label="Funding APR"
							value={formatPercent(economics.fundingAprPercent)}
							hint="short side, on notional"
							tone={toneForValue(economics.fundingAprPercent)}
						/>
						{/*
						  Everything below funding APR is derived from the spot price,
						  and a blocked market is usually blocked because that price
						  cannot be trusted. They dash out together rather than
						  printing a precise figure next to an absent one.
						*/}
						<StatTile
							label="Net APY"
							value={blocked ? "—" : formatPercent(economics.netApyPercent)}
							hint={`on capital, at ${formatUsd(economics.referenceNotionalUsd)}`}
							tone={blocked ? "neutral" : toneForValue(economics.netApyPercent)}
						/>
						<StatTile
							label="Round trip"
							value={blocked ? "—" : `${economics.roundTripCostPercent.toFixed(2)}%`}
							hint="fees + measured slippage"
						/>
						<StatTile
							label="Spread"
							value={blocked ? "—" : spread(economics.basisPercent)}
							hint="perp mark vs spot mid"
						/>
						<StatTile
							label="Breakeven"
							value={
								blocked
									? "—"
									: economics.breakevenDays === null
										? "never"
										: economics.breakevenDays < 1
											? "<1 day"
											: `${Math.round(economics.breakevenDays)} days`
							}
							hint="funding covers the round trip"
						/>
						<StatTile
							label="Max leverage"
							value={`${perp.maxLeverage}x`}
							hint={`min ${formatUsd(perp.minPositionUsdc)}`}
						/>
					</div>

					<PriceChart marketId={market.id} symbol={perp.symbol} />

					{/* Both legs, side by side, because a basis market is the pair. */}
					<div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
						{/*
						  The walkthrough spotlights this card alone rather than the pair.
						  Stacked on a phone the two legs are taller than the screen, and a
						  spotlight that covers everything highlights nothing.
						*/}
						<section
							data-tour="market-legs"
							className="rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-5"
						>
							<h2 className="pon-section-label mb-3">Spot leg — long</h2>
							<dl className="space-y-2.5">
								<Row label="Token" value={spot.symbol} />
								<Row label="Price" value={price(spot.priceUsd)} />
								<Row
									label="Price impact"
									value={
										spot.priceImpactPercent === null
											? "—"
											: `${spot.priceImpactPercent.toFixed(3)}%`
									}
								/>
								<Row label="Venue" value="KyberSwap on Base" />
								<Row
									label="Routable"
									value={
										spot.probeFailed
											? "unknown"
											: spot.buyable && spot.sellable
												? "in and out"
												: spot.buyable
													? "in only"
													: "no"
									}
								/>
							</dl>
							<p className="mt-3 t-micro text-[var(--pon-fg-4)]">
								Price is what a real route fills at, not an oracle mid — on a thin pool the two can
								differ by more than the whole funding edge.
							</p>
						</section>

						<section className="rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-5">
							<h2 className="pon-section-label mb-3">Perp leg — short</h2>
							<dl className="space-y-2.5">
								<Row label="Market" value={perp.symbol} />
								<Row label="Mark" value={price(perp.markPrice)} />
								<Row
									label="Funding / hour"
									value={`${perp.fundingShortPercentPerHour > 0 ? "+" : ""}${perp.fundingShortPercentPerHour.toFixed(5)}%`}
								/>
								<Row
									label="Open interest"
									value={formatUsd(perp.openInterest, { compact: true })}
								/>
								<Row
									label="Headroom"
									value={formatUsd(perp.availableOpenInterest, { compact: true })}
								/>
							</dl>
							<p className="mt-3 t-micro text-[var(--pon-fg-4)]">
								A positive funding rate means the short side receives. Negative means it pays.
							</p>
						</section>
					</div>
				</div>

				{/* Desktop: the ticket rides alongside the chart. */}
				<div data-tour="ticket" className="hidden lg:sticky lg:top-[92px] lg:block lg:self-start">
					<BasisTicket market={market} />
				</div>
			</div>

			{/* Phone and tablet: a sticky bar, and the ticket in a sheet. */}
			<MobileActionBar>
				<button
					type="button"
					data-tour="ticket"
					onClick={() => setTicketOpen(true)}
					disabled={blocked}
					className="flex min-h-12 w-full items-center justify-between gap-3 rounded-full bg-[var(--pon-lime)] px-5 text-[14px] font-bold text-[var(--pon-on-lime)] transition-colors disabled:bg-[var(--pon-surface-2)] disabled:text-[var(--pon-fg-3)]"
				>
					<span>{blocked ? "Not tradable right now" : `Open ${market.ticker} basis`}</span>
					{!blocked && (
						<span className="font-fono text-[13px] opacity-80">
							{formatPercent(economics.netApyPercent)}
						</span>
					)}
				</button>
			</MobileActionBar>

			<Sheet open={ticketOpen} onOpenChange={setTicketOpen} title={`${market.ticker} basis`}>
				<BasisTicket market={market} inSheet />
			</Sheet>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="t-caption text-[var(--pon-fg-3)]">{label}</dt>
			<dd className="font-fono text-[12.5px] text-[var(--pon-fg)]">{value}</dd>
		</div>
	);
}
