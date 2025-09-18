"use client";

import { useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const tradingPairs = [
	{ symbol: "ETH/USDC.e", gradient: "from-blue-500 to-purple-500" },
	{ symbol: "BTC/USDC.e", gradient: "from-orange-500 to-yellow-500" },
	{ symbol: "MATIC/USDC.e", gradient: "from-purple-500 to-pink-500" },
	{ symbol: "LINK/USDC.e", gradient: "from-blue-600 to-cyan-500" },
];

export function TradingPairSelector() {
	const [selectedPair, setSelectedPair] = useState("ETH/USDC.e");

	const currentPair = tradingPairs.find((pair) => pair.symbol === selectedPair) || tradingPairs[0];

	return (
		<Select value={selectedPair} onValueChange={setSelectedPair}>
			<SelectTrigger className="flex items-center bg-[#141623] border border-[#282b3c] rounded px-4 py-3 w-48">
				<div className={`w-8 h-5 bg-gradient-to-r ${currentPair.gradient} rounded mr-3`}></div>
				<span className="text-[#c2c3c6] text-[14px] font-bold">
					<SelectValue />
				</span>
			</SelectTrigger>
			<SelectContent className="bg-[#141623] border-[#282b3c]">
				{tradingPairs.map((pair) => (
					<SelectItem
						key={pair.symbol}
						value={pair.symbol}
						className="text-[#c2c3c6] hover:bg-[#282b3c] focus:bg-[#282b3c]"
					>
						<div className="flex items-center gap-4">
							<div className={`w-6 h-4 bg-gradient-to-r ${pair.gradient} rounded mr-3`}></div>
							{pair.symbol}
						</div>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
