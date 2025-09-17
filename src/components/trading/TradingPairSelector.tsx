"use client";

import React, { useState } from "react";
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

const chains = ["All", "Ethereum", "Polygon", "Arbitrum", "Optimism"];
const moneyMarkets = ["All", "Aave V3", "Compound III", "SparkSky", "Silo"];

export function TradingPairSelector() {
	const [selectedPair, setSelectedPair] = useState("ETH/USDC.e");
	const [selectedChain, setSelectedChain] = useState("All");
	const [selectedMoneyMarket, setSelectedMoneyMarket] = useState("All");

	const currentPair = tradingPairs.find(pair => pair.symbol === selectedPair) || tradingPairs[0];

	return (
		<div className="flex items-center justify-between gap-4 px-8 py-4 bg-[#0a0b17]">
			{/* Trading Pair Section */}
			<div className="flex items-center gap-4">
				<div className="bg-[#141623] rounded-md p-5 mr-6">
					<Select value={selectedPair} onValueChange={setSelectedPair}>
						<SelectTrigger className="flex items-center bg-[#141623] border border-[#282b3c] rounded px-4 py-3 w-auto">
							<div className={`w-8 h-5 bg-gradient-to-r ${currentPair.gradient} rounded mr-3`}></div>
							<span className="text-[#c2c3c6] text-[14px] font-bold mr-52">
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
					<div className="mt-4">
						<span className="text-[#bbbbbe] text-[13px]">
							Advanced Trade Selection
						</span>
					</div>
				</div>
			</div>

			{/* Filters Section */}
			<div className="flex items-center bg-[#141623] border border-[#0f101d] rounded-lg p-4 space-x-3">
				<Select value={selectedChain} onValueChange={setSelectedChain}>
					<SelectTrigger className="flex items-center bg-[#141623] border border-[#282b3b] rounded px-4 py-3 w-auto">
						<span className="text-[#bebec1] text-[11px] font-bold mr-10">
							Chain: <SelectValue />
						</span>
					</SelectTrigger>
					<SelectContent className="bg-[#141623] border-[#282b3b]">
						{chains.map((chain) => (
							<SelectItem
								key={chain}
								value={chain}
								className="text-[#bebec1] hover:bg-[#282b3b] focus:bg-[#282b3b]"
							>
								{chain}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={selectedMoneyMarket} onValueChange={setSelectedMoneyMarket}>
					<SelectTrigger className="flex items-center bg-[#141623] border border-[#282b3b] rounded px-4 py-3 w-auto">
						<span className="text-[#bfc0c3] text-[11px] mr-6">
							Money Market: <SelectValue />
						</span>
					</SelectTrigger>
					<SelectContent className="bg-[#141623] border-[#282b3b]">
						{moneyMarkets.map((market) => (
							<SelectItem
								key={market}
								value={market}
								className="text-[#bfc0c3] hover:bg-[#282b3b] focus:bg-[#282b3b]"
							>
								{market}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
