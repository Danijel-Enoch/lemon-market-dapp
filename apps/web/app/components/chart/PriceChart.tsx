import { Skeleton } from "@app/components/ui/skeleton";
import { marketsApi } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
	type CandlestickData,
	CandlestickSeries,
	ColorType,
	createChart,
	type IChartApi,
	type ISeriesApi,
	type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

const RESOLUTIONS = [
	{ value: "15", label: "15m" },
	{ value: "60", label: "1H" },
	{ value: "240", label: "4H" },
	{ value: "D", label: "1D" },
] as const;

type Resolution = (typeof RESOLUTIONS)[number]["value"];

/**
 * Candlestick chart for a market.
 *
 * Data comes from the Avantis feed shim via our API, which resolves the pair's
 * Pyth symbol server-side. Equity and FX series have real gaps — markets close
 * overnight and at weekends — so the time scale is left to lightweight-charts'
 * default handling rather than forced to a continuous axis, which would
 * misrepresent a weekend as a flat price.
 */
export function PriceChart({ symbol, className }: { symbol: string; className?: string }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
	const [resolution, setResolution] = useState<Resolution>("60");

	const { data, isLoading, error } = useQuery({
		queryKey: ["candles", symbol, resolution],
		queryFn: () => marketsApi.candles(symbol, resolution),
		enabled: Boolean(symbol),
		refetchInterval: 60_000,
	});

	// Create the chart once; recreating it on every data change would drop the
	// user's pan/zoom position.
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
			crosshair: { mode: 0 },
			height: 360,
			autoSize: true,
		});

		const series = chart.addSeries(CandlestickSeries, {
			upColor: "#a3e635",
			downColor: "#ef4444",
			wickUpColor: "#a3e635",
			wickDownColor: "#ef4444",
			borderVisible: false,
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
		if (!series || !data?.candles) return;

		const bars: CandlestickData[] = data.candles.map((candle) => ({
			// The feed returns milliseconds; lightweight-charts wants seconds.
			time: Math.floor(candle.time / 1000) as UTCTimestamp,
			open: candle.open,
			high: candle.high,
			low: candle.low,
			close: candle.close,
		}));

		series.setData(bars);
		chartRef.current?.timeScale().fitContent();
	}, [data]);

	return (
		<div className={cn("rounded-xl border border-white/10 bg-white/[0.02] p-3", className)}>
			<div className="mb-2 flex items-center justify-between">
				<span className="text-sm font-medium text-gray-300">{symbol}</span>
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
					<div className="absolute inset-0 flex items-center justify-center">
						<Skeleton className="h-full w-full rounded-lg" />
					</div>
				)}
				{!isLoading && (error || data?.candles.length === 0) && (
					<div className="absolute inset-0 flex items-center justify-center">
						<p className="text-sm text-gray-500">
							{error ? "Price history unavailable." : "No price history for this range."}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
