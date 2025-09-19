"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const tradingPairs = [
	{ symbol: "ETH/USDC.e", gradient: "from-blue-500 to-purple-500" },
	{ symbol: "BTC/USDC.e", gradient: "from-orange-500 to-yellow-500" },
	{ symbol: "MATIC/USDC.e", gradient: "from-purple-500 to-pink-500" },
	{ symbol: "LINK/USDC.e", gradient: "from-blue-600 to-cyan-500" },
];

export function TradingPairSelector() {
	const [selectedPair, setSelectedPair] = useState("ETH/USDC.e");

	return (
		<Select value={selectedPair} onValueChange={setSelectedPair}>
			<SelectTrigger className="flex items-center bg-[var(--trading-bg-secondary)] border border-[var(--trading-border)] rounded px-4 py-3 w-48">
				<div className="flex items-center space-x-2">
					<span className="text-[var(--trading-text-primary)] text-sm font-bold">ETH/USD</span>
				</div>
			</SelectTrigger>
			<SelectContent className="bg-[var(--trading-bg-secondary)] border-[var(--trading-border)]">
				{tradingPairs.map((pair) => (
					<SelectItem
						key={pair.symbol}
						value={pair.symbol}
						className="text-[var(--trading-text-primary)] hover:bg-[var(--trading-border)] focus:bg-[var(--trading-border)]"
					>
						{pair.symbol}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
