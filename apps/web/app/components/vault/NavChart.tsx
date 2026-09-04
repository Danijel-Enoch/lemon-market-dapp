import type { NavPoint } from "@lemon/client";
import { formatDateTime, formatUsd, toBigInt } from "@lemon/client";
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Share price over time.
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
			points.map((point) => ({
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
				Not enough valuations yet to draw a line.
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
						tickFormatter={(t) =>
							new Date(t * 1000).toLocaleDateString(undefined, {
								month: "short",
								day: "numeric",
							})
						}
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

/** The change across whatever window is being shown, as a percentage. */
export function navChange(points: NavPoint[]): number | null {
	if (points.length < 2) return null;
	const first = Number(toBigInt(points[0].pricePerShare));
	const last = Number(toBigInt(points[points.length - 1].pricePerShare));
	if (first === 0) return null;
	return ((last - first) / first) * 100;
}

export function formatSharePrice(pricePerShare: string): string {
	return formatUsd(pricePerShare, 6);
}
