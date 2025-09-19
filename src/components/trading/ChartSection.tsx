"use client";

import { CandlestickSeries, ColorType, createChart, type IChartApi } from "lightweight-charts";
import { useEffect, useRef } from "react";

const timeframes = [
	{ label: "1Day", value: "1D", active: false },
	{ label: "4 Hours", value: "4H", active: true },
	{ label: "1Hour", value: "1H", active: false },
	{ label: "15 Mins", value: "15m", active: false },
	{ label: "5 Mins", value: "5m", active: false },
	{ label: "1Min", value: "1m", active: false },
];

const priceData = [
	{ time: "2023-01-01", open: 4500, high: 4600, low: 4450, close: 4580 },
	{ time: "2023-01-02", open: 4580, high: 4650, low: 4520, close: 4620 },
	{ time: "2023-01-03", open: 4620, high: 4700, low: 4580, close: 4680 },
	{ time: "2023-01-04", open: 4680, high: 4750, low: 4640, close: 4720 },
	{ time: "2023-01-05", open: 4720, high: 4800, low: 4680, close: 4760 },
];

export function ChartSection() {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);

	useEffect(() => {
		if (!chartContainerRef.current) return;

		const chart = createChart(chartContainerRef.current, {
			width: chartContainerRef.current.clientWidth,
			height: 350,
			layout: {
				background: { type: ColorType.Solid, color: "#0a0b17" },
				textColor: "#8a8d91",
			},
			grid: {
				vertLines: { color: "#1c1e2a" },
				horzLines: { color: "#1c1e2a" },
			},
			rightPriceScale: {
				borderColor: "#1c1e2a",
				textColor: "#8b8d97",
			},
			timeScale: {
				borderColor: "#1c1e2a",
			},
		});

		const candlestickSeries = chart.addSeries(CandlestickSeries, {
			upColor: "#26a69a",
			downColor: "#ef5350",
			borderVisible: false,
			wickUpColor: "#26a69a",
			wickDownColor: "#ef5350",
		});

		candlestickSeries.setData(priceData);
		chartRef.current = chart;

		return () => {
			chart.remove();
		};
	}, []);

	return (
		<div className="bg-[var(--trading-bg-primary)] rounded p-6 flex-1">
			{/* Timeframe Controls */}
			<div className="flex items-center justify-between gap-4 mb-6">
				<div className="flex space-x-8">
					{timeframes.map((tf) => (
						<button
							type="button"
							key={tf.value}
							className={`text-xs ${
								tf.active ? "text-[var(--trading-blue)]" : "text-[var(--trading-text-secondary)]"
							} hover:text-[var(--trading-blue)] transition-colors`}
						>
							{tf.label}
						</button>
					))}
				</div>
			</div>

			{/* Price Info */}
			<div className="flex items-center space-x-6 gap-4 mb-6 text-xs">
				<span className="text-gray-400">O</span>
				<span className="text-[var(--trading-green-alt)]">4519.23</span>
				<span className="text-green-500">H4543.35</span>
				<span className="text-gray-400">L</span>
				<span className="text-[var(--trading-green-alt)]">4519.23</span>
				<span className="text-gray-400">C</span>
				<span className="text-green-500">4543.35</span>
				<span className="text-green-600">+24.12(+0.53%)</span>
			</div>

			{/* Chart Container */}
			<div className="relative">
				<div ref={chartContainerRef} className="w-full" />

				{/* Price Scale */}
				<div className="absolute right-0 top-0 h-full flex flex-col justify-between gap-4 py-10 pr-3">
					<span className="text-gray-400 text-2xl">500</span>
					<span className="text-gray-400 text-2xl">490</span>
					<span className="text-gray-400 text-2xl">480</span>
					<span className="text-gray-400 text-2xl">470</span>
					<span className="text-gray-400 text-2xl">AA0I</span>
				</div>
			</div>
		</div>
	);
}
