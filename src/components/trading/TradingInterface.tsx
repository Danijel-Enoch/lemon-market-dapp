"use client";

import React from "react";
import { TradingHeader } from "../layout/TradingHeader";
import { TradingPairSelector } from "./TradingPairSelector";
import { ChartSection } from "./ChartSection";
import { PositionsTable } from "./PositionsTable";
import { TradingPanel } from "./TradingPanel";

export function TradingInterface() {
	return (
		<div className="h-screen bg-[#0a0b17] flex flex-col">
			{/* Header */}
			<TradingHeader />

			{/* Trading Pair Selector */}
			<TradingPairSelector />

			{/* Main Content */}
			<div className="flex-1 flex gap-4 p-4">
				{/* Left Side - Chart and Positions */}
				<div className="flex-1 flex flex-col gap-4">
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
