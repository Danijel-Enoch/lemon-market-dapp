"use client";

import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TradingForm } from "./TradingForm";

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

	const handleMaxClick = () => {
		setInputAmount(
			tokens.find((t) => t.symbol === inputToken)?.balance || "0.00",
		);
	};

	return (
		<div className="w-[380px] bg-[#0a0b17] rounded p-6">
			<Tabs
				defaultValue="buy"
				value={activeTab}
				onValueChange={setActiveTab}
				className="w-full"
			>
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

				<TabsContent value="buy">
					<TradingForm
						mode="buy"
						inputAmount={inputAmount}
						outputAmount={outputAmount}
						inputToken={inputToken}
						outputToken={outputToken}
						selectedLeverage={selectedLeverage}
						leverageOptions={leverageOptions}
						tokens={tokens}
						chainMarkets={chainMarkets}
						onInputAmountChange={setInputAmount}
						onOutputAmountChange={setOutputAmount}
						onInputTokenChange={setInputToken}
						onOutputTokenChange={setOutputToken}
						onLeverageChange={setSelectedLeverage}
						onSwapTokens={handleSwapTokens}
						onMaxClick={handleMaxClick}
					/>
				</TabsContent>

				<TabsContent value="sell">
					<TradingForm
						mode="sell"
						inputAmount={inputAmount}
						outputAmount={outputAmount}
						inputToken={inputToken}
						outputToken={outputToken}
						selectedLeverage={selectedLeverage}
						leverageOptions={leverageOptions}
						tokens={tokens}
						chainMarkets={chainMarkets}
						onInputAmountChange={setInputAmount}
						onOutputAmountChange={setOutputAmount}
						onInputTokenChange={setInputToken}
						onOutputTokenChange={setOutputToken}
						onLeverageChange={setSelectedLeverage}
						onSwapTokens={handleSwapTokens}
						onMaxClick={handleMaxClick}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
