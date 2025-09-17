"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown } from "lucide-react";

const leverageOptions = ["1x", "2x", "3x", "4x", "Max"];

const chainMarkets = [
	{ chain: "OP Mainnet", market: "Aave V3", roe: "-4.46%", icon: "🔴" },
	{ chain: "Gnosis", market: "Aave V3", roe: "-3.59%", icon: "🟢" },
	{ chain: "Gnosis", market: "SparkSky", roe: "-6.8%", icon: "🟢" },
	{ chain: "Polygon", market: "Aave V3", roe: "-8.12%", icon: "🟣" },
	{ chain: "Polygon", market: "Compound III", roe: "-4.07%", icon: "🟣" },
	{ chain: "Arbitrum", market: "Aave V3", roe: "-3.69%", icon: "🔵" },
	{ chain: "Arbitrum", market: "Compound III", roe: "-4.21%", icon: "🔵" },
	{ chain: "Arbitrum", market: "Silo", roe: "-7.16%", icon: "🔵" },
];

const tokens = [
	{ symbol: "USDC.e", name: "USD Coin", balance: "1,234.56", icon: "💵" },
	{ symbol: "USDC", name: "USD Coin", balance: "2,456.78", icon: "💵" },
	{ symbol: "DAI", name: "Dai Stablecoin", balance: "3,789.12", icon: "🟡" },
	{ symbol: "USDT", name: "Tether USD", balance: "5,432.10", icon: "🟢" },
	{ symbol: "ETH", name: "Ethereum", balance: "12.34", icon: "⚡" },
	{ symbol: "WETH", name: "Wrapped Ethereum", balance: "8.76", icon: "🔷" },
];

