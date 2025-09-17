"use client";

import React from "react";
import { TradingPairsList } from "./TradingPairsList";

export function TradingInterface() {
	return (
		<div className="h-full flex flex-col">
			<div className="p-6 border-b border-gray-800">
				<h1 className="text-2xl font-bold text-white mb-2">Advanced Trading</h1>
				<p className="text-gray-400">Select a trading pair to get started</p>
			</div>

			<div className="flex-1 p-6">
				<TradingPairsList />
			</div>
		</div>
	);
}
