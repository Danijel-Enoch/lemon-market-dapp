import { TimeframeGroup } from "@app/components/pons/Segmented";
import { Skeleton } from "@app/components/ui/skeleton";
import { basisApi } from "@app/lib/api";
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
 * Candlestick chart for a basis market's perp leg.
 *
 * Deliberately the perp mark and not the spread. There is no historical price
 * series for a tokenized equity on Base, so a basis chart would have to be
 * reconstructed from our own snapshots — a line that would look authoritative
 * and be mostly invented. The live spread is shown as a number beside the
 * chart instead, where its provenance is legible.
 *
 * Equity series have real gaps — the underlying market closes overnight and at
 * weekends even though both legs here keep trading — so the time scale is left
 * to lightweight-charts' default handling rather than forced to a continuous
 * axis, which would misrepresent a weekend as a flat price.
 */
export function PriceChart({
	marketId,
	symbol,
	className,
}: {
	/** Basis market id, e.g. "NVDA". */
	marketId: string;
	/** Display symbol for the perp leg, shown as the series label. */
	symbol: string;
	className?: string;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
	const [resolution, setResolution] = useState<Resolution>("60");

	const { data, isLoading, error } = useQuery({
		queryKey: ["basis-candles", marketId, resolution],
		queryFn: () => basisApi.candles(marketId, resolution),
		enabled: Boolean(marketId),
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
				<div className="min-w-0">
					<span className="font-display text-[15px] font-bold text-[var(--pon-fg)]">{symbol}</span>
					{/* Naming the series is not decoration: a chart on a basis market
					    page is naturally read as the basis unless it says otherwise. */}
					<span className="ml-2 t-micro text-[var(--pon-fg-3)]">perp mark</span>
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
