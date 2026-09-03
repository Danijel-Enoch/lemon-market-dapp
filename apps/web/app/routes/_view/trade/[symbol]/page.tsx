import { PacificaPositions } from "@app/components/account/PacificaHoldings";
import { PriceChart } from "@app/components/chart/PriceChart";
import { Callout } from "@app/components/common/Callout";
import { MarketHoursBadge } from "@app/components/common/MarketHours";
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
			<div className="grid gap-2 lg:grid-cols-[1fr_301px]">
				<Skeleton className="h-[520px]" />
				<Skeleton className="h-[520px]" />
			</div>
		);
	}

	if (error || !market) {
		return (
			<Callout tone="warning" title="Market not found">
				<p>
					No Avantis market matches “{symbol}”.{" "}
					<Link to="/trade" className="underline">
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
		(token) => token.avantisSymbol === market.symbol && (token.buyable || token.sellable),
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
		<div className="space-y-2 pb-28 md:pb-0">
			{/*
			  Header: the market pill sits outside the readout strip, and the
			  strip itself scrolls horizontally rather than wrapping — so the
			  row keeps one height no matter how many figures it carries.
			*/}
			<div className="flex flex-col gap-2 md:flex-row md:items-stretch">
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

				<div className="flex min-w-0 flex-1 items-center gap-8 overflow-x-auto rounded-lg bg-[var(--surface-3)] px-4 py-2.5 scrollbar-hide md:h-14">
					{mark !== null && (
						<div className="min-w-fit">
							<p className="mb-1 t-caption text-[var(--ink-2)]">Price</p>
							<p className="font-fono t-label text-[var(--ink-1)]">{formatUsd(mark)}</p>
						</div>
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
									className="mb-1 whitespace-nowrap t-caption text-[var(--ink-2)] underline decoration-dashed underline-offset-2"
									title="Perp funding, annualised. Positive means that side receives funding."
								>
									Net Rate (L/S)
								</p>
								<p className="font-fono t-label">
									<span
										className={
											market.fundingLongPercentPerHour >= 0 ? "text-lime-400" : "text-red-400"
										}
									>
										{formatFundingApr(market.fundingLongPercentPerHour)}
									</span>
									<span className="text-[var(--ink-2)]"> / </span>
									<span
										className={
											market.fundingShortPercentPerHour >= 0 ? "text-lime-400" : "text-red-400"
										}
									>
										{formatFundingApr(market.fundingShortPercentPerHour)}
									</span>
								</p>
							</div>

							<div className="min-w-fit">
								<p className="mb-1 whitespace-nowrap t-caption text-[var(--ink-2)]">
									Open interest
								</p>
								<p className="font-fono t-label text-[var(--ink-1)]">
									{formatUsd(market.openInterest, { compact: true })}
								</p>
							</div>

							<div className="min-w-fit">
								<p className="mb-1 whitespace-nowrap t-caption text-[var(--ink-2)]">
									Available liquidity
								</p>
								<p className="font-fono t-label text-[var(--ink-1)]">
									{formatUsd(market.availableOpenInterest, { compact: true })}
								</p>
							</div>

							<div className="min-w-fit">
								<p className="mb-1 whitespace-nowrap t-caption text-[var(--ink-2)]">Max leverage</p>
								<p className="font-fono t-label text-[var(--ink-1)]">{market.maxLeverage}x</p>
							</div>
						</>
					) : (
						<div className="min-w-fit">
							<p
								className="mb-1 whitespace-nowrap t-caption text-[var(--ink-2)] underline decoration-dashed underline-offset-2"
								title="Measured cost of crossing the pool on a $100 trade."
							>
								Spot impact / $100
							</p>
							<p className="font-fono t-label text-amber-400">
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
								className="whitespace-nowrap rounded-full border border-lime-500/30 px-2.5 py-1 t-micro text-lime-400 transition-colors hover:bg-lime-500/10"
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

			<div className="grid gap-2 lg:grid-cols-[1fr_301px]">
				<div className="space-y-2">
					<div className="overflow-hidden rounded-lg bg-[var(--surface-3)]">
						<PriceChart symbol={market.symbol} />
					</div>

					<div className="rounded-lg bg-[var(--surface-3)] p-3">
						<Tabs value={panel} onValueChange={(value) => setPanel(value as Panel)}>
							<TabsList>
								<TabsTrigger value="positions">Positions</TabsTrigger>
								<TabsTrigger value="orders">Spot orders</TabsTrigger>
							</TabsList>
						</Tabs>

						<div className="mt-3">
							{panel === "positions" ? <PacificaPositions /> : <SpotLimitOrders />}
						</div>
					</div>
				</div>

				{/* Desktop: order entry alongside the chart. */}
				<aside className="hidden lg:sticky lg:top-[72px] lg:block lg:self-start">
					<div className="flex flex-col gap-3 rounded-lg bg-[var(--surface-3)] p-3">
						{venueToggle}
						{orderPanel}
						{!spotToken && (
							<p className="text-center t-micro text-[var(--ink-2)]">
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
