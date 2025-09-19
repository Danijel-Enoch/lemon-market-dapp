"use client";

import { ArrowUpDown } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface TradingFormProps {
	mode: "buy" | "sell";
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
}

export function TradingForm({ mode, leverageOptions, tokens, chainMarkets }: TradingFormProps) {
	const [inputAmount, setInputAmount] = useState("");
	const [outputAmount, setOutputAmount] = useState("");
	const [inputToken, setInputToken] = useState("ETH");
	const [outputToken, setOutputToken] = useState("USDC");
	const [selectedLeverage, setSelectedLeverage] = useState("1x");

	const isBuyMode = mode === "buy";
	const buttonColor = isBuyMode
		? "bg-[var(--trading-blue)] hover:bg-[var(--trading-blue-hover)]"
		: "bg-[var(--trading-red)] hover:bg-[var(--trading-red-hover)]";
	const roeColor = isBuyMode ? "text-[var(--trading-blue)]" : "text-[var(--trading-red)]";

	const handleSwap = () => {
		const tempToken = inputToken;
		setInputToken(outputToken);
		setOutputToken(tempToken);
		const tempAmount = inputAmount;
		setInputAmount(outputAmount);
		setOutputAmount(tempAmount);
	};

	const handleMaxClick = () => {
		const token = tokens.find((t) => t.symbol === inputToken);
		if (token) {
			setInputAmount(token.balance);
		}
	};

	return (
		<div className="space-y-4">
			{/* You Pay Section */}
			<div className="bg-[var(--trading-bg-secondary)] rounded p-4">
				<div className="flex justify-between items-center mb-2">
					<span className="text-[var(--trading-text-secondary)] text-xs">You pay</span>
					<span className="text-[var(--trading-text-secondary)] text-xs">
						Balance: {tokens.find((t) => t.symbol === inputToken)?.balance || "0.00"}
					</span>
				</div>
				<div className="flex items-center justify-between">
					<input
						type="text"
						value={inputAmount}
						onChange={(e) => setInputAmount(e.target.value)}
						placeholder="0.00"
						className="bg-transparent border-none text-[var(--trading-text-primary)] text-left flex-1 p-0 text-lg font-medium"
					/>
					<Select value={inputToken} onValueChange={setInputToken}>
						<SelectTrigger className="w-auto bg-[var(--trading-bg-tertiary)] border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="bg-[var(--trading-bg-secondary)] border-[var(--trading-bg-tertiary)]">
							{tokens.map((token) => (
								<SelectItem
									key={token.symbol}
									value={token.symbol}
									className="text-[var(--trading-text-primary)] hover:bg-[var(--trading-bg-tertiary)] focus:bg-[var(--trading-bg-tertiary)]"
								>
									<div className="flex items-center gap-2">
										<Image src={token.icon} alt={token.symbol} width={20} height={20} />
										<div>
											<div className="text-sm font-medium">{token.symbol}</div>
											<div className="text-xs text-[var(--trading-text-secondary)]">
												{token.name}
											</div>
										</div>
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						variant="outline"
						size="sm"
						onClick={handleMaxClick}
						className="bg-[var(--trading-bg-tertiary)] text-[var(--trading-text-secondary)] text-xs h-6 px-2 hover:bg-gray-600"
					>
						MAX
					</Button>
				</div>
			</div>

			{/* Swap Button */}
			<div className="flex justify-center">
				<Button
					variant="ghost"
					size="sm"
					onClick={handleSwap}
					className="bg-[var(--trading-bg-tertiary)] hover:bg-gray-600 p-2 rounded-md"
				>
					<ArrowUpDown className="w-4 h-4 text-[var(--trading-text-secondary)]" />
				</Button>
			</div>

			{/* You Receive Section */}
			<div className="bg-[var(--trading-bg-secondary)] rounded p-4">
				<div className="flex justify-between items-center mb-2">
					<span className="text-[var(--trading-text-secondary)] text-xs">You receive</span>
					<span className="text-[var(--trading-text-secondary)] text-xs">
						Balance: {tokens.find((t) => t.symbol === outputToken)?.balance || "0.00"}
					</span>
				</div>
				<div className="flex items-center justify-between">
					<input
						type="text"
						value={outputAmount}
						onChange={(e) => setOutputAmount(e.target.value)}
						placeholder="0.00"
						className="bg-transparent border-none text-[var(--trading-text-primary)] text-left flex-1 p-0 text-lg font-medium"
					/>
					<Select value={outputToken} onValueChange={setOutputToken}>
						<SelectTrigger className="w-auto bg-[var(--trading-bg-tertiary)] border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded-lg">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="bg-[var(--trading-bg-secondary)] border-[var(--trading-bg-tertiary)]">
							{tokens.map((token) => (
								<SelectItem
									key={token.symbol}
									value={token.symbol}
									className="text-[var(--trading-text-primary)] hover:bg-[var(--trading-bg-tertiary)] focus:bg-[var(--trading-bg-tertiary)]"
								>
									<div className="flex items-center gap-2">
										<Image src={token.icon} alt={token.symbol} width={20} height={20} />
										<div>
											<div className="text-sm font-medium">{token.symbol}</div>
											<div className="text-xs text-[var(--trading-text-secondary)]">
												{token.name}
											</div>
										</div>
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Trade Button */}
			<Button className={`w-full ${buttonColor} text-white text-sm font-medium py-3`}>
				{isBuyMode ? "Buy / Long" : "Sell / Short"}
			</Button>

			{/* Leverage Section */}
			<div className="bg-[var(--trading-bg-secondary)] rounded p-4">
				<div className="flex justify-between items-center mb-3">
					<span className="text-[var(--trading-text-primary)] text-xs font-medium">Leverage</span>
					<span className="text-[var(--trading-text-secondary)] text-xs">{selectedLeverage}</span>
				</div>
				<div className="mb-3">
					<input
						type="range"
						min="1"
						max="5"
						step="0.1"
						value={selectedLeverage.replace("x", "")}
						onChange={(e) => setSelectedLeverage(`${e.target.value}x`)}
						className="w-full h-1 bg-[var(--trading-bg-tertiary)] rounded appearance-none cursor-pointer slider"
					/>
					<div className="flex justify-between text-[var(--trading-text-secondary)] text-xs">
						{leverageOptions.map((option) => (
							<span key={option}>{option}</span>
						))}
					</div>
				</div>
			</div>

			{/* Chain & Market Section */}
			<div className="bg-[var(--trading-bg-secondary)] rounded p-4">
				<div className="flex justify-between items-center mb-3">
					<span className="text-[var(--trading-text-primary)] text-xs font-medium">
						Chain & Market
					</span>
					<span className="text-[var(--trading-text-secondary)] text-xs">ROE</span>
				</div>
				<div className="space-y-2">
					{chainMarkets.map((item) => (
						<div
							key={`${item.chain}-${item.market}`}
							className="flex items-center justify-between p-2 bg-[var(--trading-bg-primary)] rounded hover:bg-gray-800 cursor-pointer transition-colors"
						>
							<div className="flex items-center gap-3">
								<Image src={item.icon} alt={item.chain} width={24} height={24} />
								<span className="text-[var(--trading-text-primary)] text-xs font-medium">
									{item.chain} • {item.market}
								</span>
							</div>
							<span className={`${roeColor} text-xs font-medium`}>{item.roe}</span>
						</div>
					))}
				</div>
				<button
					type="button"
					className="text-[var(--trading-text-secondary)] text-xs hover:text-[var(--trading-text-primary)] transition-colors"
				>
					View all
				</button>
			</div>
		</div>
	);
}
