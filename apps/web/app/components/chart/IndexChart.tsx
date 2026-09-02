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
				textColor: "#94a3b8",
				fontFamily: "Roboto Mono, monospace",
			},
			grid: {
				vertLines: { color: "rgba(255,255,255,0.04)" },
				horzLines: { color: "rgba(255,255,255,0.04)" },
			},
			rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
			timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true },
			height: 360,
			autoSize: true,
		});

		const series = chart.addSeries(AreaSeries, {
			lineColor: "#a3e635",
			topColor: "rgba(163,230,53,0.25)",
			bottomColor: "rgba(163,230,53,0.02)",
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
		<div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
			<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-baseline gap-2">
					<span className="text-sm font-medium text-gray-300">{name} index</span>
					{data && (
						<span
							className={cn(
								"font-mono text-sm",
								data.changePercent >= 0 ? "text-lime-400" : "text-red-400",
							)}
						>
							{formatPercent(data.changePercent)}
						</span>
					)}
				</div>
				<div className="flex gap-1">
					{RESOLUTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => setResolution(option.value)}
							className={cn(
								"rounded px-2 py-1 text-xs transition-colors",
								option.value === resolution
									? "bg-lime-500/15 text-lime-400"
									: "text-gray-500 hover:text-gray-300",
							)}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>

			<div className="relative">
				<div ref={containerRef} className="h-[360px] w-full" />
				{isLoading && (
					<div className="absolute inset-0">
						<Skeleton className="h-full w-full rounded-lg" />
					</div>
				)}
				{!isLoading && (error || data?.points.length === 0) && (
					<div className="absolute inset-0 flex items-center justify-center">
						<p className="text-sm text-gray-500">Index history unavailable.</p>
					</div>
				)}
			</div>

			<p className="mt-2 text-[11px] text-gray-600">
				Equal-weighted: each constituent is rebased to 100 at the start of the window and the levels
				averaged, so no single high-priced leg dominates.
				{data?.missing.length ? ` Excluded (no history): ${data.missing.join(", ")}.` : ""}
			</p>
		</div>
	);
}
