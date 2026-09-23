import type { MarketHedge } from "@lemon/client";
import { cn } from "@lemon/ui";
import { ArrowLeftRight, Info, Scale } from "lucide-react";

/**
 * How level each market's hedge is, and — when it is not — whether anything can
 * be done about it.
 *
 * The blocked case is why this panel exists. A vault can sit visibly off neutral
 * for days with the agent doing nothing, because the correction is worth less
 * than the venue's minimum order and Pacifica would reject it. From the outside
 * that is indistinguishable from a broken agent, and the page said nothing at
 * all about it — so a depositor watching a stubborn drift number had no way to
 * learn that the position is fine, the venue is simply refusing an order this
 * small, and it clears itself as the vault grows.
 *
 * Blocked is therefore rendered quietly rather than in red. Red is for danger,
 * and a hedge the venue will not let you tighten by half a dollar is ordinary
 * state on a small position.
 *
 * Drift is a per-market fact and there is no such thing as the vault's drift:
 * two markets a percent out in opposite directions average to neutral and are
 * both wrong. So each market gets its own block, and a vault running one market
 * gets one block rather than a list of one.
 */
export function HedgePanel({ markets }: { markets: MarketHedge[] }) {
	if (markets.length === 0) return null;

	return (
		<section className="space-y-4 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
			<div>
				<div className="flex items-center gap-2">
					<Scale className="size-4 text-[var(--pon-fg-3)]" />
					<h2 className="font-medium text-[var(--pon-fg-0)]">Hedge balance</h2>
				</div>
				<p className="mt-1 text-sm text-[var(--pon-fg-3)]">
					Each market is meant to hold the same number of units long on Base as it is short on
					Pacifica. Drift is the gap between those two counts — measured in units, not dollars, so
					it does not move just because the price did.
				</p>
			</div>

			<div className={cn(markets.length > 1 ? "grid gap-3 sm:grid-cols-2" : "space-y-3")}>
				{markets.map((hedge) => (
					<MarketHedgeCard key={hedge.ticker} hedge={hedge} />
				))}
			</div>
		</section>
	);
}

function MarketHedgeCard({ hedge }: { hedge: MarketHedge }) {
	const ready = hedge.status === "ready";
	const blocked = hedge.status === "below-lot-size" || hedge.status === "below-min-notional";

	return (
		<div
			className={cn(
				"rounded-[var(--pon-r-md,12px)] border p-4",
				ready ? "border-[var(--pon-amber)] bg-[var(--pon-lime-dim)]" : "border-[var(--pon-line)]",
			)}
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-sm font-medium text-[var(--pon-fg-0)]">
					{hedge.ticker}
					<span className="ml-2 font-mono text-[11px] text-[var(--pon-fg-4)]">
						{hedge.spotSymbol} / {hedge.perpSymbol}
					</span>
				</span>
				<StatusPill status={hedge.status} />
			</div>

			{/* The number and, immediately beside it, the two things that give it
			    meaning: which way the vault is exposed, and the threshold it is
			    being judged against. A bare signed percent tells a non-expert
			    nothing, and tells them nothing about whether it is large. */}
			<div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span
					className={cn(
						"text-2xl font-semibold tabular-nums",
						hedge.status === "unknown"
							? "text-[var(--pon-fg-3)]"
							: ready
								? "text-[var(--pon-amber)]"
								: "text-[var(--pon-fg-0)]",
					)}
				>
					{hedge.status === "unknown" ? "—" : `${formatPercentSigned(hedge.driftPercent)}`}
				</span>
				<span className="text-sm text-[var(--pon-fg-2)]">{exposureLabel(hedge)}</span>
				<span
					className="cursor-help text-xs text-[var(--pon-fg-4)]"
					title="Set per vault. Below it, a correction costs more in trading fees than the drift costs in exposure, so the agent leaves it alone."
				>
					threshold {hedge.thresholdPercent.toFixed(2)}%
				</span>
			</div>

			<dl className="mt-3 space-y-1 text-xs">
				<Row
					label="Long spot"
					value={`${formatQuantity(hedge.spotUnits)} ${hedge.spotSymbol}`}
					hint="Tokens held by the agent wallet on Base."
				/>
				<Row
					label="Short perp"
					value={`${formatQuantity(hedge.perpUnits)} ${hedge.perpSymbol}`}
					hint="Units short on Pacifica. A hedge is level when this matches the spot leg."
				/>
				<Row
					label="Gap"
					value={
						hedge.status === "unknown"
							? "—"
							: `${formatQuantity(hedge.deltaUnits, true)} ${hedge.perpSymbol}${
									hedge.deltaUsd === null ? "" : ` · ${formatUsdSigned(hedge.deltaUsd)}`
								}`
					}
					hint="Spot units minus perp units. Positive means more spot than short — the vault is long that much of the underlying."
				/>
				{(ready || blocked) && (
					<Row
						label="Correction"
						value={
							hedge.correctionUnits === 0
								? "None placeable"
								: `${formatQuantity(Math.abs(hedge.correctionUnits))} ${hedge.perpSymbol}${
										hedge.correctionUsd === null ? "" : ` · ${formatUsd(hedge.correctionUsd)}`
									}`
						}
						hint="What the perp leg would trade to close the gap, after snapping to the venue's quantity grid. Only the perp side moves — correcting on the spot side means paying a thin pool's slippage to fix a rounding artifact."
					/>
				)}
			</dl>

			<Explanation hedge={hedge} />
		</div>
	);
}

