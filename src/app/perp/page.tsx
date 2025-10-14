"use client";

import { TrendingUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import {
	useAccount,
	useBalance,
	useReadContract,
	useSendTransaction,
	useWaitForTransactionReceipt,
	useWriteContract
} from "wagmi";
import { PositionsTable } from "@/components/trading/PositionsTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectWallet } from "@/components/ui/ConnectWallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUserPositions } from "@/hooks/useUserPositions";
import { ERC20Abi, SyntheticPerpetualContract, usdc } from "@/lib/contracts";
import {
	formatPrice,
	formatPriceChange,
	getTokenPriceByPair
} from "@/lib/oracle";
import {
	createPosition,
	extractTokenSymbol,
	formatTxHash,
	getEtherscanUrl,
	validateLeverage,
	validateMargin
} from "@/lib/position-api";

function PerpContent() {
	const searchParams = useSearchParams();
	const [tradingPair, setTradingPair] = useState({
		symbol: "BTC/USDT",
		price: "$45,234.56",
		change: "+2.34%",
		pairAddress: "0x638f567d445E60E1aC1AfD369f53176FE9D5F93D",
		tokenAddress: "0xB31f66A3C7a7e7bEC12cCaCEd3DCCF4C0d4fE1f8"
	});
	const [isLoadingPrice, setIsLoadingPrice] = useState(false);
	const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);

	const {
		positions,
		isLoading: isLoadingPositions,
		error: positionsError,
		refetch: fetchUserPositions,
		openPositions,
		totalPnl,
		totalMargin
	} = useUserPositions();

	const { address, isConnected } = useAccount();
	const {
		sendTransaction,
		data: hash,
		error,
		isPending
	} = useSendTransaction();
	const { isLoading: isConfirming, isSuccess: isConfirmed } =
		useWaitForTransactionReceipt({
			hash
		});

	const {
		writeContract,
		data: approvalHash,
		isPending: isApproving
	} = useWriteContract();
	const { isLoading: isApprovalConfirming, isSuccess: isApprovalConfirmed } =
		useWaitForTransactionReceipt({
			hash: approvalHash
		});

	const { data: ethBalance } = useBalance({
		address: address,
		query: { enabled: !!address }
	});

	const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
		address: usdc as `0x${string}`,
		abi: ERC20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: !!address }
	});

	const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
		address: usdc as `0x${string}`,
		abi: ERC20Abi,
		functionName: "allowance",
		args: address
			? [address, SyntheticPerpetualContract as `0x${string}`]
			: undefined,
		query: { enabled: !!address }
	});

	const [isLong, setIsLong] = useState(true);
	const [valueUSDC, setValueUSDC] = useState("100");
	const [leverage, setLeverage] = useState(2);
	const [bnbAmount, setBnbAmount] = useState("0.51451404");
	const [isCreatingPosition, setIsCreatingPosition] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);
	const [lastTransactionHash, setLastTransactionHash] = useState<
		string | null
	>(null);
	const [needsApproval, setNeedsApproval] = useState(false);

	const maxLeverage = 2;

	const fetchLatestPrice = async () => {
		if (!tradingPair.pairAddress) return;

		setIsLoadingPrice(true);
		try {
			const tokenPrice = await getTokenPriceByPair(
				tradingPair.pairAddress,
				"base"
			);
			if (tokenPrice) {
				setTradingPair((prev) => ({
					...prev,
					price: formatPrice(tokenPrice.priceUsd),
					change: tokenPrice.priceChange24h
						? formatPriceChange(tokenPrice.priceChange24h)
						: prev.change
				}));
				setLastPriceUpdate(new Date());
			}
		} catch (error) {
			console.error("Error fetching latest price:", error);
		} finally {
			setIsLoadingPrice(false);
		}
	};

	useEffect(() => {
		const symbol = searchParams.get("symbol");
		const pairAddress = searchParams.get("pairAddress");
		const tokenAddress = searchParams.get("tokenAddress");

		if (symbol) {
			// Format the symbol for display (add /USDT if not already present)
			const formattedSymbol = symbol.includes("/")
				? symbol
				: `${symbol}/USDT`;

			setTradingPair((prev) => ({
				...prev,
				symbol: formattedSymbol,
				pairAddress: pairAddress || prev.pairAddress,
				tokenAddress: tokenAddress || prev.tokenAddress
			}));
		}
	}, [searchParams]);

	useEffect(() => {
		fetchLatestPrice();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tradingPair.pairAddress]);

	useEffect(() => {
		const interval = setInterval(() => {
			fetchLatestPrice();
		}, 30000); // 30 seconds

		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tradingPair.pairAddress]);

	useEffect(() => {
		if (
			usdcAllowance !== undefined &&
			valueUSDC &&
			parseFloat(valueUSDC) > 0
		) {
			const marginInWei = parseUnits(valueUSDC, 6); // USDC has 6 decimals
			const allowanceAmount = BigInt(usdcAllowance as string);
			setNeedsApproval(allowanceAmount < marginInWei);
		} else if (usdcAllowance !== undefined) {
			// If we have allowance data but no valid margin, assume no approval needed for now
			setNeedsApproval(false);
		} else {
			// If we don't have allowance data yet, assume approval is needed
			setNeedsApproval(true);
		}
	}, [usdcAllowance, valueUSDC]);

	useEffect(() => {
		if (!isConnected) {
			setNeedsApproval(false);
		}
	}, [isConnected]);

	useEffect(() => {
		if (isConfirmed && hash) {
			setLastTransactionHash(hash);
			// Refetch balances after successful transaction
			refetchUsdcBalance();
			refetchAllowance();
			// Reset form after successful transaction
			setTimeout(() => {
				setApiError(null);
				// Optionally reset form values
				// setValueUSDC("100");
				// setLeverage(2);
			}, 3000);
		}
	}, [isConfirmed, hash, refetchUsdcBalance, refetchAllowance]);

	useEffect(() => {
		if (isApprovalConfirmed && approvalHash) {
			// Refetch allowance after successful approval
			refetchAllowance();
			setApiError(null);
		}
	}, [isApprovalConfirmed, approvalHash, refetchAllowance]);

	useEffect(() => {
		if (isConfirmed && hash && address) {
			// Wait a bit for the subgraph to index the new position
			setTimeout(() => {
				fetchUserPositions();
			}, 5000);
		}
	}, [isConfirmed, hash, address]);

	const handleLeverageChange = (delta: number) => {
		const newLeverage = Math.max(
			1,
			Math.min(maxLeverage, leverage + delta)
		);
		setLeverage(newLeverage);
	};

	const handleApproveUSDC = async () => {
		if (!isConnected || !address) {
			setApiError("Please connect your wallet first");
			return;
		}

		try {
			setApiError(null);
			const approvalAmount = parseUnits("1000000", 6);

			writeContract({
				address: usdc as `0x${string}`,
				abi: ERC20Abi,
				functionName: "approve",
				args: [
					SyntheticPerpetualContract as `0x${string}`,
					approvalAmount
				]
			});
		} catch (error) {
			console.error("Error approving USDC:", error);
			setApiError(
				error instanceof Error
					? error.message
					: "Failed to approve USDC"
			);
		}
	};

	// Handle place transaction
	const handlePlaceTransaction = async () => {
		if (!isConnected || !address) {
			setApiError("Please connect your wallet first");
			return;
		}

		const marginValidation = validateMargin(valueUSDC);
		if (!marginValidation.valid) {
			setApiError(marginValidation.error!);
			return;
		}

		const leverageValidation = validateLeverage(leverage);
		if (!leverageValidation.valid) {
			setApiError(leverageValidation.error!);
			return;
		}

		setIsCreatingPosition(true);
		setApiError(null);

		try {
			const tokenSymbol = extractTokenSymbol(tradingPair.symbol);

			const result = await createPosition({
				tokenSymbol,
				isLong,
				margin: valueUSDC,
				leverage,
				tokenAddress: tradingPair.tokenAddress,
				userAddress: address,
				pairAddress: tradingPair.pairAddress
			});

			if (!result.success) {
				throw new Error(result.error || "Failed to create position");
			}

			if (result.data) {
				console.log("Executing transaction with data:", result.data);

				sendTransaction({
					to: result.data.to as `0x${string}`,
					data: result.data.data as `0x${string}`,
					value: BigInt(0),
					gas: result.data.gasEstimate
						? BigInt(String(result.data.gasEstimate))
						: undefined
				});
			}
		} catch (error) {
			console.error("Error creating position:", error);
			setApiError(
				error instanceof Error
					? error.message
					: "Failed to create position"
			);
		} finally {
			setIsCreatingPosition(false);
		}
	};

	const getChartUrl = () => {
		if (tradingPair.pairAddress) {
			console.log("Using pair address:", tradingPair.pairAddress);
			return (
				"https://dexscreener.com/base/" +
				tradingPair.pairAddress +
				"?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15&background=0a0a0a"
			);
		}
		return "";
	};

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-primary/10 rounded-lg">
							<TrendingUp className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-foreground">
								Perpetual Trading
							</h1>
							<p className="text-muted-foreground text-sm">
								Trade cryptocurrency perpetual futures with up
								to {maxLeverage}x leverage
							</p>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Trading Panel */}
					<div className="lg:col-span-2 space-y-6">
						{/* Price Chart Placeholder */}
						<Card className="bg-card border-gray-100/10">
							<CardHeader>
								<CardTitle className="text-foreground flex items-center justify-between">
									<span>{tradingPair.symbol} Perpetual</span>
									<div className="flex items-center space-x-4">
										<div className="flex items-center space-x-2">
											<div className="text-2xl font-bold text-success">
												{isLoadingPrice ? (
													<div className="animate-pulse">
														Loading...
													</div>
												) : (
													tradingPair.price
												)}
											</div>
											<Button
												size="sm"
												variant="ghost"
												onClick={fetchLatestPrice}
												disabled={isLoadingPrice}
												className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
												title="Refresh price"
											>
												<svg
													className={`h-4 w-4 ${
														isLoadingPrice
															? "animate-spin"
															: ""
													}`}
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
													/>
												</svg>
											</Button>
										</div>
										<Badge
											className={`${
												tradingPair.change.startsWith(
													"+"
												)
													? "bg-primary hover:bg-primary/90"
													: "bg-destructive hover:bg-destructive/90"
											}`}
										>
											{tradingPair.change}
										</Badge>
									</div>
								</CardTitle>
							</CardHeader>
							<CardContent>
								{lastPriceUpdate && (
									<div className="mb-2 text-xs text-gray-500 text-right">
										Last updated:{" "}
										{lastPriceUpdate.toLocaleTimeString()}
									</div>
								)}
								<div
									id="dexscreener-embed"
									className="bg-[#0a0a0a] rounded-lg overflow-hidden"
								>
									<iframe
										src={getChartUrl()}
										width="100%"
										height="500"
										style={{
											border: "none",
											background: "#0a0a0a"
										}}
										title={`${tradingPair.symbol} Chart`}
									></iframe>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Trading Form */}
					<div className="space-y-6">
						<Card className="bg-card border-gray-100/10">
							<CardContent className="space-y-6 p-6">
								{/* Long/Short Toggle */}
								<div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-lg">
									<Button
										onClick={() => setIsLong(true)}
										className={`rounded-md h-12 font-semibold ${
											isLong
												? "bg-primary hover:bg-primary/90 text-black"
												: "bg-transparent text-muted-foreground hover:text-foreground"
										}`}
									>
										LONG
									</Button>
									<Button
										onClick={() => setIsLong(false)}
										className={`rounded-md h-12 font-semibold ${
											!isLong
												? "bg-destructive hover:bg-destructive/90 text-foreground"
												: "bg-transparent text-muted-foreground hover:text-foreground"
										}`}
									>
										SHORT
									</Button>
								</div>

								{/* Wallet Balances */}
								{isConnected && (
									<div className="bg-muted p-4 rounded-lg">
										<h4 className="text-sm text-muted-foreground uppercase font-medium mb-3">
											Wallet Balance
										</h4>
										<div className="space-y-2">
											<div className="flex justify-between items-center">
												<span className="text-muted-foreground">
													ETH:
												</span>
												<span className="text-foreground font-medium">
													{ethBalance
														? `${parseFloat(
																formatUnits(
																	ethBalance.value,
																	ethBalance.decimals
																)
														  ).toFixed(4)} ETH`
														: "0.0000 ETH"}
												</span>
											</div>
											<div className="flex justify-between items-center">
												<span className="text-muted-foreground">
													USDC:
												</span>
												<span className="text-foreground font-medium">
													{usdcBalance
														? `${parseFloat(
																formatUnits(
																	BigInt(
																		usdcBalance as string
																	),
																	6
																)
														  ).toFixed(2)} USDC`
														: "0.00 USDC"}
												</span>
											</div>
										</div>
									</div>
								)}

								{/* USDC Approval Section */}
								{isConnected && (
									<div className="bg-muted p-4 rounded-lg">
										<div className="flex justify-between items-center mb-3">
											<h4 className="text-sm text-muted-foreground uppercase font-medium">
												USDC Approval
											</h4>
											<span
												className={`text-xs px-2 py-1 rounded ${
													needsApproval
														? "bg-red-900/50 text-destructive"
														: "bg-green-900/50 text-success"
												}`}
											>
												{needsApproval
													? "Required"
													: "Approved"}
											</span>
										</div>

										{needsApproval ? (
											<div className="space-y-3">
												<p className="text-sm text-muted-foreground">
													Approve USDC spending to
													create positions
												</p>
												<Button
													onClick={handleApproveUSDC}
													disabled={
														isApproving ||
														isApprovalConfirming
													}
													className="w-full h-10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
												>
													{isApproving
														? "Confirm in Wallet..."
														: isApprovalConfirming
														? "Confirming..."
														: "Approve USDC"}
												</Button>
											</div>
										) : (
											<div className="flex items-center space-x-2">
												<div className="w-2 h-2 bg-green-400 rounded-full"></div>
												<p className="text-sm text-success">
													USDC spending approved
												</p>
											</div>
										)}
									</div>
								)}

								{/* Value Input */}
								<div className="space-y-2">
									<div className="flex justify-between items-center">
										<label className="text-sm text-primary uppercase font-medium">
											Margin (USDC)
										</label>
										{valueUSDC &&
											!validateMargin(valueUSDC)
												.valid && (
												<span className="text-xs text-destructive">
													{
														validateMargin(
															valueUSDC
														).error
													}
												</span>
											)}
									</div>
									<div className="relative">
										<div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center">
											<div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
												<span className="text-foreground text-xs font-bold">
													$
												</span>
											</div>
										</div>
										<Input
											placeholder="100"
											value={valueUSDC}
											onChange={(e) => {
												setValueUSDC(e.target.value);
												setApiError(null); // Clear error when user types
											}}
											className={`bg-muted border-gray-100/10 text-foreground text-center text-2xl font-bold h-14 pl-12 pr-20 ${
												valueUSDC &&
												!validateMargin(valueUSDC).valid
													? "border-red-500 focus:border-red-500"
													: "focus:border-cyan-500"
											}`}
										/>
										<div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
											<div className="w-6 h-6 bg-gray-300 rounded"></div>
											<span className="text-primary font-medium">
												USDC
											</span>
										</div>
									</div>
								</div>

								{/* Leverage */}
								<div className="space-y-3">
									<div className="flex justify-between items-center">
										<label className="text-sm text-primary uppercase font-medium">
											Leverage
										</label>
										<span className="text-success text-lg font-bold">
											{leverage}x
										</span>
									</div>
									<div className="relative">
										<div className="flex items-center space-x-4 bg-muted rounded-lg p-4">
											<button
												onClick={() =>
													handleLeverageChange(-1)
												}
												className="w-8 h-8 border border-primary/40 text-primary rounded-full flex items-center justify-center text-lg hover:bg-primary hover:text-black transition-colors"
											>
												-
											</button>
											<div className="flex-1 relative">
												<div className="h-2 bg-slate-700 rounded-full">
													<div
														className="h-2 bg-gradient-to-r from-green-400 to-cyan-400 rounded-full"
														style={{
															width: `${
																((leverage -
																	1) /
																	(maxLeverage -
																		1)) *
																100
															}%`
														}}
													></div>
												</div>
												<div className="flex justify-between text-xs text-muted-foreground mt-2">
													{Array.from(
														{ length: maxLeverage },
														(_, i) => i + 1
													).map((lev) => (
														<span
															key={lev}
															className={
																leverage === lev
																	? "text-primary font-bold"
																	: ""
															}
														>
															{lev}x
														</span>
													))}
												</div>
											</div>
											<button
												onClick={() =>
													handleLeverageChange(1)
												}
												className="w-8 h-8 border border-primary/40 text-primary rounded-full flex items-center justify-center text-lg hover:bg-primary hover:text-black transition-colors"
											>
												+
											</button>
										</div>
									</div>
								</div>

								{/* You Pay */}
								<div className="space-y-2">
									<label className="text-sm text-primary uppercase font-medium">
										You Pay (BNB)
									</label>
									<div className="relative">
										<div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center">
											<div className="w-6 h-6 bg-yellow-500 rounded-full"></div>
										</div>
										<Input
											placeholder="0.51451404"
											value={bnbAmount}
											onChange={(e) =>
												setBnbAmount(e.target.value)
											}
											className="bg-muted border-gray-100/10 text-foreground text-center text-2xl font-bold h-14 pl-12 pr-16"
										/>
										<div className="absolute right-3 top-1/2 transform -translate-y-1/2">
											<span className="text-primary font-medium">
												BNB
											</span>
										</div>
									</div>
								</div>

								{/* Position Details */}
								<div className="space-y-3 text-sm">
									<div className="flex justify-between">
										<span className="text-muted-foreground uppercase">
											Position Size (
											{extractTokenSymbol(
												tradingPair.symbol
											)}
											)
										</span>
										<span className="text-foreground">
											{(
												(parseFloat(valueUSDC || "0") *
													leverage) /
												parseFloat(
													tradingPair.price.replace(
														/[$,]/g,
														""
													)
												)
											).toFixed(6)}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground uppercase">
											Total Exposure
										</span>
										<span className="text-foreground">
											$
											{(
												parseFloat(valueUSDC || "0") *
												leverage
											).toLocaleString()}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground uppercase">
											Open Fee
										</span>
										<span className="text-foreground">
											0.1% (~$
											{(
												parseFloat(valueUSDC || "0") *
												0.001
											).toFixed(2)}
											)
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground uppercase">
											Close Fee (Applied only to profits)
										</span>
										<span className="text-foreground">
											2%
										</span>
									</div>
								</div>

								{/* Error Display */}
								{apiError && (
									<div className="p-3 bg-red-900/50 border border-destructive rounded-lg">
										<p className="text-destructive text-sm">
											{apiError}
										</p>
									</div>
								)}

								{/* Approval Success Message */}
								{isApprovalConfirmed &&
									approvalHash &&
									!needsApproval && (
										<div className="p-3 bg-green-900/50 border border-success rounded-lg">
											<p className="text-success text-sm">
												✅ USDC approval confirmed! You
												can now create positions.
												<a
													href={getEtherscanUrl(
														approvalHash
													)}
													target="_blank"
													rel="noopener noreferrer"
													className="text-primary hover:text-cyan-300 underline ml-1"
												>
													View transaction
												</a>
											</p>
										</div>
									)}

								{/* Transaction Status */}
								{hash && (
									<div className="p-3 bg-primary/5 border border-primary/30 rounded-lg">
										<p className="text-primary text-sm">
											Transaction submitted:
											<a
												href={getEtherscanUrl(hash)}
												target="_blank"
												rel="noopener noreferrer"
												className="text-primary hover:text-cyan-300 underline ml-1"
											>
												{formatTxHash(hash)}
											</a>
										</p>
										{isConfirming && (
											<p className="text-warning text-sm mt-1">
												⏳ Waiting for confirmation...
											</p>
										)}
										{isConfirmed && (
											<p className="text-success text-sm mt-1">
												✅ Position created
												successfully!
											</p>
										)}
										{error && (
											<p className="text-destructive text-sm mt-1">
												❌ Transaction failed:{" "}
												{String(error)}
											</p>
										)}
									</div>
								)}

								{/* Wallet Connection or Place Transaction */}
								{!isConnected ? (
									<div className="w-full">
										<ConnectWallet />
									</div>
								) : (
									<Button
										onClick={handlePlaceTransaction}
										disabled={
											needsApproval ||
											isCreatingPosition ||
											isPending ||
											isConfirming ||
											isApproving ||
											isApprovalConfirming
										}
										className="w-full h-12 font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{needsApproval
											? "Approve USDC First"
											: isCreatingPosition
											? "Preparing Transaction..."
											: isPending
											? "Confirm in Wallet..."
											: isConfirming
											? "Confirming..."
											: `${isLong ? "Long" : "Short"} ${
													tradingPair.symbol.split(
														"/"
													)[0]
											  }`}
									</Button>
								)}
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Positions Table */}
				<div className="mt-8">
					<div className="mb-4">
						<h2 className="text-xl font-bold text-foreground mb-2">
							Positions
							{positions.length > 0 && ` (${positions.length})`}
						</h2>
						{positions.length > 0 && (
							<div className="flex gap-4 text-sm">
								<span className="text-muted-foreground">
									Open:{" "}
									<span className="text-foreground">
										{openPositions.length}
									</span>
								</span>
								<span className="text-muted-foreground">
									Total Margin:{" "}
									<span className="text-foreground">
										${totalMargin.toFixed(2)}
									</span>
								</span>
								<span className="text-muted-foreground">
									Total PnL:{" "}
									<span
										className={
											totalPnl >= 0
												? "text-success"
												: "text-destructive"
										}
									>
										{totalPnl >= 0 ? "+" : ""}$
										{totalPnl.toFixed(2)}
									</span>
								</span>
							</div>
						)}
					</div>
					<PositionsTable
						positions={positions}
						isLoading={isLoadingPositions}
						error={positionsError}
						onRefetch={fetchUserPositions}
						tradingPairAddress={tradingPair.pairAddress}
					/>
				</div>
			</main>
		</div>
	);
}

export default function PerpPage() {
	return (
		<Suspense
			fallback={
				<div className="min-h-screen bg-black text-foreground flex items-center justify-center">
					Loading...
				</div>
			}
		>
			<PerpContent />
		</Suspense>
	);
}
