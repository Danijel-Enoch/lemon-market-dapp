"use client";

import {
	BarChart3,
	Filter,
	History,
	Search,
	Settings,
	TrendingUp,
} from "lucide-react";
import React, { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAppContext } from "@/contexts/AppContext";

export function Sidebar() {
	const { state, dispatch } = useAppContext();
	const chainId = useId();
	const moneyMarketId = useId();
	const minROEId = useId();
	const includeRewardsId = useId();

	const handleSearchChange = (value: string) => {
		dispatch({
			type: "UPDATE_FILTERS",
			payload: { searchTerm: value },
		});
	};

	const handleChainChange = (value: string) => {
		dispatch({ type: "SET_SELECTED_CHAIN", payload: value });
	};

	const handleMoneyMarketChange = (value: string) => {
		dispatch({ type: "SET_SELECTED_MONEY_MARKET", payload: value });
	};

	const sidebarItems = [
		{ icon: TrendingUp, label: "Trade", active: true },
		{ icon: BarChart3, label: "Positions", count: state.positions.length },
		{ icon: History, label: "History", count: state.transactions.length },
		{ icon: Settings, label: "Settings" },
	];

	return (
		<aside className="w-72 bg-gray-950 border-r border-gray-800/50 flex flex-col">
			{/* Navigation */}
			<div className="p-3 border-b border-gray-800/50">
				<div className="space-y-1">
					{sidebarItems.map((item) => (
						<Button
							key={item.label}
							variant={item.active ? "secondary" : "ghost"}
							className={`w-full justify-start h-8 px-3 text-sm ${
								item.active
									? "bg-gray-800 text-white hover:bg-gray-700"
									: "text-gray-400 hover:text-white hover:bg-gray-800"
							}`}
						>
							<item.icon className="h-4 w-4 mr-2" />
							<span className="flex-1 text-left">{item.label}</span>
							{item.count !== undefined && (
								<Badge
									variant="secondary"
									className="ml-auto bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5"
								>
									{item.count}
								</Badge>
							)}
						</Button>
					))}
				</div>
			</div>

			{/* Search and Filters */}
			<div className="p-3 space-y-3 border-b border-gray-800/50">
				{/* Search */}
				<div className="relative">
					<Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-500" />
					<Input
						placeholder="Search pairs..."
						value={state.filters.searchTerm}
						onChange={(e) => handleSearchChange(e.target.value)}
						className="pl-8 bg-gray-900 border-gray-700 text-white placeholder-gray-500 h-8 text-sm"
					/>
				</div>

				{/* Chain Filter */}
				<div className="space-y-1.5">
					<label
						htmlFor={chainId}
						className="text-xs font-medium text-gray-400"
					>
						Chain
					</label>
					<Select value={state.selectedChain} onValueChange={handleChainChange}>
						<SelectTrigger
							id={chainId}
							className="bg-gray-900 border-gray-700 text-white h-8 text-sm"
						>
							<SelectValue placeholder="All chains" />
						</SelectTrigger>
						<SelectContent className="bg-gray-900 border-gray-700">
							<SelectItem
								value="ethereum"
								className="text-white hover:bg-gray-800"
							>
								Ethereum
							</SelectItem>
							<SelectItem
								value="arbitrum"
								className="text-white hover:bg-gray-800"
							>
								Arbitrum
							</SelectItem>
							<SelectItem
								value="polygon"
								className="text-white hover:bg-gray-800"
							>
								Polygon
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Money Market Filter */}
				<div className="space-y-1.5">
					<label
						htmlFor={moneyMarketId}
						className="text-xs font-medium text-gray-400"
					>
						Money Market
					</label>
					<Select
						value={state.selectedMoneyMarket}
						onValueChange={handleMoneyMarketChange}
					>
						<SelectTrigger
							id={moneyMarketId}
							className="bg-gray-900 border-gray-700 text-white h-8 text-sm"
						>
							<SelectValue placeholder="All markets" />
						</SelectTrigger>
						<SelectContent className="bg-gray-900 border-gray-700">
							<SelectItem value="aave" className="text-white hover:bg-gray-800">
								Aave
							</SelectItem>
							<SelectItem
								value="compound"
								className="text-white hover:bg-gray-800"
							>
								Compound
							</SelectItem>
							<SelectItem
								value="morpho"
								className="text-white hover:bg-gray-800"
							>
								Morpho
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Min ROE Filter */}
				<div className="space-y-1.5">
					<label
						htmlFor={minROEId}
						className="text-xs font-medium text-gray-400"
					>
						Min ROE %
					</label>
					<Input
						id={minROEId}
						type="number"
						placeholder="0"
						value={state.filters.minROE || ""}
						onChange={(e) =>
							dispatch({
								type: "UPDATE_FILTERS",
								payload: {
									minROE: e.target.value
										? parseFloat(e.target.value)
										: undefined,
								},
							})
						}
						className="bg-gray-900 border-gray-700 text-white placeholder-gray-500 h-8 text-sm"
					/>
				</div>

				{/* Include Rewards */}
				<div className="flex items-center space-x-2">
					<input
						id={includeRewardsId}
						type="checkbox"
						checked={state.filters.includeRewards}
						onChange={(e) =>
							dispatch({
								type: "UPDATE_FILTERS",
								payload: { includeRewards: e.target.checked },
							})
						}
						className="w-3.5 h-3.5 text-blue-600 bg-gray-900 border-gray-700 rounded focus:ring-blue-500"
					/>
					<label htmlFor={includeRewardsId} className="text-xs text-gray-400">
						Include rewards
					</label>
				</div>

				{/* Clear Filters */}
				<Button
					variant="ghost"
					size="sm"
					onClick={() =>
						dispatch({
							type: "UPDATE_FILTERS",
							payload: {
								searchTerm: "",
								minROE: undefined,
								includeRewards: false,
							},
						})
					}
					className="w-full text-gray-400 hover:text-white hover:bg-gray-800 h-7 text-xs"
				>
					<Filter className="h-3 w-3 mr-1.5" />
					Clear Filters
				</Button>
			</div>

			{/* Quick Stats */}
			<div className="p-4 border-b border-gray-800">
				<h3 className="text-sm font-semibold text-gray-300 mb-3">
					Quick Stats
				</h3>
				<div className="space-y-2 text-sm">
					<div className="flex justify-between">
						<span className="text-gray-400">Available Pairs</span>
						<span className="text-white">247</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-400">Active Positions</span>
						<span className="text-white">{state.positions.length}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-400">Total PnL</span>
						<span className="text-green-400">+$127.45</span>
					</div>
				</div>
			</div>

			{/* Footer */}
			<div className="mt-auto p-4 text-xs text-gray-500">
				<div className="flex items-center space-x-2 mb-2">
					<Filter className="h-3 w-3" />
					<span>Advanced filters active</span>
				</div>
				<p>Showing filtered results based on your criteria</p>
			</div>
		</aside>
	);
}
