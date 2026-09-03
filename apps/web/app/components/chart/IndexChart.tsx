import { TimeframeGroup } from "@app/components/pons/Segmented";
import { Skeleton } from "@app/components/ui/skeleton";
import { basketApi } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { formatPercent } from "@lemon/core";
import { useQuery } from "@tanstack/react-query";
import {
	AreaSeries,
	ColorType,
	createChart,
	type IChartApi,
	type ISeriesApi,
	type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

const RESOLUTIONS = [
	{ value: "60", label: "1H" },
	{ value: "240", label: "4H" },
	{ value: "D", label: "1D" },
] as const;

type Resolution = (typeof RESOLUTIONS)[number]["value"];
type ResolutionLabel = (typeof RESOLUTIONS)[number]["label"];

/* The picker speaks in labels; the API speaks in resolution codes. */
const RESOLUTION_LABELS = RESOLUTIONS.map((option) => option.label) as ResolutionLabel[];
const LABEL_FOR = Object.fromEntries(
	RESOLUTIONS.map((option) => [option.value, option.label]),
) as Record<Resolution, ResolutionLabel>;
const RESOLUTION_FOR = Object.fromEntries(
	RESOLUTIONS.map((option) => [option.label, option.value]),
) as Record<ResolutionLabel, Resolution>;

/**
 * Composite index chart for a basket.
 *
 * An area series rather than candles: the index is a computed average of
 * rebased constituents, so it has no meaningful open/high/low — only a level.
 * Drawing candles would imply intra-bar range data that does not exist.
 *
 * The axis reads in index points (100 = the start of the window), not dollars,
 * because the legs are rebased before averaging.
 */
export function IndexChart({ basketId, name }: { basketId: string; name: string }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
	const [resolution, setResolution] = useState<Resolution>("60");

	const { data, isLoading, error } = useQuery({
		queryKey: ["basket-candles", basketId, resolution],
		queryFn: () => basketApi.candles(basketId, resolution),
		refetchInterval: 60_000,
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const chart = createChart(container, {
			layout: {
				background: { type: ColorType.Solid, color: "transparent" },
				textColor: "#64748b",
				fontFamily: "Space Grotesk, sans-serif",
			},
			grid: {
				vertLines: { color: "rgba(255,255,255,0.04)" },
				horzLines: { color: "rgba(255,255,255,0.04)" },
			},
			rightPriceScale: { borderColor: "#222222" },
			timeScale: { borderColor: "#222222", timeVisible: true },
			height: 360,
			autoSize: true,
		});

		const series = chart.addSeries(AreaSeries, {
			lineColor: "#a3e635",
			// The Pons area fade: 35% at the line, nothing at the axis.
			topColor: "rgba(163,230,53,0.35)",
			bottomColor: "rgba(163,230,53,0)",
			lineWidth: 2,
		});

		chartRef.current = chart;
		seriesRef.current = series;
		return () => {
			chart.remove();
			chartRef.current = null;
			seriesRef.current = null;
		};
	}, []);

	useEffect(() => {
		const series = seriesRef.current;
		if (!series || !data?.points) return;

		series.setData(
			data.points.map((point) => ({
				time: Math.floor(point.time / 1000) as UTCTimestamp,
				value: point.value,
			})),
		);
		chartRef.current?.timeScale().fitContent();
	}, [data]);

	return (
		<div className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-baseline gap-2.5">
					<span className="font-display text-[15px] font-bold text-[var(--pon-fg)]">
						{name} index
					</span>
					{data && (
						<span
							className={cn(
								"font-fono text-sm font-semibold",
								data.changePercent >= 0 ? "text-[var(--pon-up)]" : "text-[var(--pon-down)]",
							)}
						>
							{formatPercent(data.changePercent)}
						</span>
					)}
				</div>
				<TimeframeGroup
					options={RESOLUTION_LABELS}
					value={LABEL_FOR[resolution]}
					onChange={(label) => setResolution(RESOLUTION_FOR[label])}
					aria-label="Chart timeframe"
				/>
			</div>

			<div className="relative">
				<div ref={containerRef} className="h-[360px] w-full" />
				{isLoading && (
					<div className="absolute inset-0">
						<Skeleton className="h-full w-full" />
					</div>
				)}
				{!isLoading && (error || data?.points.length === 0) && (
					<div className="absolute inset-0 flex items-center justify-center">
						<p className="text-[13px] text-[var(--pon-fg-3)]">Index history unavailable.</p>
					</div>
				)}
			</div>

			<p className="mt-3 t-micro leading-relaxed text-[var(--pon-fg-4)]">
				Equal-weighted: each constituent is rebased to 100 at the start of the window and the levels
				averaged, so no single high-priced leg dominates.
				{data?.missing.length ? ` Excluded (no history): ${data.missing.join(", ")}.` : ""}
			</p>
		</div>
	);
}
