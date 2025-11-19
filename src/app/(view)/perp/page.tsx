"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAsyncFn } from "react-use";
import { formatUnits, parseUnits } from "viem";
import {
	useAccount,
	useBalance,
	useReadContract,
	useSendTransaction,
	useWaitForTransactionReceipt,
	useWriteContract,
} from "wagmi";
import { ChartSection } from "@/components/trading/ChartSection";
import { PositionsTable } from "@/components/trading/PositionsTable";
import TradingViewWidget from "@/components/trading/TradingViewWidget";
import { Button } from "@/components/ui/button";
import { ConnectWallet } from "@/components/ui/ConnectWallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserPositions } from "@/hooks/useUserPositions";
import { ERC20Abi, SyntheticPerpetualContract, usdc } from "@/lib/contracts";
import {
	formatPrice,
	formatPriceChange,
	getForexPrice,
	getStockPrice,
	getTokenPriceByPair,
} from "@/lib/oracle";
import {
	createPosition,
	extractTokenSymbol,
	formatTxHash,
	getEtherscanUrl,
	validateLeverage,
	validateMargin,
} from "@/lib/position-api";

interface TickerToken {
	symbol: string;
	priceChange24h: number;
	isLong: boolean;
	logo?: string;
}

const TickerItem = ({ token }: { token: TickerToken }) => {
	const isPositive = token.priceChange24h > 0;
	const changeStr = `${isPositive ? "+" : ""}${token.priceChange24h.toFixed(2)}%`;

	return (
		<div className="flex items-center gap-2 px-4 py-2 bg-[#001500]">
			{token.logo ? (
				<Image
					src={token.logo}
					alt={token.symbol}
					width={16}
					height={16}
					className="rounded-full border border-gray-800/70"
				/>
			) : (
				<div className="w-4 h-4 flex items-center justify-center text-sm">{token.logo || "🪙"}</div>
			)}
			<span className="text-[#818181] text-xs uppercase font-medium whitespace-nowrap">
				{token.symbol}
			</span>
			<svg
				className={`w-4 h-4 ${isPositive ? "text-[#4DAD31]" : "text-[#FF4C4C]"}`}
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<title>{isPositive ? "Long" : "Short"}</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d={isPositive ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"}
				/>
			</svg>
			<span className={`${isPositive ? "text-[#4DAD31]" : "text-[#FF4C4C]"} text-xs font-semibold`}>
				{changeStr}
			</span>
		</div>
	);
};

function PerpContent() {
	const searchParams = useSearchParams();
	const [tradingPair, setTradingPair] = useState({
		symbol: "",
		price: "",
		change: "",
		pairAddress: "",
		tokenAddress: "",
		chain: "base", // Default to base chain
		assetType: "crypto" as "crypto" | "stock" | "forex", // Track asset type
	});

	const [marketData, setMarketData] = useState<{
		priceUsd?: string;
		priceChange?: string;
		marketCap?: string;
		fdv?: string;
		liquidity?: string;
		volume24h?: string;
		volume6h?: string;
		volume1h?: string;
		txns24h?: { buys: number; sells: number };
		txns6h?: { buys: number; sells: number };
		poolCreated?: string;
		pairAddress?: string;
		tokenLogo?: string;
		baseTokenSymbol?: string;
		quoteTokenSymbol?: string;
	}>();

	const {
		positions,
		isLoading: isLoadingPositions,
		error: positionsError,
		refetch: fetchUserPositions,
		openPositions,
		totalPnl,
		totalMargin,
	} = useUserPositions();

	const { address, isConnected } = useAccount();
	const { sendTransaction, data: hash, error, isPending } = useSendTransaction();
	const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
		hash,
	});

	const { writeContract, data: approvalHash, isPending: isApproving } = useWriteContract();
	const { isLoading: isApprovalConfirming, isSuccess: isApprovalConfirmed } =
		useWaitForTransactionReceipt({
			hash: approvalHash,
		});

	const { data: ethBalance } = useBalance({
		address: address,
		query: { enabled: !!address },
	});

	const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
		address: usdc as `0x${string}`,
		abi: ERC20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: !!address },
	});

	const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
		address: usdc as `0x${string}`,
		abi: ERC20Abi,
		functionName: "allowance",
		args: address ? [address, SyntheticPerpetualContract as `0x${string}`] : undefined,
		query: { enabled: !!address },
	});

	const [isLong, setIsLong] = useState(true);
	const [valueUSDC, setValueUSDC] = useState("100");
	const [leverage, setLeverage] = useState(2);
	const [_lastTransactionHash, setLastTransactionHash] = useState<string | null>(null);
	const [needsApproval, setNeedsApproval] = useState(false);

	const maxLeverage = 2;

	// Fetch trending tokens for ticker
	const [{ value: tickerTokens }, fetchTickerData] = useAsyncFn(async () => {
		const response = await fetch("/api/trending/tokens");
		const result = await response.json();

		if (result.data && Array.isArray(result.data)) {
			const tokens: TickerToken[] = result.data
				.slice(0, 15)
				.map((token: { symbol: string; change24h?: string; logo?: string }) => {
					// Parse the percentage from change24h string (e.g., "+5.23%" -> 5.23)
					const priceChange24h = token.change24h ? parseFloat(token.change24h.replace("%", "")) : 0;
					return {
						symbol: token.symbol,
						priceChange24h,
						isLong: priceChange24h > 0,
						logo: token.logo,
					};
				});
			return tokens;
		}
		return [];
	}, []);

	// Fetch market data for the current pair
	const [{ loading: _isLoadingMarketData }, fetchMarketData] = useAsyncFn(async () => {
		if (!tradingPair.pairAddress || tradingPair.assetType !== "crypto") {
			setMarketData(undefined);
			return;
		}

		try {
			// Fetch from DexScreener API
			const response = await fetch(
				`https://api.dexscreener.com/latest/dex/pairs/${tradingPair.chain}/${tradingPair.pairAddress}`,
			);
			if (response.ok) {
				const data = await response.json();
				if (data.pair) {
					const pair = data.pair;
					setMarketData({
						priceUsd: pair.priceUsd,
						priceChange: pair.priceChange?.h24
							? `${pair.priceChange.h24 >= 0 ? "+" : ""}${pair.priceChange.h24.toFixed(2)}%`
							: undefined,
						marketCap: pair.marketCap?.toString(),
						fdv: pair.fdv?.toString(),
						liquidity: pair.liquidity?.usd?.toString(),
						volume24h: pair.volume?.h24?.toString(),
						volume6h: pair.volume?.h6?.toString(),
						volume1h: pair.volume?.h1?.toString(),
						txns24h: pair.txns?.h24
							? {
									buys: pair.txns.h24.buys || 0,
									sells: pair.txns.h24.sells || 0,
								}
							: undefined,
						txns6h: pair.txns?.h6
							? {
									buys: pair.txns.h6.buys || 0,
									sells: pair.txns.h6.sells || 0,
								}
							: undefined,
						poolCreated: pair.pairCreatedAt
							? new Date(pair.pairCreatedAt).toLocaleDateString()
							: undefined,
						tokenLogo: pair.info?.imageUrl,
						baseTokenSymbol: pair.baseToken?.symbol,
						quoteTokenSymbol: pair.quoteToken?.symbol,
					});
				}
			}
		} catch (error) {
			console.error("Error fetching market data:", error);
		}
	}, [tradingPair.pairAddress, tradingPair.chain, tradingPair.assetType]);

	const [{ loading: isLoadingPrice, value: priceData }, fetchLatestPrice] = useAsyncFn(async () => {
		if (!tradingPair.symbol && !tradingPair.pairAddress) return null;

		const assetType = tradingPair.assetType;
		const lastUpdate = new Date();

		if (assetType === "stock") {
			// Fetch stock price using price API
			const stockPrice = await getStockPrice(tradingPair.symbol);
			if (stockPrice?.success) {
				return {
					price: formatPrice(stockPrice.price),
					change: "N/A", // Stock API doesn't provide change data
					lastUpdate,
				};
			}
		} else if (assetType === "forex") {
			// Fetch forex price using price API
			const forexPrice = await getForexPrice(tradingPair.symbol);
			if (forexPrice?.success) {
				return {
					price: formatPrice(forexPrice.price),
					change: "N/A", // Forex API doesn't provide change data
					lastUpdate,
				};
			}
		} else {
			// Fetch crypto price using pair address
			if (!tradingPair.pairAddress) return null;
			const chain = tradingPair.chain || "base";
			const tokenPrice = await getTokenPriceByPair(tradingPair.pairAddress, chain);
			if (tokenPrice) {
				return {
					price: formatPrice(tokenPrice.priceUsd),
					change: tokenPrice.priceChange24h
						? formatPriceChange(tokenPrice.priceChange24h)
						: tradingPair.change,
					lastUpdate,
				};
			}
		}
		return null;
	}, [tradingPair.symbol, tradingPair.pairAddress, tradingPair.assetType, tradingPair.chain]);

	// Update tradingPair when priceData changes
	useEffect(() => {
		if (priceData) {
			setTradingPair((prev) => ({
				...prev,
				price: priceData.price,
				change: priceData.change,
			}));
		}
	}, [priceData]);

	useEffect(() => {
		const symbol = searchParams.get("symbol");
		const pairAddress = searchParams.get("pairAddress");
		const tokenAddress = searchParams.get("tokenAddress");
		const chain = searchParams.get("chain") || "base";
		const assetType = (searchParams.get("assetType") || "crypto") as "crypto" | "stock" | "forex";

		if (symbol) {
			// Format the symbol for display
			// For stocks and forex, use symbol as-is
			// For crypto, add /USDT if not already present
			const formattedSymbol =
				assetType === "crypto" ? (symbol.includes("/") ? symbol : `${symbol}/USDT`) : symbol;

			setTradingPair((prev) => ({
				...prev,
				symbol: formattedSymbol,
				pairAddress: pairAddress || prev.pairAddress,
				tokenAddress: tokenAddress || prev.tokenAddress,
				chain: chain,
				assetType: assetType,
			}));
		}
	}, [searchParams]);

	useEffect(() => {
		fetchLatestPrice();
		fetchMarketData();
	}, [fetchLatestPrice, fetchMarketData]);

	useEffect(() => {
		const interval = setInterval(() => {
			fetchLatestPrice();
			fetchMarketData();
		}, 30000); // 30 seconds

		return () => clearInterval(interval);
	}, [fetchLatestPrice, fetchMarketData]);

	// Fetch trending tokens on mount and periodically
	useEffect(() => {
		fetchTickerData();
		const interval = setInterval(fetchTickerData, 60000); // Update every minute
		return () => clearInterval(interval);
	}, [fetchTickerData]);

	useEffect(() => {
		if (usdcAllowance !== undefined && valueUSDC && parseFloat(valueUSDC) > 0) {
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
		}
	}, [isConfirmed, hash, refetchUsdcBalance, refetchAllowance]);

	useEffect(() => {
		if (isApprovalConfirmed && approvalHash) {
			// Refetch allowance after successful approval
			refetchAllowance();
		}
	}, [isApprovalConfirmed, approvalHash, refetchAllowance]);

	useEffect(() => {
		if (isConfirmed && hash && address) {
			// Wait a bit for the subgraph to index the new position
			setTimeout(() => {
				fetchUserPositions();
			}, 5000);
		}
	}, [isConfirmed, hash, address, fetchUserPositions]);

	const handleLeverageChange = (delta: number) => {
		const newLeverage = Math.max(1, Math.min(maxLeverage, leverage + delta));
		setLeverage(newLeverage);
	};

	const [{ loading: isApprovingUSDC, error: approvalError }, handleApproveUSDC] =
		useAsyncFn(async () => {
			if (!isConnected || !address) {
				throw new Error("Please connect your wallet first");
			}

			const approvalAmount = parseUnits("1000000", 6);

			writeContract({
				address: usdc as `0x${string}`,
				abi: ERC20Abi,
				functionName: "approve",
				args: [SyntheticPerpetualContract as `0x${string}`, approvalAmount],
			});
		}, [isConnected, address, writeContract]);

	// Handle place transaction
	const [{ loading: isCreatingPosition, error: transactionError }, handlePlaceTransaction] =
		useAsyncFn(async () => {
			if (!isConnected || !address) {
				throw new Error("Please connect your wallet first");
			}

			const marginValidation = validateMargin(valueUSDC);
			if (!marginValidation.valid) {
				throw new Error(marginValidation.error || "Invalid margin");
			}

			const leverageValidation = validateLeverage(leverage);
			if (!leverageValidation.valid) {
				throw new Error(leverageValidation.error || "Invalid leverage");
			}

			const tokenSymbol = extractTokenSymbol(tradingPair.symbol);

			const result = await createPosition({
				tokenSymbol,
				isLong,
				margin: valueUSDC,
				leverage,
				tokenAddress: tradingPair.tokenAddress,
				userAddress: address,
				pairAddress: tradingPair.pairAddress,
			});

			if (!result.success) {
				throw new Error(result.error || "Failed to create position");
			}

			if (result.data) {
				sendTransaction({
					to: result.data.to as `0x${string}`,
					data: result.data.data as `0x${string}`,
					value: BigInt(0),
					gas: result.data.gasEstimate ? BigInt(String(result.data.gasEstimate)) : undefined,
				});
			}
		}, [isConnected, address, valueUSDC, leverage, tradingPair, isLong, sendTransaction]);

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-4 py-8">
				<div className="mb-6 relative overflow-hidden">
					<div className="bg-neutral-700">
						<div className="flex gap-0.5 animate-scroll-ticker">
							{tickerTokens && tickerTokens.length > 0 ? (
								<>
									{tickerTokens.map((token, index) => (
										<TickerItem key={`${token.symbol}-${index}`} token={token} />
									))}
									{/* Duplicate for seamless loop */}
									{tickerTokens.map((token, index) => (
										<TickerItem key={`${token.symbol}-dup-${index}`} token={token} />
									))}
								</>
							) : (
								<div className="flex items-center gap-0.5">
									{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((id) => (
										<div
											key={`skeleton-${id}`}
											className="flex items-center gap-2 px-4 py-2 bg-[#001500]"
										>
											<Skeleton className="w-4 h-4 rounded-full" />
											<Skeleton className="h-3 w-12" />
											<Skeleton className="w-4 h-4" />
											<Skeleton className="h-3 w-16" />
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Market Info Bar - Figma Design */}
				{marketData && tradingPair.pairAddress && (
					<div className="mb-6 bg-[#0a0a0a] rounded-lg border-t border-b border-[#4D4D4D] py-4">
						<div className="flex items-center justify-start gap-8 px-6 overflow-x-auto">
							{/* Token Logo & Symbol */}
							<div className="flex items-center gap-3 min-w-fit">
								{marketData.tokenLogo && (
									<Image
										src={marketData.tokenLogo}
										alt={`${marketData.baseTokenSymbol} logo`}
										width={28}
										height={28}
										className="w-7 h-7 rounded-full"
										unoptimized
									/>
								)}
								<div>
									<div className="text-white font-medium text-sm">
										{extractTokenSymbol(tradingPair.symbol)}
									</div>
									<div className="flex items-center gap-2 mt-0.5">
										<span className="text-white text-xs">
											{marketData.baseTokenSymbol}/{marketData.quoteTokenSymbol}
										</span>
										{marketData.priceChange && (
											<span
												className={`text-xs px-1.5 py-0.5 rounded ${
													marketData.priceChange.startsWith("+")
														? "bg-[#002400] text-[#4DAD31]"
														: "bg-[#240000] text-[#FF4C4C]"
												}`}
											>
												{marketData.priceChange}
											</span>
										)}
										{marketData.priceChange && (
											<svg
												width="17"
												height="17"
												viewBox="0 0 17 17"
												fill="none"
												className={marketData.priceChange.startsWith("+") ? "" : "rotate-180"}
											>
												<title>Price Direction</title>
												<path
													fillRule="evenodd"
													clipRule="evenodd"
													d="M9.001 6.6258C8.868 6.7586 8.688 6.8332 8.5 6.8332C8.312 6.8332 8.132 6.7586 7.999 6.6258L3.992 2.6187C3.924 2.5534 3.871 2.4752 3.833 2.3888C3.796 2.3024 3.777 2.2094 3.776 2.1154C3.775 2.0213 3.793 1.9281 3.829 1.841C3.864 1.754 3.917 1.6749 3.983 1.6084C4.05 1.5419 4.129 1.4893 4.216 1.4537C4.303 1.418 4.396 1.4001 4.49 1.4009C4.584 1.4018 4.677 1.4213 4.764 1.4584C4.85 1.4955 4.928 1.5495 4.994 1.6172L8.5 5.1234L12.006 1.6172C12.14 1.4881 12.319 1.4167 12.504 1.4183C12.69 1.42 12.868 1.4945 12.999 1.6258C13.13 1.7571 13.205 1.9348 13.207 2.1205C13.208 2.3062 13.137 2.4851 13.008 2.6187L9.001 6.6258Z"
													fill="white"
												/>
											</svg>
										)}
									</div>
								</div>
							</div>

							{/* Vertical Divider */}
							<div className="h-9 w-px bg-[#4F6347]" />

							{/* 24h Volume */}
							<div className="flex flex-col gap-1 min-w-fit">
								<div className="text-[#A6A6A6] text-xs">24h Volume</div>
								<div className="text-white text-sm font-medium">
									${marketData.volume24h ? Number(marketData.volume24h).toLocaleString() : "0"}
								</div>
							</div>

							{/* Vertical Divider */}
							<div className="h-9 w-px bg-[#4F6347]" />

							{/* 6h Volume */}
							<div className="flex flex-col gap-1 min-w-fit">
								<div className="text-[#A6A6A6] text-xs">6h Volume</div>
								<div className="text-white text-sm font-medium">
									${marketData.volume6h ? Number(marketData.volume6h).toLocaleString() : "0"}
								</div>
							</div>

							{/* Vertical Divider */}
							<div className="h-9 w-px bg-[#4F6347]" />

							{/* 1h Volume */}
							<div className="flex flex-col gap-1 min-w-fit">
								<div className="text-[#A6A6A6] text-xs">1h Volume</div>
								<div className="text-white text-sm font-medium">
									${marketData.volume1h ? Number(marketData.volume1h).toLocaleString() : "0"}
								</div>
							</div>

							{/* Vertical Divider */}
							<div className="h-9 w-px bg-[#4F6347]" />

							{/* Liquidity */}
							<div className="flex flex-col gap-1 min-w-fit">
								<div className="text-[#A6A6A6] text-xs">Liquidity</div>
								<div className="text-white text-sm font-medium">
									${marketData.liquidity ? Number(marketData.liquidity).toLocaleString() : "0"}
								</div>
							</div>

							{/* Vertical Divider */}
							<div className="h-9 w-px bg-[#4F6347]" />

							{/* Market Cap */}
							{marketData.marketCap && (
								<>
									<div className="flex flex-col gap-1 min-w-fit">
										<div className="text-[#A6A6A6] text-xs">Market Cap</div>
										<div className="text-white text-sm font-medium">
											${Number(marketData.marketCap).toLocaleString()}
										</div>
									</div>
									<div className="h-9 w-px bg-[#4F6347]" />
								</>
							)}

							{/* FDV */}
							{marketData.fdv && (
								<>
									<div className="flex flex-col gap-1 min-w-fit">
										<div className="text-[#A6A6A6] text-xs">FDV</div>
										<div className="text-white text-sm font-medium">
											${Number(marketData.fdv).toLocaleString()}
										</div>
									</div>
									<div className="h-9 w-px bg-[#4F6347]" />
								</>
							)}

							{/* 24h Txns */}
							{marketData.txns24h && (
								<>
									<div className="flex flex-col gap-1 min-w-fit">
										<div className="text-[#A6A6A6] text-xs">24h Txns</div>
										<div className="flex items-center gap-2 text-sm">
											<span className="text-[#4DAD31]">{marketData.txns24h.buys}</span>
											<span className="text-[#DEDEDE]">/</span>
											<span className="text-[#FF4C4C]">{marketData.txns24h.sells}</span>
										</div>
									</div>
									<div className="h-9 w-px bg-[#4F6347]" />
								</>
							)}

							{/* 6h Txns */}
							{marketData.txns6h && (
								<div className="flex flex-col gap-1 min-w-fit">
									<div className="text-[#A6A6A6] text-xs">6h Txns</div>
									<div className="flex items-center gap-2 text-sm">
										<span className="text-[#4DAD31]">{marketData.txns6h.buys}</span>
										<span className="text-[#DEDEDE]">/</span>
										<span className="text-[#FF4C4C]">{marketData.txns6h.sells}</span>
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Trading Panel */}
					<div className="lg:col-span-2 space-y-6">
						{/* Price Chart Placeholder */}
						<Card className="bg-card border-gray-100/10">
							<CardHeader>
								<CardTitle className="text-foreground flex items-center justify-between">
									<span>{tradingPair.symbol} Perpetual</span>
									<div className="flex items-center space-x-4"></div>
								</CardTitle>
							</CardHeader>
							<CardContent>
								{tradingPair.assetType === "crypto" ? (
									<ChartSection
										pairAddress={tradingPair.pairAddress}
										chain={tradingPair.chain}
										symbol={tradingPair.symbol}
										priceData={priceData ?? undefined}
										fetchLatestPrice={fetchLatestPrice}
										isLoadingPrice={isLoadingPrice}
										marketData={marketData}
									/>
								) : (
									<div style={{ height: "500px" }}>
										<TradingViewWidget symbol={tradingPair.symbol} theme="dark" interval="D" />
									</div>
								)}
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
												<span className="text-muted-foreground">ETH:</span>
												<span className="text-foreground font-medium">
													{ethBalance
														? `${parseFloat(
																formatUnits(ethBalance.value, ethBalance.decimals),
															).toFixed(4)} ETH`
														: "0.0000 ETH"}
												</span>
											</div>
											<div className="flex justify-between items-center">
												<span className="text-muted-foreground">USDC:</span>
												<span className="text-foreground font-medium">
													{usdcBalance
														? `${parseFloat(formatUnits(BigInt(usdcBalance as string), 6)).toFixed(
																2,
															)} USDC`
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
												{needsApproval ? "Required" : "Approved"}
											</span>
										</div>

										{needsApproval ? (
											<div className="space-y-3">
												<p className="text-sm text-muted-foreground">
													Approve USDC spending to create positions
												</p>
												<Button
													onClick={handleApproveUSDC}
													disabled={isApprovingUSDC || isApproving || isApprovalConfirming}
													className="w-full h-10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
												>
													{isApprovingUSDC || isApproving
														? "Confirm in Wallet..."
														: isApprovalConfirming
															? "Confirming..."
															: "Approve USDC"}
												</Button>
											</div>
										) : (
											<div className="flex items-center space-x-2">
												<div className="w-2 h-2 bg-green-400 rounded-full"></div>
												<p className="text-sm text-success">USDC spending approved</p>
											</div>
										)}
									</div>
								)}
								{/* Value Input */}
								<div className="space-y-2">
									<div className="flex justify-between items-center">
										<label
											htmlFor="margin-input"
											className="text-sm text-primary uppercase font-medium"
										>
											Margin (USDC)
										</label>
										{valueUSDC && !validateMargin(valueUSDC).valid && (
											<span className="text-xs text-destructive">
												{validateMargin(valueUSDC).error}
											</span>
										)}
									</div>
									<div className="relative">
										<div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center">
											<div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
												<span className="text-foreground text-xs font-bold">$</span>
											</div>
										</div>
										<Input
											placeholder="100"
											value={valueUSDC}
											onChange={(e) => setValueUSDC(e.target.value)}
											className={`bg-muted border-gray-100/10 text-foreground text-center text-2xl font-bold h-14 pl-12 pr-20 ${
												valueUSDC && !validateMargin(valueUSDC).valid
													? "border-red-500 focus:border-red-500"
													: "focus:border-cyan-500"
											}`}
										/>
										<div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
											<div className="w-6 h-6 bg-gray-300 rounded"></div>
											<span className="text-primary font-medium">USDC</span>
										</div>
									</div>
								</div>
								{/* Leverage */}
								<div className="space-y-3">
									<div className="flex justify-between items-center">
										<span className="text-sm text-primary uppercase font-medium">Leverage</span>
										<span className="text-success text-lg font-bold">{leverage}x</span>
									</div>
									<div className="relative">
										<div className="flex items-center space-x-4 bg-muted rounded-lg p-4">
											<button
												type="button"
												onClick={() => handleLeverageChange(-1)}
												className="w-8 h-8 border border-primary/40 text-primary rounded-full flex items-center justify-center text-lg hover:bg-primary hover:text-black transition-colors"
											>
												-
											</button>
											<div className="flex-1 relative">
												<div className="h-2 bg-slate-700 rounded-full">
													<div
														className="h-2 bg-linear-to-r from-green-400 to-cyan-400 rounded-full"
														style={{
															width: `${((leverage - 1) / (maxLeverage - 1)) * 100}%`,
														}}
													></div>
												</div>
												<div className="flex justify-between text-xs text-muted-foreground mt-2">
													{Array.from({ length: maxLeverage }, (_, i) => i + 1).map((lev) => (
														<span
															key={lev}
															className={leverage === lev ? "text-primary font-bold" : ""}
														>
															{lev}x
														</span>
													))}
												</div>
											</div>
											<button
												type="button"
												onClick={() => handleLeverageChange(1)}
												className="w-8 h-8 border border-primary/40 text-primary rounded-full flex items-center justify-center text-lg hover:bg-primary hover:text-black transition-colors"
											>
												+
											</button>
										</div>
									</div>
								</div>{" "}
								{/* You Pay */}
								{/* Position Details */}
								<div className="space-y-3 text-sm">
									<div className="flex justify-between">
										<span className="text-muted-foreground uppercase">
											Position Size ({extractTokenSymbol(tradingPair.symbol)})
										</span>
										<span className="text-foreground">
											{(
												(parseFloat(valueUSDC || "0") * leverage) /
												parseFloat(tradingPair.price.replace(/[$,]/g, ""))
											).toFixed(6)}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground uppercase">Total Exposure</span>
										<span className="text-foreground">
											${(parseFloat(valueUSDC || "0") * leverage).toLocaleString()}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground uppercase">Open Fee</span>
										<span className="text-foreground">
											0.1% (~$
											{(parseFloat(valueUSDC || "0") * 0.001).toFixed(2)})
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground uppercase">
											Close Fee (Applied only to profits)
										</span>
										<span className="text-foreground">2%</span>
									</div>
								</div>
								{/* Error Display */}
								{(approvalError || transactionError) && (
									<div className="p-3 bg-red-900/50 border border-destructive rounded-lg">
										<p className="text-destructive text-sm">
											{approvalError?.message || transactionError?.message}
										</p>
									</div>
								)}
								{/* Approval Success Message */}
								{isApprovalConfirmed && approvalHash && !needsApproval && (
									<div className="p-3 bg-green-900/50 border border-success rounded-lg">
										<p className="text-success text-sm">
											✅ USDC approval confirmed! You can now create positions.
											<a
												href={getEtherscanUrl(approvalHash)}
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
											<p className="text-warning text-sm mt-1">⏳ Waiting for confirmation...</p>
										)}
										{isConfirmed && (
											<p className="text-success text-sm mt-1">✅ Position created successfully!</p>
										)}
										{error && (
											<p className="text-destructive text-sm mt-1">
												❌ Transaction failed: {String(error)}
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
											isApprovingUSDC ||
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
														: `${isLong ? "Long" : "Short"} ${tradingPair.symbol.split("/")[0]}`}
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
									Open: <span className="text-foreground">{openPositions.length}</span>
								</span>
								<span className="text-muted-foreground">
									Total Margin: <span className="text-foreground">${totalMargin.toFixed(2)}</span>
								</span>
								<span className="text-muted-foreground">
									Total PnL:{" "}
									<span className={totalPnl >= 0 ? "text-success" : "text-destructive"}>
										{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
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
					<div className="flex flex-col items-center gap-4">
						<Skeleton className="h-12 w-48 mb-4" />
						<Skeleton className="h-96 w-full max-w-4xl" />
					</div>
				</div>
			}
		>
			<PerpContent />
		</Suspense>
	);
}
