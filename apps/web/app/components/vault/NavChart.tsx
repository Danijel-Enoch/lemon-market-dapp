import type { NavPoint } from "@lemon/client";
import { formatDateTime, formatUsd, toBigInt } from "@lemon/client";
import { FUNDING_INTERVAL_SECONDS, lastPerFundingPeriod } from "@lemon/core";
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * One point per funding period.
 *
 * The series is drawn on the venue's clock, not the agent's. A hedged position
 * earns at a funding settlement and nothing between two of them, so a period is
 * the smallest interval over which this line means anything: within one, the
 * spot and perp legs move against each other and what is left is mark noise
 * drawn as a share price. Pacifica settles hourly, so this is an hourly line.
 *
 * The agent reports on the same clock (`navReportDue` in the worker), which
 * makes this a no-op for anything recorded since. It still runs, because the
 * history in front of it was recorded at the contract's fifteen-minute floor
 * and a chart that switches resolution partway along is a chart that appears to
 * get calmer over time for no reason at all.
 */
export function byFundingPeriod(points: NavPoint[]): NavPoint[] {
	return lastPerFundingPeriod(points, (point) => point.timestamp, FUNDING_INTERVAL_SECONDS);
}

/**
 * Share price over time, one point per funding period.
 *
 * Share price, not total assets. Assets move every time somebody deposits or
 * withdraws, so a TVL chart would show a vertical step for a large deposit and
 * read as a gain — this line moves only on the position's own performance, which
 * is what the chart is being asked about.
 *
 * The y-axis is scaled to the data rather than anchored at zero. A basis vault
 * moves a few percent a year, and a zero-based axis renders that as a flat line
 * — technically honest and completely uninformative. The axis labels carry the
 * actual values so the scale is readable rather than implied.
 */
export function NavChart({ points }: { points: NavPoint[] }) {
	const data = useMemo(
		() =>
			byFundingPeriod(points).map((point) => ({
				t: point.timestamp,
				// Six decimals of USDC as a float is safe here: a share price is
				// around 1e6 and well inside float precision. Balances are not.
				price: Number(toBigInt(point.pricePerShare)) / 1e6,
			})),
		[points],
	);

	if (data.length < 2) {
		return (
			<div className="flex h-48 items-center justify-center rounded-[var(--pon-r-lg,16px)] border border-dashed border-[var(--pon-line)] text-sm text-[var(--pon-fg-3)]">
				Not enough funding periods yet to draw a line.
			</div>
		);
	}

	const values = data.map((d) => d.price);
	const min = Math.min(...values);
	const max = Math.max(...values);
	// A flat series would collapse to a zero-height domain and render nothing.
	const pad = Math.max((max - min) * 0.15, 0.0005);

	const first = values[0];
	const last = values[values.length - 1];
	const up = last >= first;
	const stroke = up ? "var(--pon-up)" : "var(--pon-down)";

	// A day's worth of hourly periods all fall on the same calendar date, so a
	// date-only axis would label the whole chart "Sep 9" and say nothing about
	// where along it a point sits. Past a couple of days the reverse is true and
	// the clock time is the noise.
	const span = data[data.length - 1].t - data[0].t;
	const tickLabel = (t: number) =>
		new Date(t * 1000).toLocaleString(
			undefined,
			span <= 2 * 24 * 3600
				? { hour: "numeric", minute: "2-digit" }
				: { month: "short", day: "numeric" },
		);

	return (
		<div className="h-48 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
					<defs>
						<linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
							<stop offset="100%" stopColor={stroke} stopOpacity={0} />
						</linearGradient>
					</defs>

					<XAxis
						dataKey="t"
						type="number"
						domain={["dataMin", "dataMax"]}
						tickFormatter={tickLabel}
						stroke="var(--pon-fg-4)"
						tick={{ fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						minTickGap={40}
					/>
					<YAxis
						domain={[min - pad, max + pad]}
						tickFormatter={(v: number) => `$${v.toFixed(4)}`}
						stroke="var(--pon-fg-4)"
						tick={{ fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						width={64}
					/>
					<Tooltip
						contentStyle={{
							background: "var(--pon-surface)",
							border: "1px solid var(--pon-line-2)",
							borderRadius: 8,
							fontSize: 12,
						}}
						labelFormatter={(t) => formatDateTime(Number(t))}
						formatter={(value) => [`$${Number(value ?? 0).toFixed(6)}`, "Share price"]}
					/>
					<Area
						type="monotone"
						dataKey="price"
						stroke={stroke}
						strokeWidth={2}
						fill="url(#navFill)"
						dot={false}
						isAnimationActive={false}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

/**
 * The change across whatever window is being shown, as a percentage.
 *
 * Measured over the same thinned series the chart draws, so the figure printed
 * next to the line is the change between its first and last point rather than
 * between two valuations one of which was dropped from it.
 */
export function navChange(points: NavPoint[]): number | null {
	const series = byFundingPeriod(points);
	if (series.length < 2) return null;
	const first = Number(toBigInt(series[0].pricePerShare));
	const last = Number(toBigInt(series[series.length - 1].pricePerShare));
	if (first === 0) return null;
	return ((last - first) / first) * 100;
}

export function formatSharePrice(pricePerShare: string): string {
	return formatUsd(pricePerShare, 6);
}
