"use client";

import { ChevronDown } from "lucide-react";
import React from "react";

export function TradingPairSelector() {
	return (
		<div className="flex items-center justify-between px-8 py-4 bg-[#0a0b17]">
			{/* Trading Pair Section */}
			<div className="flex items-center">
				<div className="bg-[#141623] rounded-md p-5 mr-6">
					<div className="flex items-center bg-[#141623] border border-[#282b3c] rounded px-4 py-3">
						<div className="w-8 h-5 bg-gradient-to-r from-blue-500 to-purple-500 rounded mr-3"></div>
						<span className="text-[#c2c3c6] text-[14px] font-bold mr-52">
							ETH/USDC.e
						</span>
						<ChevronDown className="w-4 h-4 text-gray-400" />
					</div>
					<div className="mt-4">
						<span className="text-[#bbbbbe] text-[13px]">
							Advanced Trade Selection
						</span>
					</div>
				</div>
			</div>

			{/* Filters Section */}
			<div className="flex items-center bg-[#141623] border border-[#0f101d] rounded-lg p-4 space-x-3">
				<div className="flex items-center bg-[#141623] border border-[#282b3b] rounded px-4 py-3">
					<span className="text-[#bebec1] text-[11px] font-bold mr-10">
						Chain: All
					</span>
					<ChevronDown className="w-4 h-4 text-gray-400" />
				</div>
				<div className="flex items-center bg-[#141623] border border-[#282b3b] rounded px-4 py-3">
					<span className="text-[#bfc0c3] text-[11px] mr-6">
						Money Market: All
					</span>
					<ChevronDown className="w-4 h-4 text-gray-400" />
				</div>
			</div>
		</div>
	);
}
