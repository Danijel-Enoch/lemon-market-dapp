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

const currencies = ["USDC.e", "USDC", "DAI", "USDT"];

export function TradingPanel() {
	const [selectedLeverage, setSelectedLeverage] = useState("2x");
	const [marginAmount, setMarginAmount] = useState("0.00");
	const [selectedCurrency, setSelectedCurrency] = useState("USDC.e");
	const [activeTab, setActiveTab] = useState("buy");

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

				<TabsContent value="buy" className="space-y-6">
					{/* Margin Section */}
					<div className="bg-[#141623] rounded-lg p-5">
						<div className="flex items-center justify-between mb-3">
							<span className="text-[#bbbbbe] text-[13px] font-medium">
								Margin
							</span>
							<Button
								size="sm"
								className="bg-[#2a2d3a] text-[#8a8d91] text-[11px] h-7 px-3"
							>
								Max
							</Button>
						</div>
						<div className="flex items-center justify-between mb-3">
							<span className="text-[#8a8d91] text-[11px]">Balance:</span>
							<span className="text-[#8a8d91] text-[11px]">{selectedCurrency}</span>
						</div>
						<div className="flex items-center">
							<Input
								value={marginAmount}
								onChange={(e) => setMarginAmount(e.target.value)}
								className="bg-transparent border-none text-[#bbbbbe] text-right flex-1 p-0 text-[14px]"
								placeholder="0.00"
							/>
							<Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
								<SelectTrigger className="w-auto bg-transparent border-none p-0 h-auto focus:ring-0 focus:ring-offset-0">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="bg-[#141623] border-[#2a2d3a]">
									{currencies.map((currency) => (
										<SelectItem
											key={currency}
											value={currency}
											className="text-[#bbbbbe] hover:bg-[#2a2d3a] focus:bg-[#2a2d3a]"
										>
											{currency}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Size Section */}
					<div className="bg-[#141623] rounded-lg p-5">
						<div className="flex items-center justify-between">
							<span className="text-[#bbbbbe] text-[13px] font-medium">
								Size
							</span>
							<span className="text-[#bbbbbe] text-[13px]">ETH</span>
						</div>
					</div>

					{/* Read Only Button */}
					<Button className="w-full bg-[#2a2d3a] text-[#8a8d91] text-[12px] font-medium hover:bg-[#3a3d4a]">
						Read Only
					</Button>

					{/* Leverage Section */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-4">
							<span className="text-[#bbbbbe] text-[12px] font-medium">
								Leverage
							</span>
							<span className="text-[#bbbbbe] text-[12px] font-bold">
								{selectedLeverage}
							</span>
						</div>

						{/* Leverage Slider */}
						<div className="relative mb-4">
							<div className="w-full h-2 bg-[#2a2d3a] rounded-full">
								<div className="w-1/4 h-full bg-[#4c82f7] rounded-full"></div>
							</div>
							<div className="absolute top-0 left-1/4 w-4 h-4 bg-[#4c82f7] rounded-full -mt-1 transform -translate-x-1/2"></div>
						</div>

						{/* Leverage Options */}
						<div className="flex justify-between">
							{leverageOptions.map((option) => (
								<button
									type="button"
									key={option}
									onClick={() => setSelectedLeverage(option)}
									className={`text-[10px] px-2 py-1 rounded ${
										selectedLeverage === option
											? "text-[#4c82f7] bg-[#2a2d3a]"
											: "text-[#8a8d91] hover:text-[#bbbbbe]"
									}`}
								>
									{option}
								</button>
							))}
						</div>
					</div>

					{/* Chain & Market Selection */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-4">
							<span className="text-[#bbbbbe] text-[12px] font-medium">
								Select Chain & Market
							</span>
							<span className="text-[#8a8d91] text-[10px]">ROE</span>
						</div>

						{/* Chain/Market List */}
						<div className="space-y-2 max-h-48 overflow-y-auto">
							{chainMarkets.map((item) => (
								<div
									key={`${item.chain}-${item.market}`}
									className="flex items-center justify-between p-2 bg-[#0a0b17] rounded hover:bg-[#1a1b27] cursor-pointer"
								>
									<div className="flex items-center">
										<span className="mr-2">{item.icon}</span>
										<span className="text-[#bbbbbe] text-[10px]">
											{item.chain} / {item.market}
										</span>
									</div>
									<span className="text-[#ef5350] text-[10px]">{item.roe}</span>
								</div>
							))}
						</div>
					</div>
				</TabsContent>

				<TabsContent value="sell" className="space-y-6">
					{/* Margin Section */}
					<div className="bg-[#141623] rounded-lg p-5">
						<div className="flex items-center justify-between mb-3">
							<span className="text-[#bbbbbe] text-[13px] font-medium">
								Margin
							</span>
							<Button
								size="sm"
								className="bg-[#2a2d3a] text-[#8a8d91] text-[11px] h-7 px-3"
							>
								Max
							</Button>
						</div>
						<div className="flex items-center justify-between mb-3">
							<span className="text-[#8a8d91] text-[11px]">Balance:</span>
							<span className="text-[#8a8d91] text-[11px]">{selectedCurrency}</span>
						</div>
						<div className="flex items-center">
							<Input
								value={marginAmount}
								onChange={(e) => setMarginAmount(e.target.value)}
								className="bg-transparent border-none text-[#bbbbbe] text-right flex-1 p-0 text-[14px]"
								placeholder="0.00"
							/>
							<Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
								<SelectTrigger className="w-auto bg-transparent border-none p-0 h-auto focus:ring-0 focus:ring-offset-0">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="bg-[#141623] border-[#2a2d3a]">
									{currencies.map((currency) => (
										<SelectItem
											key={currency}
											value={currency}
											className="text-[#bbbbbe] hover:bg-[#2a2d3a] focus:bg-[#2a2d3a]"
										>
											{currency}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Size Section */}
					<div className="bg-[#141623] rounded-lg p-5">
						<div className="flex items-center justify-between">
							<span className="text-[#bbbbbe] text-[13px] font-medium">
								Size
							</span>
							<span className="text-[#bbbbbe] text-[13px]">ETH</span>
						</div>
					</div>

					{/* Read Only Button - Red styling for sell */}
					<Button className="w-full bg-[#ef5350] text-white text-[12px] font-medium hover:bg-[#d32f2f]">
						Sell / Short
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

						{/* Leverage Options */}
						<div className="flex justify-between">
							{leverageOptions.map((option) => (
								<button
									type="button"
									key={option}
									onClick={() => setSelectedLeverage(option)}
									className={`text-[10px] px-2 py-1 rounded ${
										selectedLeverage === option
											? "text-[#ef5350] bg-[#2a2d3a]"
											: "text-[#8a8d91] hover:text-[#bbbbbe]"
									}`}
								>
									{option}
								</button>
							))}
						</div>
					</div>

					{/* Chain & Market Selection */}
					<div className="bg-[#141623] rounded-lg p-4">
						<div className="flex items-center justify-between mb-4">
							<span className="text-[#bbbbbe] text-[12px] font-medium">
								Select Chain & Market
							</span>
							<span className="text-[#8a8d91] text-[10px]">ROE</span>
						</div>

						{/* Chain/Market List */}
						<div className="space-y-2 max-h-48 overflow-y-auto">
							{chainMarkets.map((item) => (
								<div
									key={`${item.chain}-${item.market}`}
									className="flex items-center justify-between p-2 bg-[#0a0b17] rounded hover:bg-[#1a1b27] cursor-pointer"
								>
									<div className="flex items-center">
										<span className="mr-2">{item.icon}</span>
										<span className="text-[#bbbbbe] text-[10px]">
											{item.chain} / {item.market}
										</span>
									</div>
									<span className="text-[#ef5350] text-[10px]">{item.roe}</span>
								</div>
							))}
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
