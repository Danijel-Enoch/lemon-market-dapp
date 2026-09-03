import { PacificaPositions } from "@app/components/account/PacificaHoldings";
import { PriceChart } from "@app/components/chart/PriceChart";
import { Callout } from "@app/components/common/Callout";
import { MarketHoursBadge } from "@app/components/common/MarketHours";
import { StatInline } from "@app/components/pons/StatCard";
import { SpotLimitOrders } from "@app/components/spot/SpotLimitOrders";
import { SpotTradePanel } from "@app/components/spot/SpotTradePanel";
import { MarketSelector } from "@app/components/trade/MarketSelector";
import { PacificaOrderForm } from "@app/components/trade/PacificaOrderForm";
import { Button } from "@app/components/ui/button";
import { MobileActionBar, Sheet } from "@app/components/ui/sheet";
import { Skeleton } from "@app/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { useMarket, useSpotTokens } from "@app/hooks/useMarketData";
import { marketsApi } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { formatFundingApr, formatPercent, formatUsd } from "@lemon/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, type MetaFunction, useParams } from "react-router";

export const meta: MetaFunction = ({ params }) => {
	const symbol = String(params.symbol ?? "").replace("-", "/");
	return [
		{ title: `${symbol} — Lemon Markets` },
		{ name: "description", content: `Trade ${symbol} spot and perpetuals on Base.` },
	];
};

type Venue = "perp" | "spot";
type Panel = "positions" | "orders";

