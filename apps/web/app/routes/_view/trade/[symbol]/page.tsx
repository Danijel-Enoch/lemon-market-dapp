import { PriceChart } from "@app/components/chart/PriceChart";
import { Callout } from "@app/components/common/Callout";
import { MarketHoursBadge } from "@app/components/common/MarketHours";
import { SpotLimitOrders } from "@app/components/spot/SpotLimitOrders";
import { SpotTradePanel } from "@app/components/spot/SpotTradePanel";
import { MarketSelector } from "@app/components/trade/MarketSelector";
import { PerpOrderForm } from "@app/components/trade/PerpOrderForm";
import { PerpPositionsTable } from "@app/components/trade/PerpPositionsTable";
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
			<div className="grid gap-4 lg:grid-cols-[1fr_340px]">
				<Skeleton className="h-[520px] rounded-xl" />
				<Skeleton className="h-[520px] rounded-xl" />
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

	const mark = prices?.prices[String(market.pairIndex)]?.price ?? null;

	const orderPanel =
		activeVenue === "spot" && spotToken ? (
			<SpotTradePanel token={spotToken} />
		) : (
			<PerpOrderForm market={market} onSubmitted={refresh} />
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
		<div className="space-y-4 pb-28 md:pb-0">
			{/* Header: market picker, live mark, and the session state. */}
			<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
				<MarketSelector
					current={{
						symbol: market.symbol,
						base: market.base,
						assetClass: market.assetClass,
						logoUrl: market.logoUrl,
					}}
				/>

				{mark !== null && (
					<div>
						<p className="text-[11px] uppercase tracking-wide text-gray-500">Mark</p>
						<p className="font-mono text-lg">{formatUsd(mark)}</p>
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
						<div className="hidden sm:block">
							<p
								className="text-[11px] uppercase tracking-wide text-gray-500"
								title="Perp funding, annualised. Positive means that side receives funding."
							>
								Funding APR L / S
							</p>
							<p className="font-mono text-sm">
								<span
									className={
										market.fundingLongPercentPerHour >= 0 ? "text-lime-400" : "text-red-400"
									}
								>
									{formatFundingApr(market.fundingLongPercentPerHour)}
								</span>
								<span className="text-gray-600"> / </span>
								<span
									className={
										market.fundingShortPercentPerHour >= 0 ? "text-lime-400" : "text-red-400"
									}
								>
									{formatFundingApr(market.fundingShortPercentPerHour)}
								</span>
							</p>
						</div>

						<div className="hidden md:block">
							<p className="text-[11px] uppercase tracking-wide text-gray-500">Open interest</p>
							<p className="font-mono text-sm text-gray-300">
								{formatUsd(market.openInterest, { compact: true })}
							</p>
						</div>
					</>
				) : (
					<div className="hidden sm:block">
						<p
							className="text-[11px] uppercase tracking-wide text-gray-500"
							title="Measured cost of crossing the pool on a $100 trade."
						>
							Spot impact / $100
						</p>
						<p className="font-mono text-sm text-amber-400">
							{spotToken?.buyPriceImpactPercent !== null &&
							spotToken?.buyPriceImpactPercent !== undefined
								? formatPercent(spotToken.buyPriceImpactPercent)
								: "—"}
						</p>
					</div>
				)}

				<div className="ml-auto flex items-center gap-2">
					<MarketHoursBadge market={market} />
					{spotToken && (
						<Link
							to="/carry"
							className="rounded-full border border-lime-500/30 px-2 py-0.5 text-[11px] text-lime-400 hover:bg-lime-500/10"
						>
							Carry available
						</Link>
					)}
				</div>
			</div>

			{!market.isOpen && (
				<Callout tone="warning" title="Perp market closed">
					Perp orders are rejected while the market is shut
					{market.nextOpen && `; it reopens ${new Date(market.nextOpen * 1000).toLocaleString()}`}
					{spotToken && ". The spot token still trades 24/7"}.
				</Callout>
			)}

			<div className="grid gap-4 lg:grid-cols-[1fr_340px]">
				<div className="space-y-4">
					<PriceChart symbol={market.symbol} />

					<div>
						<Tabs value={panel} onValueChange={(value) => setPanel(value as Panel)}>
							<TabsList>
								<TabsTrigger value="positions">Positions</TabsTrigger>
								<TabsTrigger value="orders">Spot orders</TabsTrigger>
							</TabsList>
						</Tabs>

						<div className="mt-3">
							{panel === "positions" ? <PerpPositionsTable /> : <SpotLimitOrders />}
						</div>
					</div>
				</div>

				{/* Desktop: order entry alongside the chart. */}
				<aside className="hidden space-y-3 lg:sticky lg:top-28 lg:block lg:self-start">
					{venueToggle}
					{orderPanel}
					{activeVenue === "perp" && (
						<p className="text-center text-[11px] text-gray-600">
							Available OI {formatUsd(market.availableOpenInterest, { compact: true })}
						</p>
					)}
					{!spotToken && (
						<p className="text-center text-[11px] text-gray-600">
							No spot market — {market.base} has no routable token on Base.
						</p>
					)}
				</aside>
			</div>

			{/* Mobile: order entry as a bottom sheet. */}
			<MobileActionBar>
				<Button
					type="button"
					onClick={() => setSheetOpen(true)}
					className={cn("w-full font-semibold", "bg-lime-500 text-black hover:bg-lime-400")}
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
