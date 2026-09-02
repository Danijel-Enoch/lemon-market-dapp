import { IndexChart } from "@app/components/chart/IndexChart";
import { Callout } from "@app/components/common/Callout";
import { MarketLogo } from "@app/components/common/MarketLogo";
import { BasketSelector } from "@app/components/trade/BasketSelector";
import { PerpPositionsTable } from "@app/components/trade/PerpPositionsTable";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { MobileActionBar, Sheet } from "@app/components/ui/sheet";
import { Skeleton } from "@app/components/ui/skeleton";
import { Slider } from "@app/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { useBasketTrade } from "@app/hooks/useBasketTrade";
import { useBasket, useSpotTokens } from "@app/hooks/useMarketData";
import { basketApi } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { formatFundingApr, formatPercent, formatUsd } from "@lemon/core";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Minus, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, type MetaFunction, useParams } from "react-router";
import { useConnection } from "wagmi";

export const meta: MetaFunction = ({ params }) => [
	{ title: `${params.id} basket — Lemon Markets` },
	{ name: "description", content: "Enter multiple markets in one flow." },
];

type Venue = "perp" | "spot" | "carry";
type Panel = "constituents" | "positions";

const LEG_ICONS = {
	pending: <Minus size={13} className="text-gray-600" aria-hidden />,
	running: <Loader2 size={13} className="animate-spin text-amber-400" aria-hidden />,
	filled: <Check size={13} className="text-lime-400" aria-hidden />,
	failed: <X size={13} className="text-red-400" aria-hidden />,
	skipped: <Minus size={13} className="text-gray-600" aria-hidden />,
};