export default function TradeTerminalPage() {
	const { symbol } = useParams();
	const queryClient = useQueryClient();
	const { data: market, isLoading, error } = useMarket(symbol);
	const { data: spotTokens } = useSpotTokens();

	const [venue, setVenue] = useState<Venue>("perp");
	const [panel, setPanel] = useState<Panel>("positions");
	const [sheetOpen, setSheetOpen] = useState(false);

	// Live mark price for the header.
	const { data: prices } = useQuery({
		queryKey: ["market-prices"],
		queryFn: () => marketsApi.prices(),
		refetchInterval: 10_000,
	});

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: ["perp-positions"] });
		queryClient.invalidateQueries({ queryKey: ["spot-limit-orders"] });
	};

	if (isLoading) {
		return (
			<div className="grid gap-3 lg:grid-cols-[1fr_320px]">
				<Skeleton className="h-[520px]" />
				<Skeleton className="h-[520px]" />
			</div>
		);
	}

	if (error || !market) {
		return (
			<Callout tone="warning" title="Market not found">
				<p>
					No market matches “{symbol}”.{" "}
					<Link to="/trade" className="font-semibold text-[var(--pon-lime)] underline">
						Back to markets
					</Link>
					.
				</p>
			</Callout>
		);
	}

	// The spot leg exists only where a Base token maps to this market and has a
	// live route. Without that, the venue toggle would offer a dead end.
	const spotToken = spotTokens?.tokens.find(
		(token) => token.perpSymbol === market.symbol && (token.buyable || token.sellable),
	);
	const activeVenue: Venue = venue === "spot" && !spotToken ? "perp" : venue;

	// Pacifica keys markets by symbol; there is no stable pair index.
	const mark = prices?.prices[market.symbol]?.price ?? null;

	const orderPanel =
		activeVenue === "spot" && spotToken ? (
			<SpotTradePanel token={spotToken} />
		) : (
			<PacificaOrderForm market={market} onSubmitted={refresh} />
		);

	const venueToggle = (
		<Tabs value={activeVenue} onValueChange={(value) => setVenue(value as Venue)}>
			<TabsList className="w-full">
				<TabsTrigger value="perp" className="flex-1">
					Perp
				</TabsTrigger>
				<TabsTrigger value="spot" className="flex-1" disabled={!spotToken}>
					Spot
				</TabsTrigger>
			</TabsList>
		</Tabs>
	);

	return (
		<div className="space-y-3 pb-28 md:pb-0">
			{/*
			  Header: the market pill sits outside the readout strip, and the
			  strip itself scrolls horizontally rather than wrapping — so the
			  row keeps one height no matter how many figures it carries.
			*/}
			<div className="flex flex-col gap-3 md:flex-row md:items-stretch">
				<div className="shrink-0">
					<MarketSelector
						current={{
							symbol: market.symbol,
							base: market.base,
							assetClass: market.assetClass,
							logoUrl: market.logoUrl,
						}}
					/>
				</div>

				<div className="flex min-w-0 flex-1 items-center gap-7 overflow-x-auto rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-4 py-3 scrollbar-hide md:h-[58px]">
					{mark !== null && (
						<StatInline className="min-w-fit" label="Price" value={formatUsd(mark)} />
					)}

					{/*
				  Funding and open interest are perp mechanics — holding spot
				  costs nothing and has no counterparty to pay. Showing them
				  while the spot venue is selected would imply a carrying cost
				  that does not exist, so the header swaps to the figure that
				  does apply to a spot trade: what crossing the pool costs.
				*/}
					{activeVenue === "perp" ? (
						<>
							<div className="min-w-fit">
								<p
									className="whitespace-nowrap t-micro text-[var(--pon-fg-3)] underline decoration-dashed underline-offset-2"
									title="Perp funding, annualised. Positive means that side receives funding."
								>
									Net Rate (L/S)
								</p>
								<p className="font-fono mt-0.5 text-[12.5px] font-semibold">
									<span
										className={
											market.fundingLongPercentPerHour >= 0
												? "text-[var(--pon-up)]"
												: "text-[var(--pon-down)]"
										}
									>
										{formatFundingApr(market.fundingLongPercentPerHour)}
									</span>
									<span className="text-[var(--pon-fg-3)]"> / </span>
									<span
										className={
											market.fundingShortPercentPerHour >= 0
												? "text-[var(--pon-up)]"
												: "text-[var(--pon-down)]"
										}
									>
										{formatFundingApr(market.fundingShortPercentPerHour)}
									</span>
								</p>
							</div>

							<StatInline
								className="min-w-fit whitespace-nowrap"
								label="Open interest"
								value={formatUsd(market.openInterest, { compact: true })}
							/>

							<StatInline
								className="min-w-fit whitespace-nowrap"
								label="Available liquidity"
								value={formatUsd(market.availableOpenInterest, { compact: true })}
							/>

							<StatInline
								className="min-w-fit whitespace-nowrap"
								label="Max leverage"
								value={`${market.maxLeverage}x`}
							/>
						</>
					) : (
						<div className="min-w-fit">
							<p
								className="whitespace-nowrap t-micro text-[var(--pon-fg-3)] underline decoration-dashed underline-offset-2"
								title="Measured cost of crossing the pool on a $100 trade."
							>
								Spot impact / $100
							</p>
							<p className="font-fono mt-0.5 text-[12.5px] font-semibold text-[var(--pon-amber)]">
								{spotToken?.buyPriceImpactPercent !== null &&
								spotToken?.buyPriceImpactPercent !== undefined
									? formatPercent(spotToken.buyPriceImpactPercent)
									: "—"}
							</p>
						</div>
					)}

					<div className="ml-auto flex min-w-fit items-center gap-2 pl-4">
						<MarketHoursBadge market={market} />
						{spotToken && (
							<Link
								to="/carry"
								className="whitespace-nowrap rounded-full border border-[var(--pon-lime)] bg-[var(--pon-lime-dim)] px-2.5 py-1 t-micro font-semibold text-[var(--pon-lime)] transition-colors hover:bg-[var(--pon-lime)]/20"
							>
								Carry available
							</Link>
						)}
					</div>
				</div>
			</div>

			{!market.isOpen && (
				<Callout tone="warning" title="Perp market closed">
					Perp orders are rejected while the market is shut
					{market.nextOpen && `; it reopens ${new Date(market.nextOpen * 1000).toLocaleString()}`}
					{spotToken && ". The spot token still trades 24/7"}.
				</Callout>
			)}

			<div className="grid gap-3 lg:grid-cols-[1fr_320px]">
				<div className="space-y-3">
					<div className="overflow-hidden rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)]">
						<PriceChart symbol={market.symbol} />
					</div>

					<div className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4">
						<Tabs value={panel} onValueChange={(value) => setPanel(value as Panel)}>
							<TabsList>
								<TabsTrigger value="positions">Positions</TabsTrigger>
								<TabsTrigger value="orders">Spot orders</TabsTrigger>
							</TabsList>
						</Tabs>

						<div className="mt-4">
							{panel === "positions" ? <PacificaPositions /> : <SpotLimitOrders />}
						</div>
					</div>
				</div>

				{/* Desktop: order entry alongside the chart. */}
				<aside className="hidden lg:sticky lg:top-[92px] lg:block lg:self-start">
					<div className="flex flex-col gap-3.5 rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-3.5">
						{venueToggle}
						{orderPanel}
						{!spotToken && (
							<p className="text-center t-micro text-[var(--pon-fg-3)]">
								No spot market — {market.base} has no routable token on Base.
							</p>
						)}
					</div>
				</aside>
			</div>

			{/* Mobile: order entry as a bottom sheet. */}
			<MobileActionBar>
				<Button
					type="button"
					onClick={() => setSheetOpen(true)}
					className={cn("w-full font-semibold")}
				>
					Trade {market.symbol}
				</Button>
			</MobileActionBar>

			<Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={`Trade ${market.symbol}`}>
				<div className="space-y-3">
					{venueToggle}
					{orderPanel}
				</div>
			</Sheet>
		</div>
	);
}
