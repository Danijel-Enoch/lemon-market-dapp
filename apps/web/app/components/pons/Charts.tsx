import { cn } from "@app/lib/utils";
import { useId } from "react";

/**
 * Charts.
 *
 * The Pons chart language: a lime line over a gradient that fades to nothing,
 * dashed hairline gridlines behind it, and a filled dot with a soft halo on the
 * final point. Everything is plain SVG — no chart library — because these are
 * shapes in the design system rather than a plotting surface, and stretching
 * them with `preserveAspectRatio="none"` is what keeps them responsive.
 */

const W = 720;
const H = 220;

/** Map a series to y-coordinates, inverted so a higher value sits higher. */
function project(values: number[], height: number, pad = 12): [number, number][] {
	const finite = values.filter((v) => Number.isFinite(v));
	const min = Math.min(...finite);
	const max = Math.max(...finite);
	const span = max - min || 1;
	const usable = height - pad * 2;
	const n = values.length;

	return values.map((value, index) => {
		const x = n === 1 ? W / 2 : (index / (n - 1)) * W;
		const y = pad + (1 - (value - min) / span) * usable;
		return [x, y];
	});
}

function toPath(points: [number, number][]): string {
	return points
		.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
		.join(" ");
}

export function AreaChart({
	data,
	height = 200,
	color = "var(--pon-lime)",
	gridlines = 2,
	showEndpoint = true,
	className,
}: {
	data: number[];
	height?: number;
	color?: string;
	gridlines?: number;
	showEndpoint?: boolean;
	className?: string;
}) {
	const gradientId = useId();
	const points = data.length > 1 ? project(data, H) : [];

	if (points.length === 0) {
		return (
			<div
				className={cn(
					"flex items-center justify-center rounded-[var(--pon-r-md)] bg-[var(--pon-bg-2)] t-caption text-[var(--pon-fg-3)]",
					className,
				)}
				style={{ height }}
			>
				No data
			</div>
		);
	}

	const line = toPath(points);
	const area = `${line} L${W} ${H} L0 ${H} Z`;
	const [lastX, lastY] = points[points.length - 1];

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			aria-hidden="true"
			className={cn("block w-full", className)}
			style={{ height }}
		>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={color} stopOpacity="0.35" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>

			{Array.from({ length: gridlines }, (_, i) => {
				const y = ((i + 1) / (gridlines + 1)) * H;
				return (
					<line
						key={y}
						x1="0"
						y1={y}
						x2={W}
						y2={y}
						stroke="var(--pon-line)"
						strokeWidth="1"
						strokeDasharray="3 5"
					/>
				);
			})}

			<path d={area} fill={`url(#${gradientId})`} />
			<path
				d={line}
				fill="none"
				stroke={color}
				strokeWidth="2.5"
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>

			{showEndpoint && (
				<>
					<circle cx={lastX} cy={lastY} r="9" fill={color} opacity="0.22" />
					<circle cx={lastX} cy={lastY} r="4.5" fill={color} />
				</>
			)}
		</svg>
	);
}

/**
 * Bar chart.
 *
 * Pons highlights the most recent completed bar with a gradient and a bloom,
 * leaving the rest flat — so the eye lands on "now" without a legend.
 */
export function BarChart({
	data,
	height = 150,
	highlightLast = true,
	className,
}: {
	data: number[];
	height?: number;
	highlightLast?: boolean;
	className?: string;
}) {
	const max = Math.max(...data.filter(Number.isFinite), 0) || 1;

	return (
		<div className={cn("flex items-end gap-2.5", className)} style={{ height }}>
			{data.map((value, index) => {
				const last = highlightLast && index === data.length - 1;
				const pct = Math.max(2, (Math.max(0, value) / max) * 100);
				return (
					<div
						// Bars are positional: index is the only stable identity a value has.
						// biome-ignore lint/suspicious/noArrayIndexKey: positional series
						key={index}
						className="flex h-full flex-1 flex-col justify-end"
					>
						<div
							className="animate-pon-rise rounded-t-[3px]"
							style={{
								height: `${pct}%`,
								background: last
									? "linear-gradient(180deg, var(--pon-lime-2), var(--pon-lime))"
									: "var(--pon-lime)",
								boxShadow: last ? "0 0 16px -2px var(--pon-glow)" : undefined,
								animationDelay: `${index * 30}ms`,
							}}
						/>
					</div>
				);
			})}
		</div>
	);
}

/** Axis strip under a chart — evenly spaced tick labels, quiet ink. */
export function ChartAxis({ labels, className }: { labels: string[]; className?: string }) {
	return (
		<div className={cn("flex justify-between pt-2.5 t-micro text-[var(--pon-fg-3)]", className)}>
			{labels.map((label) => (
				<span key={label}>{label}</span>
			))}
		</div>
	);
}

/**
 * Sparkline — the unadorned form for table rows and cards, where the gridlines
 * and endpoint of the full chart would be noise at that size.
 */
export function Sparkline({
	data,
	height = 32,
	positive = true,
	className,
}: {
	data: number[];
	height?: number;
	positive?: boolean;
	className?: string;
}) {
	if (data.length < 2) return null;
	const points = project(data, H, 20);
	const color = positive ? "var(--pon-up)" : "var(--pon-down)";

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			aria-hidden="true"
			className={cn("block w-full", className)}
			style={{ height }}
		>
			<path
				d={toPath(points)}
				fill="none"
				stroke={color}
				strokeWidth="2"
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}
