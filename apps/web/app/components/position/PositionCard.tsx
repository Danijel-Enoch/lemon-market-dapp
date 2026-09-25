import { PositionActions } from "@app/components/position/PositionActions";
import type { SelfPosition, SelfPositionStatus } from "@lemon/client";
import { formatPercent, formatUsd, formatUsdSigned } from "@lemon/client";
import { cn } from "@lemon/ui";
import { AlertTriangle, CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";

/**
 * One self-managed position.
 *
 * Hedge status is the first thing on the card and the loudest thing on it,
 * ahead of value and ahead of P&L. That ordering is the entire argument for this
 * component: a basis position that has lost a leg does not look broken — it
 * looks like a position that is suddenly making or losing money quickly, which
 * is the most dangerous thing a hedged product can resemble. A holder who reads
 * only the top line of this card should still learn that they are unhedged.
 *
 * P&L is deliberately second. It is the number people look for and it is the
 * least informative one here: a delta-neutral position's mark-to-market swings
 * with each leg's pricing timestamp and means very little between funding
 * settlements. What the position is actually earning is funding, and that has
 * its own figure.
 */

const STATUS_PRESENTATION: Record<
	SelfPositionStatus,
	{ label: string; tone: "good" | "warn" | "bad" | "muted" }
> = {
	DRAFT: { label: "Not opened", tone: "muted" },
	SPOT_ONLY: { label: "Unhedged — spot only", tone: "bad" },
	PERP_ONLY: { label: "Unhedged — short only", tone: "bad" },
	OPEN: { label: "Hedged", tone: "good" },
	DRIFTED: { label: "Drifted", tone: "warn" },
	CLOSING: { label: "Closing", tone: "warn" },
	CLOSED: { label: "Closed", tone: "muted" },
	STALE: { label: "Needs attention", tone: "bad" },
};

const TONE_CLASS = {
	good: "border-[var(--pon-up)] text-[var(--pon-up)]",
	warn: "border-[var(--pon-amber)] text-[var(--pon-amber)]",
	bad: "border-[var(--pon-down)] text-[var(--pon-down)]",
	muted: "border-[var(--pon-line)] text-[var(--pon-fg-3)]",
} as const;

const TONE_ICON = {
	good: CircleCheck,
	warn: TriangleAlert,
	bad: AlertTriangle,
	muted: CircleHelp,
} as const;

export function PositionCard({ position }: { position: SelfPosition }) {
	const presentation = STATUS_PRESENTATION[position.status];

	// The card's tone follows the *measured* hedge rather than the stored status
	// where the two disagree. The status is what we last wrote down; the hedge is
	// what the venues say right now, and a position whose spot leg was sold
	// elsewhere is unhedged long before any of our code notices.
	const tone = position.hedge.balanced ? presentation.tone : "bad";
	const Icon = TONE_ICON[tone];

	const pnl = position.economics.unrealisedPnlUsdc ?? position.economics.realisedPnlUsdc;

	return (
		<article className="overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
			<header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--pon-line)] px-5 py-4">
				<div>
					<h3 className="text-[17px] font-semibold text-[var(--pon-fg-0)]">{position.ticker}</h3>
					<p className="mt-0.5 text-[11.5px] text-[var(--pon-fg-3)]">
						long {position.spot.symbol} · short {position.perp.symbol}
					</p>
				</div>

				<span
					className={cn(
						"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
						TONE_CLASS[tone],
					)}
				>
					<Icon size={12} aria-hidden />
					{position.hedge.balanced ? presentation.label : "Unhedged"}
				</span>
			</header>

			{/* The sentence, composed server-side where the context lives. It is the
			    only part of this card a hurried reader is guaranteed to take in. */}
			<p
				className={cn(
					"border-b border-[var(--pon-line)] px-5 py-3 text-[12.5px] leading-relaxed",
					tone === "bad"
						? "bg-[var(--pon-lime-dim)] text-[var(--pon-fg-0)]"
						: "text-[var(--pon-fg-2)]",
				)}
			>
				{position.hedge.summary}
			</p>

			{position.statusReason && (
				<p className="border-b border-[var(--pon-line)] px-5 py-3 text-[11.5px] leading-relaxed text-[var(--pon-amber)]">
					{position.statusReason}
				</p>
			)}

			<div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-4">
				<Figure
					label="Value"
					value={
						position.economics.valueUsdc === null ? "—" : formatUsd(position.economics.valueUsdc)
					}
				/>
				<Figure
					label="Funding earned"
					value={formatUsdSigned(position.economics.fundingUsdc)}
					tone={Number(position.economics.fundingUsdc) >= 0 ? "positive" : "negative"}
				/>
				<Figure
					label={position.closedAt ? "Realised P&L" : "Unrealised P&L"}
					value={pnl === null ? "—" : formatUsdSigned(pnl)}
					tone={pnl === null ? undefined : Number(pnl) >= 0 ? "positive" : "negative"}
				/>
				<Figure
					label="Net APY"
					value={
						position.economics.netApyPercent === null
							? "—"
							: formatPercent(position.economics.netApyPercent, 1)
					}
					hint="at current funding"
				/>
			</div>

			<div className="grid gap-px border-t border-[var(--pon-line)] bg-[var(--pon-line)] sm:grid-cols-2">
				<LegSummary
					title="Spot — your wallet"
					size={position.spot.size}
					unit={position.spot.symbol}
					valueUsd={position.spot.valueUsd}
					unavailable={position.spot.unavailable}
				/>
				<LegSummary
					title="Short — Pacifica"
					size={position.perp.size}
					unit={position.ticker}
					valueUsd={position.perp.valueUsd}
					unavailable={position.perp.unavailable}
					extra={
						position.perp.liquidationPrice === null
							? position.economics.leverageBps <= 10_000
								? "No liquidation price at 1x"
								: null
							: `Liquidation ~$${position.perp.liquidationPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
					}
					extraTone={position.perp.liquidationPrice === null ? "good" : "warn"}
				/>
			</div>

			<PositionActions position={position} />
		</article>
	);
}

function Figure({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: string;
	hint?: string;
	tone?: "positive" | "negative";
}) {
	return (
		<div>
			<p className="firm-label text-[var(--pon-fg-3)]">{label}</p>
			<p
				className={cn(
					"font-fono mt-1 text-[15px] font-bold leading-tight",
					tone === "positive" && "text-[var(--pon-up)]",
					tone === "negative" && "text-[var(--pon-down)]",
					!tone && "text-[var(--pon-fg)]",
				)}
			>
				{value}
			</p>
			{hint && <p className="mt-0.5 text-[10.5px] text-[var(--pon-fg-3)]">{hint}</p>}
		</div>
	);
}

/**
 * One leg, and whether it could be read at all.
 *
 * An unreadable leg renders as "could not read" rather than as zero, which is
 * the same distinction the API preserves and for the same reason: a flat leg and
 * an unreachable venue produce identical numbers, and only one of them is an
 * emergency.
 */
function LegSummary({
	title,
	size,
	unit,
	valueUsd,
	unavailable,
	extra,
	extraTone,
}: {
	title: string;
	size: number | null;
	unit: string;
	valueUsd: number | null;
	unavailable: string | null;
	extra?: string | null;
	extraTone?: "good" | "warn";
}) {
	return (
		<div className="bg-[var(--pon-bg-2)] px-5 py-4">
			<p className="firm-label text-[var(--pon-fg-3)]">{title}</p>

			{size === null ? (
				<p className="mt-1.5 text-[12px] text-[var(--pon-amber)]">Could not be read</p>
			) : (
				<p className="font-fono mt-1.5 text-[14px] font-bold text-[var(--pon-fg)]">
					{size.toLocaleString("en-US", { maximumFractionDigits: 6 })}{" "}
					<span className="text-[11.5px] font-medium text-[var(--pon-fg-3)]">{unit}</span>
				</p>
			)}

			{valueUsd !== null && (
				<p className="mt-0.5 font-fono text-[11.5px] text-[var(--pon-fg-3)]">
					${valueUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
				</p>
			)}

			{extra && (
				<p
					className={cn(
						"mt-1.5 text-[10.5px]",
						extraTone === "good" ? "text-[var(--pon-up)]" : "text-[var(--pon-fg-3)]",
					)}
				>
					{extra}
				</p>
			)}

			{unavailable && (
				<p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--pon-amber)]">
					{unavailable}
				</p>
			)}
		</div>
	);
}