export function TradingPanel() {
	const [selectedLeverage, setSelectedLeverage] = useState("2x");
	const [inputAmount, setInputAmount] = useState("0.00");
	const [outputAmount, setOutputAmount] = useState("0.00");
	const [inputToken, setInputToken] = useState("USDC.e");
	const [outputToken, setOutputToken] = useState("ETH");
	const [activeTab, setActiveTab] = useState("buy");

	const handleSwapTokens = () => {
		const tempToken = inputToken;
		setInputToken(outputToken);
		setOutputToken(tempToken);
		const tempAmount = inputAmount;
		setInputAmount(outputAmount);
		setOutputAmount(tempAmount);
	};

	return (
		<div className="w-[380px] bg-[#0a0b17] rounded-lg p-6">
			<Tabs defaultValue="buy" value={activeTab} onValueChange={setActiveTab} className="w-full">
				{/* Buy/Sell Tabs */}
				<TabsList className="grid w-full grid-cols-2 gap-4 bg-transparent p-0 h-auto mb-8">
					<TabsTrigger
						value="buy"
						className="bg-[#4c82f7] text-white text-[14px] font-bold rounded-l-md data-[state=active]:bg-[#4c82f7] data-[state=inactive]:bg-[#2a2d3a] data-[state=inactive]:text-[#8a8d91] py-3"
					>
						Buy / Long
					</TabsTrigger>
					<TabsTrigger
						value="sell"
						className="bg-[#2a2d3a] text-[#8a8d91] text-[14px] font-bold rounded-r-md data-[state=active]:bg-[#ef5350] data-[state=active]:text-white data-[state=inactive]:bg-[#2a2d3a] py-3"
					>
						Sell / Short
					</TabsTrigger>
				</TabsList>

				<TabsContent value="buy" className="space-y-4">
					{/* Token Input Section */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-2">
							<span className="text-[#8a8d91] text-[11px]">You pay</span>
							<span className="text-[#8a8d91] text-[11px]">
								Balance: {tokens.find(t => t.symbol === inputToken)?.balance || "0.00"}
							</span>
						</div>
						<div className="flex items-center gap-3">
							<Input
								value={inputAmount}
								onChange={(e) => setInputAmount(e.target.value)}
								className="bg-transparent border-none text-[#bbbbbe] text-left flex-1 p-0 text-[18px] font-medium"
								placeholder="0.00"
							/>
							<Select value={inputToken} onValueChange={setInputToken}>
								<SelectTrigger className="w-auto bg-[#2a2d3a] border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded-lg">
									<div className="flex items-center gap-2">
										<span className="text-[14px]">{tokens.find(t => t.symbol === inputToken)?.icon}</span>
										<SelectValue />
									</div>
								</SelectTrigger>
								<SelectContent className="bg-[#141623] border-[#2a2d3a]">
									{tokens.map((token) => (
										<SelectItem
											key={token.symbol}
											value={token.symbol}
											className="text-[#bbbbbe] hover:bg-[#2a2d3a] focus:bg-[#2a2d3a]"
										>
											<div className="flex items-center gap-2">
												<span>{token.icon}</span>
												<div>
													<div className="text-[13px] font-medium">{token.symbol}</div>
													<div className="text-[10px] text-[#8a8d91]">{token.name}</div>
												</div>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								size="sm"
								onClick={() => setInputAmount(tokens.find(t => t.symbol === inputToken)?.balance || "0.00")}
								className="bg-[#2a2d3a] text-[#8a8d91] text-[10px] h-6 px-2 hover:bg-[#3a3d4a]"
							>
								Max
							</Button>
						</div>
					</div>

					{/* Swap Button */}
					<div className="flex justify-center">
						<Button
							onClick={handleSwapTokens}
							size="sm"
							className="bg-[#2a2d3a] hover:bg-[#3a3d4a] p-2 rounded-full"
						>
							<ArrowUpDown className="w-4 h-4 text-[#8a8d91]" />
						</Button>
					</div>

					{/* Token Output Section */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-2">
							<span className="text-[#8a8d91] text-[11px]">You receive</span>
							<span className="text-[#8a8d91] text-[11px]">
								Balance: {tokens.find(t => t.symbol === outputToken)?.balance || "0.00"}
							</span>
						</div>
						<div className="flex items-center gap-3">
							<Input
								value={outputAmount}
								onChange={(e) => setOutputAmount(e.target.value)}
								className="bg-transparent border-none text-[#bbbbbe] text-left flex-1 p-0 text-[18px] font-medium"
								placeholder="0.00"
							/>
							<Select value={outputToken} onValueChange={setOutputToken}>
								<SelectTrigger className="w-auto bg-[#2a2d3a] border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded-lg">
									<div className="flex items-center gap-2">
										<span className="text-[14px]">{tokens.find(t => t.symbol === outputToken)?.icon}</span>
										<SelectValue />
									</div>
								</SelectTrigger>
								<SelectContent className="bg-[#141623] border-[#2a2d3a]">
									{tokens.map((token) => (
										<SelectItem
											key={token.symbol}
											value={token.symbol}
											className="text-[#bbbbbe] hover:bg-[#2a2d3a] focus:bg-[#2a2d3a]"
										>
											<div className="flex items-center gap-2">
												<span>{token.icon}</span>
												<div>
													<div className="text-[13px] font-medium">{token.symbol}</div>
													<div className="text-[10px] text-[#8a8d91]">{token.name}</div>
												</div>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Action Button */}
					<Button className="w-full bg-[#4c82f7] text-white text-[14px] font-medium hover:bg-[#3a6bd6] py-3">
						{activeTab === "buy" ? "Buy / Long" : "Sell / Short"} {outputToken}
					</Button>

					{/* Leverage Section */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-4">
							<span className="text-[#bbbbbe] text-[12px] font-medium">
								Leverage
							</span>
							<span className="text-[#8a8d91] text-[10px]">
								{selectedLeverage}
							</span>
						</div>

						{/* Leverage Slider */}
						<div className="space-y-2">
							<input
								type="range"
								min="1"
								max="10"
								step="1"
								value={parseInt(selectedLeverage.replace('x', ''))}
								onChange={(e) => setSelectedLeverage(`${e.target.value}x`)}
								className="w-full h-1 bg-[#2a2d3a] rounded-lg appearance-none cursor-pointer slider"
							/>
							<div className="flex justify-between text-[#8a8d91] text-[9px]">
								{leverageOptions.map((option) => (
									<span key={option}>{option}</span>
								))}
							</div>
						</div>
					</div>

					{/* Chain & Market Selection */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-3">
							<span className="text-[#bbbbbe] text-[12px] font-medium">
								Chain & Market
							</span>
							<span className="text-[#8a8d91] text-[10px]">ROE</span>
						</div>

						{/* Chain/Market List */}
						<div className="space-y-1 max-h-32 overflow-y-auto">
							{chainMarkets.slice(0, 3).map((item) => (
								<div
									key={`${item.chain}-${item.market}`}
									className="flex items-center justify-between p-2 bg-[#0a0b17] rounded-md hover:bg-[#1a1b27] cursor-pointer transition-colors"
								>
									<div className="flex items-center">
										<span className="mr-2 text-[12px]">{item.icon}</span>
										<span className="text-[#bbbbbe] text-[10px] font-medium">
											{item.chain} / {item.market}
										</span>
									</div>
									<span className="text-[#ef5350] text-[10px] font-medium">{item.roe}</span>
								</div>
							))}
							<div className="text-center pt-1">
								<button type="button" className="text-[#8a8d91] text-[9px] hover:text-[#bbbbbe] transition-colors">
									View all markets
								</button>
							</div>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="sell" className="space-y-4">
					{/* Token Input Section */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-2">
							<span className="text-[#8a8d91] text-[11px]">You pay</span>
							<span className="text-[#8a8d91] text-[11px]">
								Balance: {tokens.find(t => t.symbol === inputToken)?.balance || "0.00"}
							</span>
						</div>
						<div className="flex items-center gap-3">
							<Input
								value={inputAmount}
								onChange={(e) => setInputAmount(e.target.value)}
								className="bg-transparent border-none text-[#bbbbbe] text-left flex-1 p-0 text-[18px] font-medium"
								placeholder="0.00"
							/>
							<Select value={inputToken} onValueChange={setInputToken}>
								<SelectTrigger className="w-auto bg-[#2a2d3a] border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded-lg">
									<div className="flex items-center gap-2">
										<span className="text-[14px]">{tokens.find(t => t.symbol === inputToken)?.icon}</span>
										<SelectValue />
									</div>
								</SelectTrigger>
								<SelectContent className="bg-[#141623] border-[#2a2d3a]">
									{tokens.map((token) => (
										<SelectItem
											key={token.symbol}
											value={token.symbol}
											className="text-[#bbbbbe] hover:bg-[#2a2d3a] focus:bg-[#2a2d3a]"
										>
											<div className="flex items-center gap-2">
												<span>{token.icon}</span>
												<div>
													<div className="text-[13px] font-medium">{token.symbol}</div>
													<div className="text-[10px] text-[#8a8d91]">{token.name}</div>
												</div>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								size="sm"
								onClick={() => setInputAmount(tokens.find(t => t.symbol === inputToken)?.balance || "0.00")}
								className="bg-[#2a2d3a] text-[#8a8d91] text-[10px] h-6 px-2 hover:bg-[#3a3d4a]"
							>
								Max
							</Button>
						</div>
					</div>

					{/* Swap Button */}
					<div className="flex justify-center">
						<Button
							onClick={handleSwapTokens}
							size="sm"
							className="bg-[#2a2d3a] hover:bg-[#3a3d4a] p-2 rounded-full"
						>
							<ArrowUpDown className="w-4 h-4 text-[#8a8d91]" />
						</Button>
					</div>

					{/* Token Output Section */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-2">
							<span className="text-[#8a8d91] text-[11px]">You receive</span>
							<span className="text-[#8a8d91] text-[11px]">
								Balance: {tokens.find(t => t.symbol === outputToken)?.balance || "0.00"}
							</span>
						</div>
						<div className="flex items-center gap-3">
							<Input
								value={outputAmount}
								onChange={(e) => setOutputAmount(e.target.value)}
								className="bg-transparent border-none text-[#bbbbbe] text-left flex-1 p-0 text-[18px] font-medium"
								placeholder="0.00"
							/>
							<Select value={outputToken} onValueChange={setOutputToken}>
								<SelectTrigger className="w-auto bg-[#2a2d3a] border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded-lg">
									<div className="flex items-center gap-2">
										<span className="text-[14px]">{tokens.find(t => t.symbol === outputToken)?.icon}</span>
										<SelectValue />
									</div>
								</SelectTrigger>
								<SelectContent className="bg-[#141623] border-[#2a2d3a]">
									{tokens.map((token) => (
										<SelectItem
											key={token.symbol}
											value={token.symbol}
											className="text-[#bbbbbe] hover:bg-[#2a2d3a] focus:bg-[#2a2d3a]"
										>
											<div className="flex items-center gap-2">
												<span>{token.icon}</span>
												<div>
													<div className="text-[13px] font-medium">{token.symbol}</div>
													<div className="text-[10px] text-[#8a8d91]">{token.name}</div>
												</div>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Action Button */}
					<Button className="w-full bg-[#ef5350] text-white text-[14px] font-medium hover:bg-[#d32f2f] py-3">
						{activeTab === "buy" ? "Buy / Long" : "Sell / Short"} {outputToken}
					</Button>

					{/* Leverage Section */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-4">
							<span className="text-[#bbbbbe] text-[12px] font-medium">
								Leverage
							</span>
							<span className="text-[#8a8d91] text-[10px]">
								{selectedLeverage}
							</span>
						</div>

						{/* Leverage Slider */}
						<div className="space-y-2">
							<input
								type="range"
								min="1"
								max="10"
								step="1"
								value={parseInt(selectedLeverage.replace('x', ''))}
								onChange={(e) => setSelectedLeverage(`${e.target.value}x`)}
								className="w-full h-1 bg-[#2a2d3a] rounded-lg appearance-none cursor-pointer slider"
							/>
							<div className="flex justify-between text-[#8a8d91] text-[9px]">
								{leverageOptions.map((option) => (
									<span key={option}>{option}</span>
								))}
							</div>
						</div>
					</div>

					{/* Chain & Market Selection */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-3">
							<span className="text-[#bbbbbe] text-[12px] font-medium">
								Chain & Market
							</span>
							<span className="text-[#8a8d91] text-[10px]">ROE</span>
						</div>

						{/* Chain/Market List */}
						<div className="space-y-1 max-h-32 overflow-y-auto">
							{chainMarkets.slice(0, 3).map((item) => (
								<div
									key={`${item.chain}-${item.market}`}
									className="flex items-center justify-between p-2 bg-[#0a0b17] rounded-md hover:bg-[#1a1b27] cursor-pointer transition-colors"
								>
									<div className="flex items-center">
										<span className="mr-2 text-[12px]">{item.icon}</span>
										<span className="text-[#bbbbbe] text-[10px] font-medium">
											{item.chain} / {item.market}
										</span>
									</div>
									<span className="text-[#ef5350] text-[10px] font-medium">{item.roe}</span>
								</div>
							))}
							<div className="text-center pt-1">
								<button type="button" className="text-[#8a8d91] text-[9px] hover:text-[#bbbbbe] transition-colors">
									View all markets
								</button>
							</div>
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
