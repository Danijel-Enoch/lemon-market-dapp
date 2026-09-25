import type { BasisMarket } from "@lemon/client";
import { formatPercent } from "@lemon/client";
import { cn } from "@lemon/ui";
import { AlertTriangle, ChevronRight, Clock, Moon } from "lucide-react";
import { Link } from "react-router";

/**
 * The basis board.
 *
 * Built around one comparison, because it is the comparison a basis trader gets
 * wrong most often and most expensively: **funding is not yield**. A market can
 * pay the best funding rate on the board and still be the worst trade on it,
 * once a thin pool's slippage and the four fills of a round trip are priced in.
 * So gross and net sit side by side in every row, the board ranks on net, and
 * when the two disagree materially the row says so rather than leaving the
 * reader to subtract two percentages in their head.
 *
 * The second thing a row has to answer is "how long until this is worth it".
 * Breakeven days does that directly, and it is the number that separates a
 * market worth entering today from one worth entering for a month — a 40% APY
 * that takes eleven days to cover its own round trip is not a 40% APY to anyone
 * closing next week.
 *
 * Blocked markets stay on the board with their reason attached. Someone hunting
 * for a symbol that has dropped off cannot tell an absent market from an
 * untradable one, and the reason is precisely what they came to find out.
 */

/** Below this, the gap between gross and net is not worth drawing attention to. */
const COST_DRAG_THRESHOLD = 2;

export function MarketTable({ markets }: { markets: BasisMarket[] }) {
	return (
		<div className="overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
			<div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 border-b border-[var(--pon-line)] px-5 py-3 text-[11px] font-medium tracking-wide text-[var(--pon-fg-3)] uppercase md:grid">
				<div>Market</div>
				<div
					className="text-right"
					title="Annualised funding after the round trip's fees and slippage are amortised over a year. This is what the position is expected to pay you, and what the board is ranked on."
				>
					Net APY
				</div>
				<div
					className="text-right"
					title="Annualised short-side funding before costs. The headline number every venue quotes, and never what you keep."
				>
					Gross
				</div>
				<div
					className="text-right"
					title="How far the perp mark sits above spot. Positive is the direction that pays a long-spot/short-perp holder as the two converge."
				>
					Basis
				</div>
				<div
					className="text-right"
					title="Days of funding needed to cover entering and exiting. Below this, closing early loses money even while funding is positive."
				>
					Breakeven
				</div>
				<div
					className="text-right"
					title="The smallest position Pacifica will accept in this market, and the most leverage it allows."
				>
					Min / Max
				</div>
				<div className="w-5" />
			</div>

			<ul className="divide-y divide-[var(--pon-line)]">
				{markets.map((market) => (
					<MarketRow key={market.id} market={market} />
				))}
			</ul>
		</div>
	);
}

function MarketRow({ market }: { market: BasisMarket }) {
	const blocked = market.blockers.length > 0;
	const { economics: e } = market;

	// The gap the board exists to make visible. Only surfaced when it is large
	// enough to change a decision — every market has some cost, and flagging all
	// of them would make the flag meaningless.
	const costDrag = e.fundingAprPercent - e.netApyPercent;
	const dragWorthShowing = costDrag >= COST_DRAG_THRESHOLD && e.fundingAprPercent > 0;

	return (
		<li>
			<Link
				to={`/markets/${market.id}`}
				className={cn(
					"block px-5 py-4 transition-colors hover:bg-[var(--pon-lime-dim)] focus-visible:bg-[var(--pon-lime-dim)] focus-visible:outline-none",
					blocked && "opacity-70",
				)}
			>
				{/* Desktop row. */}
				<div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] items-center gap-4 md:grid">
					<MarketIdentity market={market} />

					<div className="text-right">
						<p
							className={cn(
								"font-fono text-[15px] font-bold",
								e.netApyPercent > 0 ? "text-[var(--pon-up)]" : "text-[var(--pon-fg-3)]",
							)}
						>
							{formatPercent(e.netApyPercent, 1)}
						</p>
						{dragWorthShowing && (
							<p className="mt-0.5 text-[10.5px] text-[var(--pon-fg-3)]">
								−{costDrag.toFixed(1)} costs
							</p>
						)}
					</div>

					<p className="text-right font-fono text-[13px] text-[var(--pon-fg-2)]">
						{formatPercent(e.fundingAprPercent, 1)}
					</p>

					<p className="text-right font-fono text-[13px] text-[var(--pon-fg-2)]">
						{e.basisPercent === null ? "—" : formatPercent(e.basisPercent, 2)}
					</p>

					<p className="text-right font-fono text-[13px] text-[var(--pon-fg-2)]">
						{e.breakevenDays === null ? "—" : `${e.breakevenDays.toFixed(1)}d`}
					</p>

					<p className="text-right font-fono text-[13px] text-[var(--pon-fg-2)]">
						${market.perp.minPositionUsdc} / {market.perp.maxLeverage}x
					</p>

					<ChevronRight size={16} className="text-[var(--pon-fg-3)]" aria-hidden />
				</div>

				{/* Mobile card. Net APY is promoted and gross is dropped entirely:
				    on a narrow screen the choice is which market, not which rate. */}
				<div className="md:hidden">
					<div className="flex items-start justify-between gap-3">
						<MarketIdentity market={market} />
						<div className="text-right">
							<p
								className={cn(
									"font-fono text-[17px] font-bold",
									e.netApyPercent > 0 ? "text-[var(--pon-up)]" : "text-[var(--pon-fg-3)]",
								)}
							>
								{formatPercent(e.netApyPercent, 1)}
							</p>
							<p className="text-[10.5px] text-[var(--pon-fg-3)]">net APY</p>
						</div>
					</div>

					<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--pon-fg-3)]">
						<span>
							Basis{" "}
							<span className="font-fono text-[var(--pon-fg-2)]">
								{e.basisPercent === null ? "—" : formatPercent(e.basisPercent, 2)}
							</span>
						</span>
						<span>
							Breakeven{" "}
							<span className="font-fono text-[var(--pon-fg-2)]">
								{e.breakevenDays === null ? "—" : `${e.breakevenDays.toFixed(1)}d`}
							</span>
						</span>
						<span>
							Min{" "}
							<span className="font-fono text-[var(--pon-fg-2)]">
								${market.perp.minPositionUsdc}
							</span>
						</span>
					</div>
				</div>

				{blocked && (
					<p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] text-[var(--pon-amber)]">
						<AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
						{/* One reason, not all of them. A row is a summary; the detail
						    page lists every blocker in full. */}
						<span>{market.blockers[0]}</span>
					</p>
				)}
			</Link>
		</li>
	);
}

