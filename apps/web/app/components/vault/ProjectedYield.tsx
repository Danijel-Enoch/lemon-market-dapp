import type { Vault, VaultOutlook } from "@lemon/client";
import { formatPercent } from "@lemon/client";
import { cn } from "@lemon/ui";
import { Info } from "lucide-react";

/**
 * What a vault would pay if today's funding rate held.
 *
 * This exists because the realised columns cannot answer the question a
 * depositor actually has. They measure the change in a vault's own share price,
 * so a vault nobody has deposited into has no figure and never will until
 * somebody goes first — and asking that person to commit capital against a dash
 * is not caution, it is an absence of information.
 *
 * The whole design of this component is about keeping that distinction visible.
 * It is always labelled "projected", it is never rendered in the same style as
 * a realised number, and the breakdown is one interaction away rather than
 * hidden — because the gap between the venue's headline funding rate and what a
 * depositor keeps is large, and a projection that hides its deductions is how a
 * 14% market becomes a 6% return nobody was warned about.
 *
 * Both variants take the whole `VaultOutlook` union, so the unavailable case
 * cannot be forgotten: there is always something to render in the slot, and it
 * says why.
 */

/** A compact figure for a table cell or a stat card. */
export function ProjectedYieldCell({
	outlook,
	className,
}: {
	outlook: VaultOutlook;
	className?: string;
}) {
	if (!outlook.available) {
		return (
			<div className={cn("text-right", className)}>
				<span className="tabular-nums text-[var(--pon-fg-4)]" title={outlook.reason}>
					—
				</span>
			</div>
		);
	}

	const positive = outlook.netApyPercent > 0;

	return (
		<div className={cn("text-right", className)}>
			<span
				className={cn("tabular-nums", positive ? "text-[var(--pon-up)]" : "text-[var(--pon-fg-2)]")}
				title={projectionSummary(outlook)}
			>
				{formatPercent(outlook.netApyPercent, 1)}
			</span>
		</div>
	);
}

/**
 * The full derivation, from the venue's rate to what a depositor keeps.
 *
 * Shown where somebody is about to commit money. Every line is a subtraction,
 * and they are listed in the order they are applied rather than by size,
 * because the question being answered is "where did the rest of it go".
 */
export function ProjectedYieldBreakdown({
	vault,
	outlook,
}: {
	vault: Vault;
	outlook: VaultOutlook;
}) {
	if (!outlook.available) {
		return (
			<div className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-4 py-3">
				<p className="text-sm font-medium text-[var(--pon-fg-0)]">No projected yield</p>
				<p className="mt-1 text-xs leading-relaxed text-[var(--pon-fg-3)]">{outlook.reason}</p>
			</div>
		);
	}

	const positive = outlook.netApyPercent > 0;

	return (
		<div className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-4 py-3">
			<div className="flex items-baseline justify-between gap-3">
				<div className="flex items-center gap-1.5">
					<span className="text-sm text-[var(--pon-fg-2)]">Projected yield</span>
					<Info className="size-3.5 text-[var(--pon-fg-4)]" aria-hidden />
				</div>
				<span
					className={cn(
						"text-lg font-medium tabular-nums",
						positive ? "text-[var(--pon-up)]" : "text-[var(--pon-down)]",
					)}
				>
					{formatPercent(outlook.netApyPercent, 1)}
				</span>
			</div>

			<dl className="mt-3 space-y-1 text-xs">
				<Line
					label={`Funding at ${outlook.fundingShortPercentPerHour.toFixed(4)}%/hr, annualised`}
					value={formatPercent(outlook.fundingAprPercent, 1)}
				/>
				<Line
					label={`On capital at ${outlook.assumptions.leverage}x`}
					value={formatPercent(outlook.grossApyPercent, 1)}
					note="Funding is earned on the position; margin has to be posted for it too."
				/>
				<Line
					label={`Less the ${Math.round((1 - outlook.assumptions.deployedFraction) * 100)}% held for withdrawals`}
					value={formatPercent(outlook.afterBufferApyPercent, 1)}
					note="The vault keeps a buffer idle so the redemption queue can be paid. It earns nothing."
				/>
				<Line
					label="Less venue fees and slippage"
					value={formatPercent(outlook.afterCostsApyPercent, 1)}
					deduction={outlook.roundTripDragPercent}
					note="Four fills — both legs, in and out — plus the spot pool's price impact, charged once a year."
				/>
				<Line
					label={`Less the ${outlook.managementFeePercent}% management fee`}
					value={formatPercent(outlook.afterManagementApyPercent, 1)}
					deduction={outlook.managementFeePercent}
				/>
				<Line
					label={`Less the ${outlook.assumptions.performanceFeeBps / 100}% performance fee`}
					value={formatPercent(outlook.netApyPercent, 1)}
					deduction={outlook.performanceFeeDragPercent}
					note={
						outlook.performanceFeeDragPercent === 0
							? "Charged on gains only, so nothing is taken here."
							: undefined
					}
					emphasis
				/>
			</dl>

			<p className="mt-3 text-[11px] leading-relaxed text-[var(--pon-fg-4)]">
				{projectionCaveat(outlook, vault)}
			</p>
		</div>
	);
}