/**
 * The sentence that does the actual work.
 *
 * Every branch names the real figures rather than describing them, because
 * "under the venue minimum" is not a fact a reader can check and "$0.45 against
 * a $10 minimum" is.
 */
function Explanation({ hedge }: { hedge: MarketHedge }) {
	const tone = hedge.status === "ready" ? "text-[var(--pon-fg-2)]" : "text-[var(--pon-fg-3)]";
	const icon =
		hedge.status === "ready" ? (
			<ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-[var(--pon-amber)]" />
		) : hedge.status === "neutral" ? null : (
			<Info className="mt-0.5 size-4 shrink-0 text-[var(--pon-fg-4)]" />
		);

	return (
		<div className={cn("mt-3 flex gap-2 text-xs leading-relaxed", tone)}>
			{icon}
			<p>
				{hedge.status === "neutral" && (
					<>
						The legs are within {hedge.thresholdPercent.toFixed(2)}% of each other, which this vault
						treats as level. Chasing a gap this small costs more in trading fees than the exposure
						costs, so the agent leaves it.
					</>
				)}

				{hedge.status === "ready" && (
					<>
						Past this vault's {hedge.thresholdPercent.toFixed(2)}% threshold. The agent will{" "}
						{hedge.deltaUnits > 0 ? "sell" : "buy back"}{" "}
						{formatQuantity(Math.abs(hedge.correctionUnits))} {hedge.perpSymbol}
						{hedge.correctionUsd === null ? "" : ` (about ${formatUsd(hedge.correctionUsd)})`} on
						its next tick to bring the two legs level.
					</>
				)}

				{hedge.status === "below-min-notional" && (
					<>
						Past this vault's {hedge.thresholdPercent.toFixed(2)}% threshold, but the correction is
						worth{" "}
						{hedge.correctionUsd === null
							? "less than the minimum"
							: formatUsd(hedge.correctionUsd)}{" "}
						and Pacifica will not accept a perp order under{" "}
						{hedge.minOrderUsd === null ? "its minimum" : formatUsd(hedge.minOrderUsd)} of notional.
						Nothing is wrong: the legs are as close as this venue lets them be on a position this
						size, and this clears itself as the position grows.
					</>
				)}

				{hedge.status === "below-lot-size" && (
					<>
						Past this vault's {hedge.thresholdPercent.toFixed(2)}% threshold, but the gap is smaller
						than {hedge.lotSize === null ? "one lot" : formatQuantity(hedge.lotSize)}{" "}
						{hedge.perpSymbol} — the smallest quantity Pacifica trades. There is no order that
						closes it, so the legs are already as level as this market allows. This clears itself as
						the position grows.
					</>
				)}

				{hedge.status === "unknown" && (
					<>
						This hedge could not be read just now — either the Base balance or Pacifica's answer is
						missing — so the drift and whether a correction could be placed are both unknown rather
						than zero. See the notes under Open position.
					</>
				)}
			</p>
		</div>
	);
}

function StatusPill({ status }: { status: MarketHedge["status"] }) {
	const label =
		status === "neutral"
			? "In balance"
			: status === "ready"
				? "Rebalance due"
				: status === "below-min-notional"
					? "Below venue minimum"
					: status === "below-lot-size"
						? "Smaller than one lot"
						: "Not readable";

	return (
		<span
			className={cn(
				"firm-label rounded-[var(--pon-r-sm)] border px-2 py-0.5",
				status === "ready"
					? "border-[var(--pon-amber)] text-[var(--pon-amber)]"
					: status === "neutral"
						? "border-[var(--pon-up)] text-[var(--pon-up)]"
						: // Blocked and unreadable are informational, not alarming. A hedge
							// the venue will not let the agent tighten is not a failure.
							"border-[var(--pon-line)] text-[var(--pon-fg-3)]",
			)}
		>
			{label}
		</span>
	);
}

/** "under-hedged" / "over-hedged", in words a reader does not have to decode. */
function exposureLabel(hedge: MarketHedge): string {
	if (hedge.status === "unknown") return "drift unknown";
	if (hedge.exposure === "neutral") return "neutral";
	return hedge.exposure === "long"
		? "under-hedged — the vault is net long"
		: "over-hedged — the vault is net short";
}

function formatQuantity(value: number, signed = false): string {
	const body = Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 6 });
	if (!signed) return body;
	return `${value > 0 ? "+" : value < 0 ? "−" : ""}${body}`;
}

function formatUsd(value: number): string {
	return `$${Math.abs(value).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function formatUsdSigned(value: number): string {
	return `${value < 0 ? "−" : "+"}${formatUsd(value)}`;
}

function formatPercentSigned(value: number): string {
	return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;
}

/** The same label/value row `PositionPanel` uses, so the two panels read as one. */
function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className={cn("text-[var(--pon-fg-3)]", hint && "cursor-help")} title={hint}>
				{label}
			</dt>
			<dd className="text-right tabular-nums text-[var(--pon-fg)]">{value}</dd>
		</div>
	);
}
