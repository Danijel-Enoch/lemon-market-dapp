import { BasisMarketTable } from "@app/components/basis/BasisMarketTable";
import { Callout } from "@app/components/common/Callout";
import { ChipGroup } from "@app/components/pons/Segmented";
import { StatCard, toneForValue } from "@app/components/pons/StatCard";
import { PageHeader } from "@app/components/site/PageHeader";
import { useTour } from "@app/components/tour/TourProvider";
import { EmptyState } from "@app/components/ui/EmptyState";
import { Skeleton } from "@app/components/ui/skeleton";
import { useBasisMarkets } from "@app/hooks/useMarketData";
import { formatPercent } from "@lemon/core";
import { Compass, Scale } from "lucide-react";
import { useState } from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Basis markets — Lemon" },
	{
		name: "description",
		content:
			"Every spot-versus-perp basis market on Base: tokenized stocks, BTC, ETH and AERO. Ranked by net yield after costs.",
	},
	{ property: "og:title", content: "Lemon — basis markets on Base" },
	{
		property: "og:description",
		content: "Delta-neutral spot-versus-perp positions on tokenized stocks and crypto.",
	},
];

type Filter = "all" | "equity" | "crypto";

const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "equity", label: "Stocks" },
	{ value: "crypto", label: "Crypto" },
];

export default function MarketsBoardPage() {
	const tour = useTour();
	const [filter, setFilter] = useState<Filter>("all");
	const { data, isLoading, isError } = useBasisMarkets();

	const all = data?.markets ?? [];
	const unpaired = data?.unpaired ?? [];
	const markets = filter === "all" ? all : all.filter((market) => market.assetClass === filter);
	const tradable = markets.filter((market) => market.blockers.length === 0);

	// The board's headline is the best net yield, not the best funding — the two
	// disagree, and the gross number is the one that flatters a bad trade.
	const best = tradable[0];
	const median =
		tradable.length > 0 ? tradable[Math.floor(tradable.length / 2)].economics.netApyPercent : 0;

	return (
		<div className="space-y-6 md:space-y-8">
			<PageHeader
				eyebrow="Delta neutral"
				title="Basis markets"
				description="Buy the spot token on Base, short the matching perp at equal size. Price moves cancel, so what is left is funding minus costs. Every yield below is quoted after the full round trip."
				actions={
					// Replayable, not one-shot. Someone who skipped the walkthrough on
					// their first visit has no other way back to it, and the moment
					// people want it is usually the second visit rather than the first.
					<button
						type="button"
						onClick={tour.start}
						className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--pon-line-2)] px-4 text-[13px] font-medium text-[var(--pon-fg-2)] transition-colors hover:border-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]"
					>
						<Compass size={14} aria-hidden />
						Take the tour
					</button>
				}
			/>

			{isError && (
				<Callout tone="danger" title="Could not load the board">
					The market data service did not respond. Funding and liquidity are read live, so there is
					nothing cached to fall back on.
				</Callout>
			)}

			{data?.routabilityKnown === false && (
				<Callout tone="info" title="Checking liquidity">
					Every row's spot leg is being probed for a live route. Until that finishes, yields are
					provisional and some markets will show as unavailable that are not.
				</Callout>
			)}

			<div data-tour="board-headline" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
				{isLoading ? (
					<>
						<Skeleton className="h-[92px] md:h-[124px]" />
						<Skeleton className="h-[92px] md:h-[124px]" />
						<Skeleton className="h-[92px] md:h-[124px]" />
						<Skeleton className="h-[92px] md:h-[124px]" />
					</>
				) : (
					<>
						<StatCard
							label="Best net APY"
							value={best ? formatPercent(best.economics.netApyPercent) : "—"}
							delta={best ? best.ticker : "nothing tradable"}
							tone={best ? toneForValue(best.economics.netApyPercent) : "neutral"}
						/>
						<StatCard
							label="Median net APY"
							value={tradable.length ? formatPercent(median) : "—"}
							delta="across tradable markets"
							tone={toneForValue(median)}
						/>
						<StatCard
							label="Tradable now"
							value={`${tradable.length}`}
							delta={`of ${markets.length} listed`}
						/>
						<StatCard label="Round trip" value="0.40%" delta="four fills, both venues" />
					</>
				)}
			</div>

			<div
				data-tour="board-filters"
				className="flex flex-wrap items-center justify-between gap-2 md:gap-3"
			>
				<ChipGroup<Filter>
					options={FILTERS}
					value={filter}
					onChange={setFilter}
					aria-label="Filter markets by asset class"
				/>
				<p className="hidden t-micro text-[var(--pon-fg-3)] sm:block">
					Ranked by net yield after fees and measured slippage
				</p>
			</div>

			{isLoading ? (
				<Skeleton className="h-[420px]" />
			) : markets.length === 0 ? (
				<EmptyState
					icon={Scale}
					title="No basis markets here"
					description="A basis market needs both legs: a Base token the aggregator can route into, and a Pacifica perp on the same underlying."
				/>
			) : (
				<BasisMarketTable
					markets={markets}
					referenceNotionalUsd={markets[0]?.economics.referenceNotionalUsd}
				/>
			)}

			{/*
			  Named rather than omitted. A basis market needs both legs, and most
			  of the tokenized equity set has no perp listed yet — leaving them off
			  the page entirely makes an absent venue listing look like an absent
			  idea. They pair themselves the moment the perp exists.
			*/}
			{unpaired.length > 0 && (
				<p className="t-caption text-[var(--pon-fg-4)]">
					<span className="text-[var(--pon-fg-3)]">Waiting on a perp listing:</span>{" "}
					{unpaired.map((asset) => asset.ticker).join(", ")}. Each pairs automatically once a
					matching market is listed.
				</p>
			)}
		</div>
	);
}
