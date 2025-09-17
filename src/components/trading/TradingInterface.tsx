"use client";

import { Header } from "../layout/Header";
import { ChartSection } from "./ChartSection";
import { PositionsTable } from "./PositionsTable";
import { TradingPairSelector } from "./TradingPairSelector";
import { TradingPanel } from "./TradingPanel";

export function TradingInterface() {
	return (
		<div className="h-screen bg-[#0a0b17] flex flex-col">
			{/* Header */}
			<Header />

			{/* Trading Pair Selector */}
			<TradingPairSelector />

			{/* Main Content */}
			<div className="flex-1 flex gap-6 p-6">
				{/* Left Side - Chart and Positions */}
				<div className="flex-1 flex flex-col gap-6">
					{/* Chart Section */}
					<ChartSection />

					{/* Positions Table */}
					<PositionsTable />
				</div>

				{/* Right Side - Trading Panel */}
				<TradingPanel />
			</div>
		</div>
	);
}
