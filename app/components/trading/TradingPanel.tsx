import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
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

const chains = ["All", "Ethereum", "Polygon", "Arbitrum", "Optimism"];
const moneyMarkets = ["All", "Aave V3", "Compound III", "SparkSky", "Silo"];

export function TradingPanel() {
	const [activeTab, setActiveTab] = useState("buy");
	const [selectedChain, setSelectedChain] = useState("All");
	const [selectedMoneyMarket, setSelectedMoneyMarket] = useState("All");

	return (
		<div className="w-96 bg-(--trading-bg-secondary) h-full rounded p-2">
			<div className="flex items-center bg-(--trading-bg-primary) border border-gray-800 rounded p-2 space-x-3 mb-2">
				<Select value={selectedChain} onValueChange={setSelectedChain}>
					<SelectTrigger className="flex items-center bg-(--trading-bg-secondary) border border-(--trading-border) rounded px-4 w-full">
						<span className="text-(--trading-text-primary) text-xs font-bold">
							Chain: <SelectValue />
						</span>
					</SelectTrigger>
					<SelectContent className="bg-(--trading-bg-secondary) border-(--trading-border)">
						{chains.map((chain) => (
							<SelectItem
								key={chain}
								value={chain}
								className="text-(--trading-text-primary) hover:bg-(--trading-border) focus:bg-(--trading-border)"
							>
								{chain}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={selectedMoneyMarket} onValueChange={setSelectedMoneyMarket}>
					<SelectTrigger className="flex items-center bg-(--trading-bg-secondary) border border-(--trading-border) rounded px-4 w-full">
						<span className="text-(--trading-text-primary) text-xs">
							Money Market: <SelectValue />
						</span>
					</SelectTrigger>
					<SelectContent className="bg-(--trading-bg-secondary) border-(--trading-border)">
						{moneyMarkets.map((market) => (
							<SelectItem
								key={market}
								value={market}
								className="text-(--trading-text-primary) hover:bg-(--trading-border) focus:bg-(--trading-border)"
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
				className="w-full bg-(--trading-bg-primary) p-2 h-full"
			>
				<TabsList className="grid w-full grid-cols-2 gap-0">
					<TabsTrigger
						value="buy"
						className="text-[#818181] hover:text-[#bdbdbd] data-[state=active]:text-[#4DAD31] data-[state=active]:border-[#4DAD31]"
					>
						Buy / Long
					</TabsTrigger>
					<TabsTrigger
						value="sell"
						className="text-[#818181] hover:text-[#bdbdbd] data-[state=active]:text-[#FF4C4C] data-[state=active]:border-[#FF4C4C]"
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
