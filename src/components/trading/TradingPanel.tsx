"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TradingForm } from "./TradingForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const leverageOptions = ["1x", "2x", "3x", "4x", "Max"];

const chainMarkets = [
	{
		chain: "OP Mainnet",
		market: "Aave V3",
		roe: "-4.46%",
		icon: "https://via.placeholder.com/24x24/FF0420/FFFFFF?text=OP",
	},
	{
		chain: "Gnosis",
		market: "Aave V3",
		roe: "-3.59%",
		icon: "https://via.placeholder.com/24x24/00A651/FFFFFF?text=GNO",
	},
	{
		chain: "Gnosis",
		market: "SparkSky",
		roe: "-6.8%",
		icon: "https://via.placeholder.com/24x24/00A651/FFFFFF?text=GNO",
	},
	{
		chain: "Polygon",
		market: "Aave V3",
		roe: "-8.12%",
		icon: "https://via.placeholder.com/24x24/8247E5/FFFFFF?text=POL",
	},
	{
		chain: "Polygon",
		market: "Compound III",
		roe: "-4.07%",
		icon: "https://via.placeholder.com/24x24/8247E5/FFFFFF?text=POL",
	},
	{
		chain: "Arbitrum",
		market: "Aave V3",
		roe: "-3.69%",
		icon: "https://via.placeholder.com/24x24/2D374B/FFFFFF?text=ARB",
	},
	{
		chain: "Arbitrum",
		market: "Compound III",
		roe: "-4.21%",
		icon: "https://via.placeholder.com/24x24/2D374B/FFFFFF?text=ARB",
	},
	{
		chain: "Arbitrum",
		market: "Silo",
		roe: "-7.16%",
		icon: "https://via.placeholder.com/24x24/2D374B/FFFFFF?text=ARB",
	},
];

const tokens = [
	{
		symbol: "USDC.e",
		name: "USD Coin",
		balance: "1,234.56",
		icon: "https://via.placeholder.com/24x24/2775CA/FFFFFF?text=USDC",
	},
	{
		symbol: "USDC",
		name: "USD Coin",
		balance: "2,456.78",
		icon: "https://via.placeholder.com/24x24/2775CA/FFFFFF?text=USDC",
	},
	{
		symbol: "DAI",
		name: "Dai Stablecoin",
		balance: "3,789.12",
		icon: "https://via.placeholder.com/24x24/F5AC37/FFFFFF?text=DAI",
	},
	{
		symbol: "USDT",
		name: "Tether USD",
		balance: "5,432.10",
		icon: "https://via.placeholder.com/24x24/26A17B/FFFFFF?text=USDT",
	},
	{
		symbol: "ETH",
		name: "Ethereum",
		balance: "12.34",
		icon: "https://via.placeholder.com/24x24/627EEA/FFFFFF?text=ETH",
	},
	{
		symbol: "WETH",
		name: "Wrapped Ethereum",
		balance: "8.76",
		icon: "https://via.placeholder.com/24x24/627EEA/FFFFFF?text=WETH",
	},
];

const chains = ["All", "Ethereum", "Polygon", "Arbitrum", "Optimism"];
const moneyMarkets = ["All", "Aave V3", "Compound III", "SparkSky", "Silo"];

export function TradingPanel() {
	const [activeTab, setActiveTab] = useState("buy");
	const [selectedChain, setSelectedChain] = useState("All");
	const [selectedMoneyMarket, setSelectedMoneyMarket] = useState("All");

	return (
		<div className="w-96 bg-[var(--trading-bg-secondary)] h-full rounded p-2">
			<div className="flex items-center bg-[var(--trading-bg-primary)] border border-gray-800 rounded p-2 space-x-3 mb-2">
				<Select value={selectedChain} onValueChange={setSelectedChain}>
					<SelectTrigger className="flex items-center bg-[var(--trading-bg-secondary)] border border-[var(--trading-border)] rounded px-4 w-full">
						<span className="text-[var(--trading-text-primary)] text-xs font-bold">
							Chain: <SelectValue />
						</span>
					</SelectTrigger>
					<SelectContent className="bg-[var(--trading-bg-secondary)] border-[var(--trading-border)]">
						{chains.map((chain) => (
							<SelectItem
								key={chain}
								value={chain}
								className="text-[var(--trading-text-primary)] hover:bg-[var(--trading-border)] focus:bg-[var(--trading-border)]"
							>
								{chain}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={selectedMoneyMarket} onValueChange={setSelectedMoneyMarket}>
					<SelectTrigger className="flex items-center bg-[var(--trading-bg-secondary)] border border-[var(--trading-border)] rounded px-4 w-full">
						<span className="text-[var(--trading-text-primary)] text-xs">
							Money Market: <SelectValue />
						</span>
					</SelectTrigger>
					<SelectContent className="bg-[var(--trading-bg-secondary)] border-[var(--trading-border)]">
						{moneyMarkets.map((market) => (
							<SelectItem
								key={market}
								value={market}
								className="text-[var(--trading-text-primary)] hover:bg-[var(--trading-border)] focus:bg-[var(--trading-border)]"
							>
								{market}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<Tabs
				defaultValue="buy"
				value={activeTab}
				onValueChange={setActiveTab}
				className="w-full bg-[var(--trading-bg-primary)] p-2 h-full"
			>
				{/* Buy/Sell Tabs */}
				<TabsList className="grid w-full grid-cols-2 gap-4 bg-transparent p-0 h-auto">
					<TabsTrigger
						value="buy"
						className="bg-[var(--trading-blue)] text-white text-sm font-bold rounded-l-md data-[state=active]:bg-[var(--trading-blue)] data-[state=inactive]:bg-[var(--trading-bg-tertiary)] data-[state=inactive]:text-[var(--trading-text-secondary)] py-3"
					>
						Buy / Long
					</TabsTrigger>
					<TabsTrigger
						value="sell"
						className="bg-[var(--trading-bg-tertiary)] text-[var(--trading-text-secondary)] text-sm font-bold rounded-r-md data-[state=active]:bg-[var(--trading-red)] data-[state=active]:text-white data-[state=inactive]:bg-[var(--trading-bg-tertiary)] py-3"
					>
						Sell / Short
					</TabsTrigger>
				</TabsList>

				<TabsContent value="buy" className="">
					<TradingForm
						mode="buy"
						leverageOptions={leverageOptions}
						tokens={tokens}
						chainMarkets={chainMarkets}
					/>
				</TabsContent>

				<TabsContent value="sell" className="">
					<TradingForm
						mode="sell"
						leverageOptions={leverageOptions}
						tokens={tokens}
						chainMarkets={chainMarkets}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
