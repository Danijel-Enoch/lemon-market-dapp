import type { FundingPoint } from "@lemon/client";
import { formatUsdSigned, toBigInt } from "@lemon/client";
import { useMemo } from "react";
import {
	Bar,
	BarChart,
	Cell,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

/**
 * What funding paid, one bar per day.
 *
 * Bars rather than a line, and per-day amounts rather than a running total,
 * because funding is not a level — it is a series of payments. A cumulative line
 * only ever goes one way and makes a week the vault paid out look like a week it
 * merely earned less; separate bars put those below the axis where they are, and
 * a reader can see how often it happens. The running total is on the card above,
 * where a single number is the right shape for it.
 *
 * Days that paid nothing are drawn as gaps rather than dropped. A chart built
 * only from days with settlements would space an outage evenly with the days
 * either side and hide that the agent was down.
 *
 * Deliberately not a chart of the funding *rate*. The rate is what the venue is
 * quoting now and it reprices hourly — the projection on the board is the place
 * for it. This is money that arrived, which is the claim the rest of this page
 * is making.
 */
export function FundingChart({ points }: { points: FundingPoint[] }) {
	const data = useMemo(
		() =>
			points.map((point) => ({
				day: point.day,
				// A day's funding is a few dollars to a few thousand — far inside
				// float precision at six decimals. Balances are not, and are kept as
				// bigint everywhere else for that reason.
				amount: Number(toBigInt(point.amount)) / 1e6,
				settlements: point.settlements,
			})),
		[points],
	);

	const paid = data.filter((d) => d.settlements > 0);

	if (paid.length === 0) {
		return (
			<div className="flex h-48 items-center justify-center rounded-[var(--pon-r-lg,16px)] border border-dashed border-[var(--pon-line)] px-6 text-center text-sm text-[var(--pon-fg-3)]">
				No funding settlements reported in this window yet.
			</div>
		);
	}

	const values = data.map((d) => d.amount);
	const max = Math.max(...values, 0);
	const min = Math.min(...values, 0);
	// A domain padded away from zero on whichever sides are used, so a series
	// that is entirely positive still leaves the axis at the bottom rather than
	// floating the smallest bar off it.
	const pad = Math.max((max - min) * 0.15, 0.01);

	const label = (day: number) =>
		new Date(day * 1000).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		});

	return (
		<div className="h-48 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
					<XAxis
						dataKey="day"
						type="number"
						domain={["dataMin", "dataMax"]}
						tickFormatter={label}
						stroke="var(--pon-fg-4)"
						tick={{ fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						minTickGap={40}
					/>
					<YAxis
						domain={[min - (min < 0 ? pad : 0), max + pad]}
						tickFormatter={(v: number) => `$${v.toFixed(2)}`}
						stroke="var(--pon-fg-4)"
						tick={{ fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						width={64}
					/>
					{/* Drawn explicitly, because on an all-positive series the axis sits
					    at the foot of the plot and the reader has nothing telling them
					    where zero is if the domain ever crosses it. */}
					<ReferenceLine y={0} stroke="var(--pon-line-2)" />
					<Tooltip
						cursor={{ fill: "var(--pon-surface)" }}
						contentStyle={{
							background: "var(--pon-surface)",
							border: "1px solid var(--pon-line-2)",
							borderRadius: 8,
							fontSize: 12,
						}}
						labelFormatter={(day) => `${label(Number(day))} (UTC)`}
						formatter={(value, _name, item) => {
							const settlements = (item?.payload as { settlements: number } | undefined)
								?.settlements;
							return [
								`$${Number(value ?? 0).toFixed(2)}`,
								settlements
									? `Funding · ${settlements} settlement${settlements === 1 ? "" : "s"}`
									: "Funding",
							];
						}}
					/>
					<Bar dataKey="amount" isAnimationActive={false} radius={[2, 2, 0, 0]}>
						{data.map((point) => (
							<Cell key={point.day} fill={point.amount < 0 ? "var(--pon-down)" : "var(--pon-up)"} />
						))}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}

/**
 * The headline over the chart: what today has paid so far.
 *
 * "So far" is the whole point of the caption. Today's bucket fills in over the
 * day — Pacifica settles hourly — so the figure is partial until the UTC day
 * closes, and a number presented without that reads as a finished day that
 * happened to earn very little every time somebody looks in the morning.
 */
export function FundingToday({ amount, settlements }: { amount: string; settlements: number }) {
	const value = toBigInt(amount);

	return (
		<div className="text-right">
			<div
				className={cnTone(value)}
				title="Funding credited to this vault since 00:00 UTC, across every market it runs."
			>
				{settlements === 0 ? "—" : formatUsdSigned(value)}
			</div>
			<div className="text-[11px] text-[var(--pon-fg-4)]">
				{settlements === 0
					? "nothing settled yet today"
					: `today so far · ${settlements} settlement${settlements === 1 ? "" : "s"}`}
			</div>
		</div>
	);
}

function cnTone(value: bigint): string {
	const base = "font-fono text-lg font-semibold leading-none tabular-nums";
	if (value > 0n) return `${base} text-[var(--pon-up)]`;
	if (value < 0n) return `${base} text-[var(--pon-down)]`;
	return `${base} text-[var(--pon-fg-2)]`;
}