function Line({
	label,
	value,
	note,
	deduction,
	emphasis,
}: {
	label: string;
	value: string;
	note?: string;
	deduction?: number;
	emphasis?: boolean;
}) {
	return (
		<div>
			<div className="flex items-baseline justify-between gap-3">
				<dt
					className={cn(
						"min-w-0 truncate",
						emphasis ? "font-medium text-[var(--pon-fg-1)]" : "text-[var(--pon-fg-3)]",
					)}
				>
					{label}
					{deduction !== undefined && deduction > 0 ? (
						<span className="ml-1 text-[var(--pon-fg-4)]">(−{deduction.toFixed(2)}%)</span>
					) : null}
				</dt>
				<dd
					className={cn(
						"shrink-0 tabular-nums",
						emphasis ? "font-medium text-[var(--pon-fg-0)]" : "text-[var(--pon-fg-2)]",
					)}
				>
					{value}
				</dd>
			</div>
			{note && <p className="mt-0.5 text-[11px] leading-snug text-[var(--pon-fg-4)]">{note}</p>}
		</div>
	);
}

/** The one-line version, for a `title` attribute on a compact cell. */
function projectionSummary(outlook: Extract<VaultOutlook, { available: true }>): string {
	return [
		`Projected, not measured: what this vault would pay if funding held at ${outlook.fundingShortPercentPerHour.toFixed(4)}% per hour.`,
		`Net of the idle buffer, venue costs, the ${outlook.managementFeePercent}% management fee and the ${outlook.assumptions.performanceFeeBps / 100}% performance fee.`,
		"Funding changes hourly and can go negative.",
	].join(" ");
}

/**
 * The caveat, which is not boilerplate.
 *
 * A basis position's whole return is funding, and funding is not a yield a
 * venue owes anyone — it is the price of a crowded side of a trade, and it
 * inverts. Saying so next to the number is the difference between an estimate
 * and a promise, and it is more important on the vaults where the number looks
 * best.
 */
function projectionCaveat(
	outlook: Extract<VaultOutlook, { available: true }>,
	vault: Vault,
): string {
	if (!outlook.fundingPositive) {
		return `${vault.ticker ?? vault.symbol} funding is currently negative, which means the hedge costs money to hold rather than earning it. This projection is what that costs, annualised — it is not a forecast that it stays this way.`;
	}

	const breakeven =
		outlook.breakevenDays === null
			? ""
			: ` Entry and exit cost about ${Math.round(outlook.breakevenDays)} days of funding to recover, so a short stay can lose money at this rate.`;

	return `A projection from the funding rate right now, not a measurement and not a promise. Funding is repriced hourly and turns negative when the crowd flips sides.${breakeven}`;
}
