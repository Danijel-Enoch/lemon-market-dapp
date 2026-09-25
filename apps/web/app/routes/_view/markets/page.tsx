import { BoardSummary, MarketTable } from "@app/components/market/MarketTable";
import { useBasisMarkets, useSelfStatus } from "@lemon/client";
import { Callout, ChipGroup, EmptyState, PageHeader, Skeleton } from "@lemon/ui";
import { CandlestickChart, Loader2 } from "lucide-react";
import { useState } from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Markets — Lemon" },
	{
		name: "description",
		content:
			"Every spot-and-perp pair you can run yourself: long the asset, short the matching perp, and collect the funding. Your spot stays in your own wallet.",
	},
	{ property: "og:title", content: "Lemon — run the basis trade yourself" },
];

type ClassFilter = "all" | "crypto" | "equity";
type AvailabilityFilter = "all" | "enterable";

const CLASS_FILTERS: { value: ClassFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "crypto", label: "Crypto" },
	{ value: "equity", label: "Stocks" },
];

const AVAILABILITY_FILTERS: { value: AvailabilityFilter; label: string }[] = [
	{ value: "enterable", label: "Enterable now" },
	{ value: "all", label: "Include blocked" },
];

/**
 * The board of positions a user can run themselves.
 *
 * Deliberately a sibling of `/vaults` rather than a replacement for it. The two
 * are the same trade under different custody: a vault is capital handed to an
 * agent that runs the position for you, and this is the position run by you.
 * Someone can hold both, and the header says which is which rather than leaving
 * a visitor to infer that two boards of the same markets are not duplicates.
 *
 * Defaults to hiding blocked markets, which is the opposite of the admin
 * console's default and correct for a different reader. An operator is
 * diagnosing why a market cannot be vaulted and needs the failures; someone
 * choosing where to put money wants the list they can act on, with the rest one
 * click away.
 */
export default function MarketsPage() {
	const [assetClass, setAssetClass] = useState<ClassFilter>("all");
	const [availability, setAvailability] = useState<AvailabilityFilter>("enterable");

	const { data, isLoading, isError, error } = useBasisMarkets();
	const { data: status } = useSelfStatus();

	const all = data?.markets ?? [];
	const markets = all.filter(
		(market) =>
			(assetClass === "all" || market.assetClass === assetClass) &&
			(availability === "all" || market.blockers.length === 0),
	);

	const countFor = (value: ClassFilter) =>
		value === "all"
			? all.filter((m) => availability === "all" || m.blockers.length === 0).length
			: all.filter(
					(m) => m.assetClass === value && (availability === "all" || m.blockers.length === 0),
				).length;

	return (
		<div className="space-y-6 md:space-y-8">
			<PageHeader
				eyebrow="Run it yourself"
				title="Markets"
				description="Each row is a delta-neutral pair: buy the asset, short the matching perp at the same size, and collect what the market pays to hold it. The spot leg stays in your own wallet and the short sits on Pacifica under a Solana address derived for you — no second wallet to install. Ranked by what is left after costs, not by the funding rate."
			/>

			{/* Configuration failures are stated once, at the top, before anyone
			    spends time choosing a market they will not be able to enter. */}
			{status && !status.available && (
				<Callout tone="warning" title="Self-managed positions are unavailable here">
					{status.reason} The board below is still accurate — you simply cannot open a position from
					this deployment yet. Vaults are unaffected.
				</Callout>
			)}

			{data && <BoardSummary markets={all} />}

			{/* The probe takes around fifteen seconds on a cold start, and during it
			    every market looks unroutable. Saying so beats rendering the whole
			    board as blocked, which would be wrong rather than merely incomplete. */}
			{data && !data.routabilityKnown && (
				<Callout tone="info" title="Checking liquidity">
					<span className="inline-flex items-center gap-2">
						<Loader2 size={13} className="animate-spin" aria-hidden />
						Spot routes are still being probed, so a market may show as unenterable for a few
						seconds longer than it really is.
					</span>
				</Callout>
			)}

			<div className="space-y-4">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<ChipGroup
						options={CLASS_FILTERS.map((f) => ({
							value: f.value,
							label: `${f.label} ${countFor(f.value)}`,
						}))}
						value={assetClass}
						onChange={(value) => setAssetClass(value as ClassFilter)}
						aria-label="Filter by asset type"
					/>
					<span className="hidden h-4 w-px bg-[var(--pon-line-2)] sm:block" />
					<ChipGroup
						options={AVAILABILITY_FILTERS}
						value={availability}
						onChange={(value) => setAvailability(value as AvailabilityFilter)}
						aria-label="Filter by availability"
					/>
				</div>

				{isLoading ? (
					<div className="space-y-2">
						{[0, 1, 2, 3, 4].map((i) => (
							<Skeleton key={i} className="h-20 w-full rounded-[var(--pon-r-lg,16px)]" />
						))}
					</div>
				) : isError ? (
					<EmptyState
						icon={CandlestickChart}
						title="The market board is unavailable"
						description={
							error instanceof Error
								? error.message
								: "The spot registry or the perp catalog could not be reached, so no pair can be priced right now."
						}
					/>
				) : markets.length === 0 ? (
					<EmptyState
						icon={CandlestickChart}
						title={
							availability === "enterable"
								? "Nothing is enterable right now"
								: "Nothing matches those filters"
						}
						description={
							availability === "enterable"
								? "Every market on this chain is blocked at the moment — usually a spot pool with no route, or a perp outside its exchange hours. Switch to “Include blocked” to see each one and why."
								: "Try a different asset type."
						}
					/>
				) : (
					<MarketTable markets={markets} />
				)}

				{/* The unpaired list is the honest counterpart of the board: these are
				    assets the platform holds a spot leg for and cannot hedge, and a
				    symbol that is simply missing is indistinguishable from one nobody
				    thought of. They promote themselves the moment a perp appears. */}
				{data && data.unpaired.length > 0 && availability === "all" && (
					<details className="rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-4 py-3">
						<summary className="cursor-pointer text-[12.5px] text-[var(--pon-fg-3)]">
							{data.unpaired.length} assets with no perp to hedge against
						</summary>
						<p className="mt-2 text-[11.5px] leading-relaxed text-[var(--pon-fg-3)]">
							These have a spot leg and no matching perp, so a delta-neutral position cannot be
							built from them. Nothing needs deploying if that changes — the pairing runs on every
							request, so they appear on the board the moment a perp is listed.
						</p>
						<p className="mt-2 font-fono text-[11px] text-[var(--pon-fg-2)]">
							{data.unpaired.map((asset) => asset.ticker).join(" · ")}
						</p>
					</details>
				)}
			</div>
		</div>
	);
}
