"use client";

import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAppContext } from "@/contexts/AppContext";
import { mockTradingPairs } from "@/lib/mock-data";

export function TradingPairsList() {
	const { state, dispatch } = useAppContext();

	const filteredPairs = mockTradingPairs.filter((pair) => {
		const matchesSearch =
			!state.filters.searchTerm ||
			pair.baseAsset.toLowerCase().includes(state.filters.searchTerm.toLowerCase()) ||
			pair.quoteAsset.toLowerCase().includes(state.filters.searchTerm.toLowerCase());

		const matchesChain =
			!state.selectedChain ||
			state.selectedChain === "ethereum" ||
			pair.chain === state.selectedChain;

		const matchesMoneyMarket =
			!state.selectedMoneyMarket || pair.moneyMarket === state.selectedMoneyMarket;

		const matchesROE = !state.filters.minROE || pair.roe >= state.filters.minROE;

		return matchesSearch && matchesChain && matchesMoneyMarket && matchesROE;
	});

	const handlePairSelect = (pair: (typeof mockTradingPairs)[0]) => {
		dispatch({ type: "SET_SELECTED_PAIR", payload: pair });
	};

	const formatROE = (roe: number) => {
		return roe > 0 ? `+${roe.toFixed(2)}%` : `${roe.toFixed(2)}%`;
	};

	const getROEColor = (roe: number) => {
		if (roe > 10) return "text-green-400";
		if (roe > 0) return "text-green-300";
		if (roe > -5) return "text-yellow-400";
		return "text-red-400";
	};

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-4 mb-3">
				<h2 className="text-sm font-medium text-white">Trading Pairs</h2>
				<Badge variant="secondary" className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5">
					{filteredPairs.length} pairs
				</Badge>
			</div>

			{filteredPairs.length === 0 ? (
				<div className="text-center py-8 text-gray-500 text-sm">
					No trading pairs match your filters
				</div>
			) : (
				<div className="space-y-1">
					{filteredPairs.map((pair) => (
						<Card
							key={`${pair.baseAsset}-${pair.quoteAsset}`}
							className={`p-3 cursor-pointer transition-all duration-200 border ${
								state.selectedPair?.baseAsset === pair.baseAsset &&
								state.selectedPair?.quoteAsset === pair.quoteAsset
									? "bg-gray-800 border-gray-600"
									: "bg-gray-900 border-gray-800 hover:bg-gray-850 hover:border-gray-700"
							}`}
							onClick={() => handlePairSelect(pair)}
						>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center space-x-2">
									<div className="text-sm font-medium text-white">
										{pair.baseAsset}/{pair.quoteAsset}
									</div>
									<Badge
										variant="outline"
										className="text-xs px-1.5 py-0.5 border-gray-600 text-gray-400"
									>
										{pair.chain}
									</Badge>
									<Badge
										variant="outline"
										className="text-xs px-1.5 py-0.5 border-gray-600 text-gray-400"
									>
										{pair.moneyMarket}
									</Badge>
								</div>
								<div className="flex items-center space-x-3 gap-4">
									<div className="text-right">
										<div className="text-xs text-gray-500">ROE</div>
										<div className={`text-sm font-medium ${getROEColor(pair.roe)}`}>
											{formatROE(pair.roe)}
										</div>
									</div>
									<div className="text-right">
										<div className="text-xs text-gray-500">Max Lev</div>
										<div className="text-sm font-medium text-white">{pair.maxLeverage}x</div>
									</div>
									<div className="text-right">
										<div className="text-xs text-gray-500">APY</div>
										<div className="text-sm font-medium text-white">{pair.apy.toFixed(2)}%</div>
									</div>
									{pair.roe > 15 && <Zap className="h-3.5 w-3.5 text-yellow-400" />}
								</div>
							</div>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