/**
 * The left-hand identity cell: what this market is, and whether it is awake.
 *
 * The closed-market marker only applies to equities, which keep exchange hours
 * while their token trades on Base continuously. That asymmetry is the one thing
 * about an equity basis a crypto trader does not expect — one leg freezes and
 * the other does not — so it is marked on the board rather than discovered at
 * the point of entry.
 */
function MarketIdentity({ market }: { market: BasisMarket }) {
	const closed = market.assetClass === "equity" && !market.perp.isOpen;

	return (
		<div className="flex min-w-0 items-center gap-3">
			{market.logoUrl ? (
				<img
					src={market.logoUrl}
					alt=""
					className="size-8 shrink-0 rounded-full bg-[var(--pon-bg-3)]"
					loading="lazy"
				/>
			) : (
				<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--pon-bg-3)] font-fono text-[11px] font-bold text-[var(--pon-fg-2)]">
					{market.ticker.slice(0, 3)}
				</span>
			)}

			<div className="min-w-0">
				<p className="flex items-center gap-1.5 font-medium text-[var(--pon-fg-0)]">
					<span className="truncate">{market.ticker}</span>
					{closed && (
						<span
							className="inline-flex items-center gap-1 rounded-full bg-[var(--pon-bg-3)] px-1.5 py-0.5 text-[10px] text-[var(--pon-fg-3)]"
							title="The perp follows exchange hours and is closed. The spot leg still trades, so a position cannot be hedged or adjusted until the next session."
						>
							<Moon size={9} aria-hidden />
							Closed
						</span>
					)}
				</p>
				<p className="truncate text-[11.5px] text-[var(--pon-fg-3)]">
					{market.name} · {market.spot.symbol} / {market.perp.symbol}
				</p>
			</div>
		</div>
	);
}

/**
 * The strip above the board: what it is currently possible to earn.
 *
 * Quoted from the best *enterable* market rather than the best row, because a
 * headline drawn from a market nobody can enter is an advertisement rather than
 * a statistic.
 */
export function BoardSummary({ markets }: { markets: BasisMarket[] }) {
	const enterable = markets.filter((market) => market.blockers.length === 0);
	const best = enterable[0];

	const median = (() => {
		if (enterable.length === 0) return null;
		const sorted = [...enterable].map((m) => m.economics.netApyPercent).sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)];
	})();

	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
			<Tile label="Markets open" value={String(enterable.length)} />
			<Tile
				label="Best net APY"
				value={best ? formatPercent(best.economics.netApyPercent, 1) : "—"}
				hint={best?.ticker}
			/>
			<Tile label="Median net APY" value={median === null ? "—" : formatPercent(median, 1)} />
			<Tile
				label="Fastest breakeven"
				value={(() => {
					const days = enterable
						.map((m) => m.economics.breakevenDays)
						.filter((d): d is number => d !== null);
					return days.length ? `${Math.min(...days).toFixed(1)}d` : "—";
				})()}
				hint="to cover the round trip"
			/>
		</div>
	);
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div className="rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3 py-2.5">
			<p className="firm-label text-[var(--pon-fg-3)]">{label}</p>
			<p className="font-fono mt-1.5 text-[17px] font-bold leading-tight text-[var(--pon-fg)]">
				{value}
			</p>
			{hint && (
				<p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-[var(--pon-fg-3)]">
					<Clock size={9} aria-hidden />
					{hint}
				</p>
			)}
		</div>
	);
}