export default function BasketPage() {
	const { id } = useParams();
	const { isConnected } = useConnection();
	const { data: basket, isLoading } = useBasket(id);
	const { data: spotTokens } = useSpotTokens();
	const trade = useBasketTrade();

	const [venue, setVenue] = useState<Venue>("perp");
	const [side, setSide] = useState<"long" | "short">("long");
	const [total, setTotal] = useState("1000");
	const [leverage, setLeverage] = useState(2);
	const [panel, setPanel] = useState<Panel>("constituents");
	const [sheetOpen, setSheetOpen] = useState(false);

	const totalUsd = Number(total) || 0;

	// Drives the index level in the header. Shares a query key with IndexChart's
	// 1H series, so the two read from one fetch rather than two.
	const { data: index } = useQuery({
		queryKey: ["basket-candles", id, "60"],
		queryFn: () => basketApi.candles(id as string, "60"),
		enabled: Boolean(id),
		refetchInterval: 60_000,
	});

	const { data: plan } = useQuery({
		queryKey: ["basket-plan", id, venue, totalUsd, leverage],
		queryFn: () =>
			basketApi.plan(id as string, {
				// A carry buys the spot basket, so it is sized off the spot legs.
				venue: venue === "carry" ? "spot" : venue,
				totalUsd,
				leverage: venue === "perp" ? leverage : 1,
			}),
		enabled: Boolean(id) && totalUsd > 0,
	});

	if (isLoading) return <Skeleton className="h-[560px] w-full rounded-xl" />;
	if (!basket) {
		return (
			<Callout tone="warning" title="Basket not found">
				<Link to="/baskets" className="underline">
					All baskets
				</Link>
			</Callout>
		);
	}

	// Leverage is capped by the most constrained leg — an equity basket cannot
	// run at 50x just because one crypto leg allows it.
	const maxLeverage = Math.min(
		...basket.legs.filter((leg) => leg.perpAvailable).map((leg) => leg.maxLeverage),
	);

	async function handleEnter() {
		if (!plan || !basket) return;
		const result =
			venue === "carry"
				? await trade.executeCarry({
						plan,
						legs: basket.legs,
						leverage,
						tokens: spotTokens?.tokens,
					})
				: await trade.execute({
						plan,
						side,
						leverage,
						tokens: spotTokens?.tokens,
					});

		if (result.filled === result.total) {
			toast.success(`Entered ${basket?.name} — ${result.filled} legs filled`);
		} else if (result.filled > 0) {
			toast.error(
				`Partially entered: ${result.filled} of ${result.total} legs filled. Check the leg status.`,
			);
		} else {
			toast.error("No legs were filled.");
		}
	}

	const orderPanel = (
		<div className="space-y-4">
			<Tabs value={venue} onValueChange={(value) => setVenue(value as Venue)}>
				<TabsList className="w-full">
					<TabsTrigger value="perp" className="flex-1">
						Perp
					</TabsTrigger>
					<TabsTrigger value="spot" className="flex-1" disabled={basket.spotLegCount === 0}>
						Spot
					</TabsTrigger>
					<TabsTrigger value="carry" className="flex-1" disabled={basket.spotLegCount === 0}>
						Carry
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{venue === "perp" && (
				<Tabs value={side} onValueChange={(value) => setSide(value as "long" | "short")}>
					<TabsList className="w-full">
						<TabsTrigger value="long" className="flex-1 data-[state=active]:text-lime-400">
							Long all
						</TabsTrigger>
						<TabsTrigger value="short" className="flex-1 data-[state=active]:text-red-400">
							Short all
						</TabsTrigger>
					</TabsList>
				</Tabs>
			)}

			<div className="space-y-2">
				<Label htmlFor="total">Total (USDC)</Label>
				<Input
					id="total"
					inputMode="decimal"
					value={total}
					onChange={(event) => setTotal(event.target.value)}
				/>
				<p className="text-[11px] text-gray-600">
					Split equally across {basket.legs.length} legs
					{plan ? ` — ${formatUsd(plan.legs[0]?.notionalUsd ?? 0)} each` : ""}.
				</p>
			</div>

			{venue !== "spot" && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label htmlFor="basket-lev">{venue === "carry" ? "Short leverage" : "Leverage"}</Label>
						<span className="font-mono text-sm text-lime-400">{leverage}x</span>
					</div>
					<Slider
						id="basket-lev"
						min={1}
						max={maxLeverage}
						step={1}
						value={[leverage]}
						onValueChange={([value]) => setLeverage(value)}
					/>
					<p className="text-[11px] text-gray-600">
						Capped at {maxLeverage}x by the most constrained leg.
					</p>
				</div>
			)}

			{plan && (
				<dl className="space-y-1.5 rounded-lg border border-white/5 bg-black/20 p-3 text-xs">
					<div className="flex justify-between">
						<dt className="text-gray-500">Legs entered</dt>
						<dd className="font-mono">
							{plan.tradableLegs} of {plan.legs.length}
						</dd>
					</div>
					<div className="flex justify-between">
						<dt className="text-gray-500">Deployed</dt>
						<dd className="font-mono">{formatUsd(plan.effectiveUsd)}</dd>
					</div>
				</dl>
			)}

			{plan?.warnings.map((warning) => (
				<Callout key={warning} tone="warning">
					{warning}
				</Callout>
			))}

			{/* Per-leg progress. A basket is N separate trades, so partial
			    outcomes are shown leg by leg rather than as one status. */}
			{trade.progress.length > 0 && (
				<ul className="space-y-1 rounded-lg border border-white/5 bg-black/20 p-3">
					{trade.progress.map((leg) => (
						<li key={leg.ticker} className="flex items-center gap-2 text-xs">
							{LEG_ICONS[leg.state]}
							<span className="font-medium">{leg.ticker}</span>
							<span className="ml-auto truncate text-gray-500">
								{leg.state === "skipped" ? (leg.error ?? "skipped") : leg.state}
							</span>
						</li>
					))}
				</ul>
			)}

			<Button
				type="button"
				onClick={handleEnter}
				disabled={!isConnected || trade.running || !plan?.tradableLegs}
				className={cn(
					"w-full font-semibold",
					venue === "perp" && side === "short"
						? "bg-red-500 text-white hover:bg-red-400"
						: "bg-lime-500 text-black hover:bg-lime-400",
				)}
			>
				{!isConnected
					? "Connect wallet"
					: trade.running
						? "Entering legs…"
						: venue === "spot"
							? `Buy ${basket.name}`
							: `${side === "long" ? "Long" : "Short"} ${basket.name}`}
			</Button>

			{venue === "carry" && (
				<Callout tone="info">
					Each leg is a full cash-and-carry: buy the token, short the matching perp. That is two
					transactions per leg, and any leg whose short fails is recorded so you can repair it from{" "}
					<Link to="/carry" className="underline">
						Cash &amp; Carry
					</Link>
					.
				</Callout>
			)}

			<p className="text-center text-[11px] text-gray-600">
				{venue === "carry"
					? `${(plan?.tradableLegs ?? 0) * 2} transactions — two per leg.`
					: `${plan?.tradableLegs ?? 0} separate transactions — one per leg.`}
			</p>
		</div>
	);

	return (
		<div className="space-y-4 pb-28 md:pb-0">
			{/* Header mirrors the trade terminal: selector, live level, key stats. */}
			<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
				<BasketSelector current={basket} />

				<div>
					<p className="text-[11px] uppercase tracking-wide text-gray-500">Index</p>
					<p className="font-mono text-lg">
						{index?.points.length ? index.points[index.points.length - 1].value.toFixed(2) : "—"}
						{index?.points.length ? (
							<span
								className={cn(
									"ml-2 text-sm",
									index.changePercent >= 0 ? "text-lime-400" : "text-red-400",
								)}
							>
								{formatPercent(index.changePercent)}
							</span>
						) : null}
					</p>
				</div>

				<div className="hidden sm:block">
					<p className="text-[11px] uppercase tracking-wide text-gray-500">Legs</p>
					<p className="font-mono text-sm text-gray-300">
						{basket.perpLegCount} perp · {basket.routabilityKnown ? basket.spotLegCount : "…"} spot
					</p>
				</div>

				<div className="hidden md:block">
					<p className="text-[11px] uppercase tracking-wide text-gray-500">Max leverage</p>
					<p className="font-mono text-sm text-gray-300">{maxLeverage}x</p>
				</div>

				<div className="ml-auto flex items-center gap-2">
					<span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase text-gray-400">
						Equal weight
					</span>
					{basket.spotLegCount > 0 && (
						<Link
							to="/carry"
							className="rounded-full border border-lime-500/30 px-2 py-0.5 text-[11px] text-lime-400 hover:bg-lime-500/10"
						>
							Carry available
						</Link>
					)}
				</div>
			</div>

			{basket.routabilityKnown && !basket.legsMatch && (
				<Callout tone="info" title="Perp and spot cover different legs">
					{basket.perpOnlyTickers.join(", ")} can be traded as a perp but has no token on Base, so
					the spot basket holds {basket.spotLegCount} of {basket.perpLegCount} assets.
					Cash-and-carry is only possible on legs present on both sides.
				</Callout>
			)}

			<div className="grid gap-4 lg:grid-cols-[1fr_340px]">
				<div className="space-y-4">
					<IndexChart basketId={basket.id} name={basket.name} />

					<Tabs value={panel} onValueChange={(value) => setPanel(value as Panel)}>
						<TabsList>
							<TabsTrigger value="constituents">Constituents</TabsTrigger>
							<TabsTrigger value="positions">Positions</TabsTrigger>
						</TabsList>
					</Tabs>

					{panel === "positions" ? (
						<PerpPositionsTable />
					) : (
						<div className="overflow-hidden rounded-xl border border-white/10">
							<table className="w-full text-sm">
								<thead className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-gray-500">
									<tr>
										<th className="px-4 py-3 font-medium">Constituent</th>
										<th className="px-4 py-3 font-medium">Weight</th>
										<th className="px-4 py-3 font-medium">Perp</th>
										<th className="px-4 py-3 font-medium">Spot</th>
										{/*
										  Funding is a perp mechanic. A spot basket is just a
										  batch of token purchases with no ongoing rate, so the
										  column is dropped rather than shown as inapplicable.
										  Carry keeps it — that is the leg it shorts.
										*/}
										{venue !== "spot" && (
											<th
												className="px-4 py-3 font-medium"
												title="Perp funding, annualised. Positive means the short side receives funding."
											>
												Funding (short, APR)
											</th>
										)}
									</tr>
								</thead>
								<tbody className="divide-y divide-white/5">
									{basket.legs.map((leg) => (
										<tr key={leg.ticker}>
											<td className="px-4 py-3">
												<Link
													to={`/trade/${leg.marketSymbol.replace("/", "-")}`}
													className="inline-flex items-center gap-2 hover:text-lime-400"
												>
													<MarketLogo
														symbol={leg.marketSymbol}
														base={leg.ticker}
														assetClass={basket.assetClass}
														logoUrl={leg.logoUrl}
														size={22}
													/>
													{leg.ticker}
												</Link>
											</td>
											<td className="px-4 py-3 font-mono text-gray-400">
												{(100 / basket.legs.length).toFixed(0)}%
											</td>
											<td className="px-4 py-3">
												{leg.perpAvailable ? (
													<span className="text-lime-400">✓</span>
												) : (
													<span className="text-gray-600">—</span>
												)}
											</td>
											<td className="px-4 py-3">
												{leg.spotAvailable ? (
													<span className="text-lime-400">{leg.spotSymbol}</span>
												) : leg.spotPending ? (
													<span className="text-gray-500">checking…</span>
												) : (
													<span className="text-gray-600">—</span>
												)}
											</td>
											{venue !== "spot" && (
												<td
													className={cn(
														"px-4 py-3 font-mono text-xs",
														leg.fundingShortPercentPerHour >= 0 ? "text-lime-400" : "text-red-400",
													)}
												>
													{formatFundingApr(leg.fundingShortPercentPerHour)}
												</td>
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>

				<aside className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
					<div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">{orderPanel}</div>
				</aside>
			</div>

			<MobileActionBar>
				<Button
					type="button"
					onClick={() => setSheetOpen(true)}
					className="w-full bg-lime-500 font-semibold text-black hover:bg-lime-400"
				>
					Trade {basket.name}
				</Button>
			</MobileActionBar>

			<Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={`Trade ${basket.name}`}>
				{orderPanel}
			</Sheet>
		</div>
	);
}
