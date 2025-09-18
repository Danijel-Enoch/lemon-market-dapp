"use client";

import { ArrowUpDown } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface TradingFormProps {
	mode: "buy" | "sell";
	inputAmount: string;
	outputAmount: string;
	inputToken: string;
	outputToken: string;
	selectedLeverage: string;
	leverageOptions: string[];
	tokens: Array<{
		symbol: string;
		name: string;
		balance: string;
		icon: string;
	}>;
	chainMarkets: Array<{
		chain: string;
		market: string;
		roe: string;
		icon: string;
	}>;
	onInputAmountChange: (value: string) => void;
	onOutputAmountChange: (value: string) => void;
	onInputTokenChange: (value: string) => void;
	onOutputTokenChange: (value: string) => void;
	onLeverageChange: (value: string) => void;
	onSwapTokens: () => void;
	onMaxClick: () => void;
}

export function TradingForm({
	mode,
	inputAmount,
	outputAmount,
	inputToken,
	outputToken,
	selectedLeverage,
	leverageOptions,
	tokens,
	chainMarkets,
	onInputAmountChange,
	onOutputAmountChange,
	onInputTokenChange,
	onOutputTokenChange,
	onLeverageChange,
	onSwapTokens,
	onMaxClick,
}: TradingFormProps) {
	const isBuyMode = mode === "buy";
	const buttonColor = isBuyMode
		? "bg-[#4c82f7] hover:bg-[#3a6bd6]"
		: "bg-[#ef5350] hover:bg-[#d32f2f]";
	const buttonText = isBuyMode ? "Buy / Long" : "Sell / Short";
	const roeColor = isBuyMode ? "text-[#4c82f7]" : "text-[#ef5350]";

	return (
		<div className="space-y-4">
			{/* Token Input Section */}
			<div className="bg-[#141623] rounded p-4">
				<div className="flex items-center justify-between mb-2">
					<span className="text-[#8a8d91] text-[11px]">You pay</span>
					<span className="text-[#8a8d91] text-[11px]">
						Balance: {tokens.find((t) => t.symbol === inputToken)?.balance || "0.00"}
					</span>
				</div>
				<div className="flex items-center gap-3">
					<Input
						value={inputAmount}
						onChange={(e) => onInputAmountChange(e.target.value)}
						className="bg-transparent border-none text-[#bbbbbe] text-left flex-1 p-0 text-[18px] font-medium"
						placeholder="0.00"
					/>
					<Select value={inputToken} onValueChange={onInputTokenChange}>
						<SelectTrigger className="w-auto bg-[#2a2d3a] border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded">
							<div className="flex items-center gap-2">
								<Image
									src={tokens.find((t) => t.symbol === inputToken)?.icon || ""}
									alt="x"
									width={14}
									height={14}
									className="rounded-sm"
								/>
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
										<Image src={token.icon} alt="x" width={13} height={13} className="rounded-sm" />
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
						onClick={onMaxClick}
						className="bg-[#2a2d3a] text-[#8a8d91] text-[10px] h-6 px-2 hover:bg-[#3a3d4a]"
					>
						Max
					</Button>
				</div>
			</div>

			{/* Swap Button */}
			<div className="flex justify-center -my-4 relative z-10">
				<Button
					onClick={onSwapTokens}
					size="sm"
					className="bg-[#2a2d3a] hover:bg-[#3a3d4a] p-2 rounded-full"
				>
					<ArrowUpDown className="w-4 h-4 text-[#8a8d91]" />
				</Button>
			</div>

			{/* Token Output Section */}
			<div className="bg-[#141623] rounded p-4">
				<div className="flex items-center justify-between mb-2">
					<span className="text-[#8a8d91] text-[11px]">You receive</span>
					<span className="text-[#8a8d91] text-[11px]">
						Balance: {tokens.find((t) => t.symbol === outputToken)?.balance || "0.00"}
					</span>
				</div>
				<div className="flex items-center gap-3">
					<Input
						value={outputAmount}
						onChange={(e) => onOutputAmountChange(e.target.value)}
						className="bg-transparent border-none text-[#bbbbbe] text-left flex-1 p-0 text-[18px] font-medium"
						placeholder="0.00"
					/>
					<Select value={outputToken} onValueChange={onOutputTokenChange}>
						<SelectTrigger className="w-auto bg-[#2a2d3a] border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded-lg">
							<div className="flex items-center gap-2">
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
										<Image src={token.icon} alt="x" width={13} height={13} className="rounded-sm" />
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
			<Button className={`w-full ${buttonColor} text-white text-[14px] font-medium py-3`}>
				{buttonText} {outputToken}
			</Button>

			{/* Leverage Section */}
			<div className="bg-[#141623] rounded p-4">
				<div className="flex items-center justify-between mb-4">
					<span className="text-[#bbbbbe] text-[12px] font-medium">Leverage</span>
					<span className="text-[#8a8d91] text-[10px]">{selectedLeverage}</span>
				</div>

				{/* Leverage Slider */}
				<div className="space-y-2">
					<input
						type="range"
						min="1"
						max="10"
						step="1"
						value={parseInt(selectedLeverage.replace("x", ""), 10)}
						onChange={(e) => onLeverageChange(`${e.target.value}x`)}
						className="w-full h-1 bg-[#2a2d3a] rounded appearance-none cursor-pointer slider"
					/>
					<div className="flex justify-between text-[#8a8d91] text-[9px]">
						{leverageOptions.map((option) => (
							<span key={option}>{option}</span>
						))}
					</div>
				</div>
			</div>

			{/* Chain & Market Selection */}
			<div className="bg-[#141623] rounded p-4">
				<div className="flex items-center justify-between mb-3">
					<span className="text-[#bbbbbe] text-[12px] font-medium">Chain & Market</span>
					<span className="text-[#8a8d91] text-[10px]">ROE</span>
				</div>

				{/* Chain/Market List */}
				<div className="space-y-1 max-h-32 overflow-y-auto">
					{chainMarkets.slice(0, 3).map((item) => (
						<div
							key={`${item.chain}-${item.market}`}
							className="flex items-center justify-between p-2 bg-[#0a0b17] rounded hover:bg-[#1a1b27] cursor-pointer transition-colors"
						>
							<div className="flex items-center">
								<Image src={item.icon} alt="x" width={12} height={12} className="rounded-sm mr-2" />
								<span className="text-[#bbbbbe] text-[10px] font-medium">
									{item.chain} / {item.market}
								</span>
							</div>
							<span className={`${roeColor} text-[10px] font-medium`}>{item.roe}</span>
						</div>
					))}
					<div className="text-center pt-1">
						<button
							type="button"
							className="text-[#8a8d91] text-[9px] hover:text-[#bbbbbe] transition-colors"
						>
							View all markets
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
