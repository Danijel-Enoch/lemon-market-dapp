import { TimeframeGroup } from "@app/components/pons/Segmented";
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
 * Candlestick chart for a market.
 *
 * Data comes from Pacifica via our API, which maps the app's TradingView-style
 * resolution codes onto Pacifica's interval names.
 *
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
				textColor: "#64748b",
				fontFamily: "Space Grotesk, sans-serif",
			},
			grid: {
				vertLines: { color: "rgba(255,255,255,0.04)" },
				horzLines: { color: "rgba(255,255,255,0.04)" },
			},
			rightPriceScale: { borderColor: "#222222" },
			timeScale: { borderColor: "#222222", timeVisible: true },
			crosshair: { mode: 0 },
			height: 360,
			autoSize: true,
		});

		const series = chart.addSeries(CandlestickSeries, {
			// Pons colours a candle by direction using the same up/down pair the
			// rest of the app reads — the lime accent stays reserved for actions.
			upColor: "#10b981",
			downColor: "#ef4444",
			wickUpColor: "#10b981",
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
		<div
			className={cn(
				"rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4",
				className,
			)}
		>
			<div className="mb-3 flex items-center justify-between gap-3">
				<span className="font-display text-[15px] font-bold text-[var(--pon-fg)]">{symbol}</span>
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
					<div className="absolute inset-0 flex items-center justify-center">
						<Skeleton className="h-full w-full" />
					</div>
				)}
				{!isLoading && (error || data?.candles.length === 0) && (
					<div className="absolute inset-0 flex items-center justify-center">
						<p className="text-[13px] text-[var(--pon-fg-3)]">
							{error ? "Price history unavailable." : "No price history for this range."}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
