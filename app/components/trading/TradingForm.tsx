import { Button } from "@app/components/ui/button";
import { Card, CardContent } from "@app/components/ui/card";
import { Input } from "@app/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@app/components/ui/select";
import { ArrowUpDown } from "lucide-react";
import { useState } from "react";

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
	const roeColor = isBuyMode ? "text-[var(--trade-long)]" : "text-[var(--trade-short)]";

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
			<Card className="bg-(--trade-surface) border-none">
				<CardContent className="p-4">
					<div className="flex justify-between items-center mb-2">
						<span className="text-muted-foreground text-xs">You pay</span>
						<span className="text-muted-foreground text-xs">
							Balance: {tokens.find((t) => t.symbol === inputToken)?.balance || "0.00"}
						</span>
					</div>
					<div className="flex items-center justify-between gap-2">
						<Input
							type="text"
							value={inputAmount}
							onChange={(e) => setInputAmount(e.target.value)}
							placeholder="0.00"
							className="bg-transparent border-none text-foreground text-left flex-1 p-0 text-lg font-medium shadow-none focus-visible:ring-0 h-auto"
						/>
						<Select value={inputToken} onValueChange={setInputToken}>
							<SelectTrigger className="w-auto bg-background border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{tokens.map((token) => (
									<SelectItem key={token.symbol} value={token.symbol}>
										<div className="flex items-center gap-2">
											<img src={token.icon} alt={token.symbol} width={20} height={20} />
											<div>
												<div className="text-sm font-medium">{token.symbol}</div>
												<div className="text-xs text-muted-foreground">{token.name}</div>
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
							className="bg-background text-muted-foreground text-xs h-6 px-2 hover:bg-gray-600 border-none"
						>
							MAX
						</Button>
					</div>
				</CardContent>
			</Card>

			<div className="flex justify-center">
				<Button
					variant="ghost"
					size="sm"
					onClick={handleSwap}
					className="bg-(--trade-surface) hover:bg-gray-600 p-2 rounded-md"
				>
					<ArrowUpDown className="w-4 h-4 text-muted-foreground" />
				</Button>
			</div>

			<Card className="bg-(--trade-surface) border-none">
				<CardContent className="p-4">
					<div className="flex justify-between items-center mb-2">
						<span className="text-muted-foreground text-xs">You receive</span>
						<span className="text-muted-foreground text-xs">
							Balance: {tokens.find((t) => t.symbol === outputToken)?.balance || "0.00"}
						</span>
					</div>
					<div className="flex items-center justify-between gap-2">
						<Input
							type="text"
							value={outputAmount}
							onChange={(e) => setOutputAmount(e.target.value)}
							placeholder="0.00"
							className="bg-transparent border-none text-foreground text-left flex-1 p-0 text-lg font-medium shadow-none focus-visible:ring-0 h-auto"
						/>
						<Select value={outputToken} onValueChange={setOutputToken}>
							<SelectTrigger className="w-auto bg-background border-none px-3 py-2 h-auto focus:ring-0 focus:ring-offset-0 rounded-lg">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{tokens.map((token) => (
									<SelectItem key={token.symbol} value={token.symbol}>
										<div className="flex items-center gap-2">
											<img src={token.icon} alt={token.symbol} width={20} height={20} />
											<div>
												<div className="text-sm font-medium">{token.symbol}</div>
												<div className="text-xs text-muted-foreground">{token.name}</div>
											</div>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardContent>
			</Card>

			<Button
				variant={isBuyMode ? "trade-long" : "trade-short"}
				size="lg"
				className="w-full font-medium py-3 h-12"
			>
				{isBuyMode ? "Buy / Long" : "Sell / Short"}
			</Button>

			<Card className="bg-(--trade-surface) border-none">
				<CardContent className="p-4">
					<div className="flex justify-between items-center mb-3">
						<span className="text-foreground text-xs font-medium">Leverage</span>
						<span className="text-muted-foreground text-xs">{selectedLeverage}</span>
					</div>
					<div className="mb-3">
						<input
							type="range"
							min="1"
							max="5"
							step="0.1"
							value={selectedLeverage.replace("x", "")}
							onChange={(e) => setSelectedLeverage(`${e.target.value}x`)}
							className="w-full h-1 bg-background rounded appearance-none cursor-pointer slider"
						/>
						<div className="flex justify-between text-muted-foreground text-xs">
							{leverageOptions.map((option) => (
								<span key={option}>{option}</span>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Chain & Market Section */}
			<Card className="bg-(--trade-surface) border-none">
				<CardContent className="p-4">
					<div className="flex justify-between items-center mb-3">
						<span className="text-foreground text-xs font-medium">Chain & Market</span>
						<span className="text-muted-foreground text-xs">ROE</span>
					</div>
					<div className="space-y-2">
						{chainMarkets.map((item) => (
							<div
								key={`${item.chain}-${item.market}`}
								className="flex items-center justify-between p-2 bg-background rounded hover:bg-gray-800 cursor-pointer transition-colors"
							>
								<div className="flex items-center gap-3">
									<img src={item.icon} alt={item.chain} width={24} height={24} />
									<span className="text-foreground text-xs font-medium">
										{item.chain} • {item.market}
									</span>
								</div>
								<span className={`${roeColor} text-xs font-medium`}>{item.roe}</span>
							</div>
						))}
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="w-full text-muted-foreground text-xs hover:text-foreground transition-colors mt-2 h-auto py-1"
					>
						View all
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
