"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

export function TradingPairSelector() {
	return (
		<div className="flex items-center justify-between px-6 py-2 bg-[#0a0b17]">
			{/* Trading Pair Section */}
			<div className="flex items-center">
				<div className="bg-[#141623] rounded-md p-4 mr-4">
					<div className="flex items-center bg-[#141623] border border-[#282b3c] rounded px-3 py-2">
						<div className="w-8 h-5 bg-gradient-to-r from-blue-500 to-purple-500 rounded mr-2"></div>
						<span className="text-[#c2c3c6] text-[13px] font-bold mr-48">ETH/USDC.e</span>
						<ChevronDown className="w-3 h-3 text-gray-400" />
					</div>
					<div className="mt-3">
						<span className="text-[#bbbbbe] text-[12px]">Advanced Trade Selection</span>
					</div>
				</div>
			</div>

			{/* Filters Section */}
			<div className="flex items-center bg-[#141623] border border-[#0f101d] rounded-lg p-3 space-x-2">
				<div className="flex items-center bg-[#141623] border border-[#282b3b] rounded px-3 py-2">
					<span className="text-[#bebec1] text-[10px] font-bold mr-8">Chain: All</span>
					<ChevronDown className="w-3 h-3 text-gray-400" />
				</div>
				<div className="flex items-center bg-[#141623] border border-[#282b3b] rounded px-3 py-2">
					<span className="text-[#bfc0c3] text-[10px] mr-4">Money Market: All</span>
					<ChevronDown className="w-3 h-3 text-gray-400" />
				</div>
			</div>
		</div>
	);
}