"use client";

import { Header } from "../layout/Header";
import { ChartSection } from "./ChartSection";
import { PositionsTable } from "./PositionsTable";
import { TradingPairSelector } from "./TradingPairSelector";
import { TradingPanel } from "./TradingPanel";

export function TradingInterface() {
	return (
		<div className="h-screen bg-[var(--trading-bg-primary)] flex flex-col">
			{/* Header */}
			<Header />

			{/* Main Content */}
			<div className="flex-1 flex items-start">
				<div className="flex-1 flex flex-col gap-1">
					<TradingPairSelector />
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
