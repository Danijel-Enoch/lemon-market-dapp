import { PacificaPositions } from "@app/components/account/PacificaHoldings";
import { IndexChart } from "@app/components/chart/IndexChart";
import { Callout } from "@app/components/common/Callout";
import { MarketLogo } from "@app/components/common/MarketLogo";
import { DetailRow } from "@app/components/pons/Feed";
import { StatInline } from "@app/components/pons/StatCard";
import { BasketSelector } from "@app/components/trade/BasketSelector";
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
	pending: <Minus size={13} className="text-[var(--pon-fg-4)]" aria-hidden />,
	running: <Loader2 size={13} className="animate-spin text-[var(--pon-amber)]" aria-hidden />,
	filled: <Check size={13} className="text-[var(--pon-lime)]" aria-hidden />,
	failed: <X size={13} className="text-[var(--pon-down)]" aria-hidden />,
	skipped: <Minus size={13} className="text-[var(--pon-fg-4)]" aria-hidden />,
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

	if (isLoading) return <Skeleton className="h-[560px] w-full" />;
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
						<TabsTrigger value="long" className="flex-1 data-[state=active]:text-[var(--pon-lime)]">
							Long all
						</TabsTrigger>
						<TabsTrigger
							value="short"
							className="flex-1 data-[state=active]:text-[var(--pon-down)]"
						>
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
				<p className="t-micro text-[var(--pon-fg-4)]">
					Split equally across {basket.legs.length} legs
					{plan ? ` — ${formatUsd(plan.legs[0]?.notionalUsd ?? 0)} each` : ""}.
				</p>
			</div>

			{venue !== "spot" && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label htmlFor="basket-lev">{venue === "carry" ? "Short leverage" : "Leverage"}</Label>
						<span className="font-fono text-sm font-semibold text-[var(--pon-lime)]">
							{leverage}x
						</span>
					</div>
					<Slider
						id="basket-lev"
						min={1}
						max={maxLeverage}
						step={1}
						value={[leverage]}
						onValueChange={([value]) => setLeverage(value)}
					/>
					<p className="t-micro text-[var(--pon-fg-4)]">
						Capped at {maxLeverage}x by the most constrained leg.
					</p>
				</div>
			)}

			{plan && (
				<dl className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-2">
					<DetailRow label="Legs entered" value={`${plan.tradableLegs} of ${plan.legs.length}`} />
					<DetailRow label="Deployed" value={formatUsd(plan.effectiveUsd)} />
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
				<ul className="space-y-1.5 rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-3.5">
					{trade.progress.map((leg) => (
						<li key={leg.ticker} className="flex items-center gap-2 t-caption">
							{LEG_ICONS[leg.state]}
							<span className="font-semibold text-[var(--pon-fg)]">{leg.ticker}</span>
							<span className="ml-auto truncate text-[var(--pon-fg-3)]">
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
				size="lg"
				className={cn(
					"w-full rounded-[var(--pon-r-sm)] font-bold",
					venue === "perp" && side === "short"
						? "bg-[var(--pon-down)] text-white hover:bg-[var(--pon-down)]/85"
						: "bg-[var(--pon-lime)] text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]",
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
					<Link to="/carry" className="font-semibold text-[var(--pon-lime)] underline">
						Cash &amp; Carry
					</Link>
					.
				</Callout>
			)}

			<p className="text-center t-micro text-[var(--pon-fg-4)]">
				{/* Perp legs are placed with your agent key, so only spot legs
				    ever reach the wallet. */}
				{venue === "carry"
					? `${plan?.tradableLegs ?? 0} wallet signatures — the spot leg of each carry.`
					: venue === "spot"
						? `${plan?.tradableLegs ?? 0} wallet signatures — one per leg.`
						: `${plan?.tradableLegs ?? 0} legs, placed for you — no wallet prompt.`}
			</p>
		</div>
	);

	return (
		<div className="space-y-3 pb-28 md:pb-0">
			{/* Header mirrors the trade terminal: selector, then a scrolling strip. */}
			<div className="flex flex-col gap-3 md:flex-row md:items-stretch">
				<div className="shrink-0">
					<BasketSelector current={basket} />
				</div>

				<div className="flex min-w-0 flex-1 items-center gap-7 overflow-x-auto rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-4 py-3 scrollbar-hide md:h-[58px]">
					<div className="min-w-fit">
						<p className="t-micro text-[var(--pon-fg-3)]">Index</p>
						<p className="font-fono mt-0.5 text-[12.5px] font-semibold text-[var(--pon-fg)]">
							{index?.points.length ? index.points[index.points.length - 1].value.toFixed(2) : "—"}
							{index?.points.length ? (
								<span
									className={cn(
										"ml-2",
										index.changePercent >= 0 ? "text-[var(--pon-up)]" : "text-[var(--pon-down)]",
									)}
								>
									{formatPercent(index.changePercent)}
								</span>
							) : null}
						</p>
					</div>

					<StatInline
						className="min-w-fit whitespace-nowrap"
						label="Legs"
						value={`${basket.perpLegCount} perp · ${basket.routabilityKnown ? basket.spotLegCount : "…"} spot`}
					/>

					<StatInline
						className="min-w-fit whitespace-nowrap"
						label="Max leverage"
						value={`${maxLeverage}x`}
					/>

					<div className="ml-auto flex min-w-fit items-center gap-2 pl-4">
						<span className="whitespace-nowrap rounded-full border border-[var(--pon-line)] px-2.5 py-1 t-micro text-[var(--pon-fg-3)]">
							Equal weight
						</span>
						{basket.spotLegCount > 0 && (
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

			{basket.routabilityKnown && !basket.legsMatch && (
				<Callout tone="info" title="Perp and spot cover different legs">
					{basket.perpOnlyTickers.join(", ")} can be traded as a perp but has no token on Base, so
					the spot basket holds {basket.spotLegCount} of {basket.perpLegCount} assets.
					Cash-and-carry is only possible on legs present on both sides.
				</Callout>
			)}

			<div className="grid gap-3 lg:grid-cols-[1fr_320px]">
				<div className="space-y-3">
					<div className="overflow-hidden rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)]">
						<IndexChart basketId={basket.id} name={basket.name} />
					</div>

					<Tabs value={panel} onValueChange={(value) => setPanel(value as Panel)}>
						<TabsList>
							<TabsTrigger value="constituents">Constituents</TabsTrigger>
							<TabsTrigger value="positions">Positions</TabsTrigger>
						</TabsList>
					</Tabs>

					{panel === "positions" ? (
						<PacificaPositions />
					) : (
						<div className="overflow-hidden rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-4 pb-2 pt-4">
							<table className="w-full text-[13px]">
								<thead className="border-b border-[var(--pon-line)] text-left text-[11px] uppercase tracking-[0.05em] text-[var(--pon-fg-3)]">
									<tr>
										<th className="px-3 pb-2.5 font-normal">Constituent</th>
										<th className="px-3 pb-2.5 font-normal">Weight</th>
										<th className="px-3 pb-2.5 font-normal">Perp</th>
										<th className="px-3 pb-2.5 font-normal">Spot</th>
										{/*
										  Funding is a perp mechanic. A spot basket is just a
										  batch of token purchases with no ongoing rate, so the
										  column is dropped rather than shown as inapplicable.
										  Carry keeps it — that is the leg it shorts.
										*/}
										{venue !== "spot" && (
											<th
												className="px-3 pb-2.5 font-normal"
												title="Perp funding, annualised. Positive means the short side receives funding."
											>
												Funding (short, APR)
											</th>
										)}
									</tr>
								</thead>
								<tbody className="divide-y divide-[var(--pon-line)]">
									{basket.legs.map((leg) => (
										<tr key={leg.ticker} className="transition-colors hover:bg-[var(--pon-bg-2)]">
											<td className="px-3 py-3">
												<Link
													to={`/trade/${leg.marketSymbol.replace("/", "-")}`}
													className="inline-flex items-center gap-2 hover:text-[var(--pon-lime)]"
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
											<td className="font-fono px-3 py-3 text-[var(--pon-fg-2)]">
												{(100 / basket.legs.length).toFixed(0)}%
											</td>
											<td className="px-3 py-3">
												{leg.perpAvailable ? (
													<span className="text-[var(--pon-lime)]">✓</span>
												) : (
													<span className="text-[var(--pon-fg-4)]">—</span>
												)}
											</td>
											<td className="px-3 py-3">
												{leg.spotAvailable ? (
													<span className="text-[var(--pon-lime)]">{leg.spotSymbol}</span>
												) : leg.spotPending ? (
													<span className="text-[var(--pon-fg-3)]">checking…</span>
												) : (
													<span className="text-[var(--pon-fg-4)]">—</span>
												)}
											</td>
											{venue !== "spot" && (
												<td
													className={cn(
														"font-fono px-3 py-3 text-xs",
														leg.fundingShortPercentPerHour >= 0
															? "text-[var(--pon-up)]"
															: "text-[var(--pon-down)]",
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

				<aside className="hidden lg:sticky lg:top-[92px] lg:block lg:self-start">
					<div className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-3.5">
						{orderPanel}
					</div>
				</aside>
			</div>

			<MobileActionBar>
				<Button type="button" onClick={() => setSheetOpen(true)} className="w-full font-semibold">
					Trade {basket.name}
				</Button>
			</MobileActionBar>

			<Sheet open={sheetOpen} onOpenChange={setSheetOpen} title={`Trade ${basket.name}`}>
				{orderPanel}
			</Sheet>
		</div>
	);
}
