"use client";

import * as RadixSlider from "@radix-ui/react-slider";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function PerpContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const [didDefaultTrendingRedirect, setDidDefaultTrendingRedirect] = useState(false);
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
		baseTokenAddress?: string;
		quoteTokenAddress?: string;
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

	// dynamic margin token support: use the pair quote token as the default margin token (fallback to USDC)
	const [marginTokenAddress, setMarginTokenAddress] = useState(usdc as `0x${string}`);
	const [marginTokenSymbol, setMarginTokenSymbol] = useState("USDC");
	const [marginTokenDecimals, setMarginTokenDecimals] = useState<number>(6);

	const { data: marginBalance, refetch: refetchMarginBalance } = useReadContract({
		address: marginTokenAddress as `0x${string}`,
		abi: ERC20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: !!address && !!marginTokenAddress },
	});

	const { data: marginAllowance, refetch: refetchAllowance } = useReadContract({
		address: marginTokenAddress as `0x${string}`,
		abi: ERC20Abi,
		functionName: "allowance",
		args: address ? [address, SyntheticPerpetualContract as `0x${string}`] : undefined,
		query: { enabled: !!address && !!marginTokenAddress },
	});

	const { data: decimalsFromChain } = useReadContract({
		address: marginTokenAddress as `0x${string}`,
		abi: ERC20Abi,
		functionName: "decimals",
		args: [],
		query: { enabled: !!marginTokenAddress },
	});

	useEffect(() => {
		if (decimalsFromChain !== undefined) {
			setMarginTokenDecimals(Number(decimalsFromChain));
		}
	}, [decimalsFromChain]);

	const [isLong, setIsLong] = useState(true);
	const [marginValue, setMarginValue] = useState("0");
	const [autoSwapAndApprove, setAutoSwapAndApprove] = useState(false);
	const [leverage, setLeverage] = useState(2);
	const [_lastTransactionHash, setLastTransactionHash] = useState<string | null>(null);
	const [needsApproval, setNeedsApproval] = useState(false);

	// Compute available margin token amount from contract balance
	const decimals =
		decimalsFromChain !== undefined ? Number(decimalsFromChain) : marginTokenDecimals;
	const availableMargin = marginBalance
		? parseFloat(formatUnits(BigInt(marginBalance as string), decimals))
		: 0;

	const handleSetMaxMargin = () => {
		const maxVal = availableMargin || 0;
		setMarginValue(String(maxVal.toFixed(2)));
	};

	const maxLeverage = 100;

	// Ticker tokens are fetched via TopTicker in layout

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
						baseTokenAddress: pair.baseToken?.address,
						quoteTokenAddress: pair.quoteToken?.address,
					});
				}
			}
		} catch (error) {
			console.error("Error fetching market data:", error);
		}
	}, [tradingPair.pairAddress, tradingPair.chain, tradingPair.assetType]);

	// Update margin token address/symbol whenever marketData or tradingPair changes
	useEffect(() => {
		if (marketData?.quoteTokenAddress) {
			setMarginTokenAddress(marketData.quoteTokenAddress as `0x${string}`);
			setMarginTokenSymbol(marketData.quoteTokenSymbol || "USDC");
		} else if (tradingPair.tokenAddress) {
			setMarginTokenAddress(tradingPair.tokenAddress as `0x${string}`);
			setMarginTokenSymbol(extractTokenSymbol(tradingPair.symbol) || "USDC");
		} else {
			setMarginTokenAddress(usdc as `0x${string}`);
			setMarginTokenSymbol("USDC");
		}
	}, [marketData, tradingPair]);

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

		// If no symbol/pair/token was passed in the URL, redirect to the top performing trending token
		if (!symbol && !pairAddress && !tokenAddress && !didDefaultTrendingRedirect) {
			setDidDefaultTrendingRedirect(true);
			(async () => {
				try {
					const response = await fetch(
						"/api/trending/tokens?chain=base&limit=5&page=1&sort=change",
					);
					const data = await response.json();
					// Support both array-shaped and single object responses for backwards compatibility
					const top = Array.isArray(data?.data) ? data.data[0] : data?.data;
					if (top) {
						const params = new URLSearchParams();
						if (top.symbol) params.set("symbol", top.symbol);
						if (top.pairAddress) params.set("pairAddress", top.pairAddress);
						if (top.tokenAddress) params.set("tokenAddress", top.tokenAddress);
						params.set("chain", top.chain || "base");
						params.set("assetType", "crypto");
						router.replace(`/perp?${params.toString()}`);
						return;
					}
				} catch (err) {
					console.error("Failed to fetch top trending token for default redirect", err);
				}
			})();
		}

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
	}, [searchParams, router, didDefaultTrendingRedirect]);

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

	// Ticker logic moved to TopTicker component

	useEffect(() => {
		// only check allowance and set approval if user has entered a value AND user opted-in auto swap & approve
		if (!autoSwapAndApprove || !marginValue || parseFloat(marginValue) <= 0) {
			setNeedsApproval(false);
			return;
		}

		if (marginAllowance !== undefined && marginValue && parseFloat(marginValue) > 0) {
			const marginInWei = parseUnits(marginValue, decimals);
			const allowanceAmount = BigInt(marginAllowance as string);
			setNeedsApproval(allowanceAmount < marginInWei);
		} else if (marginAllowance !== undefined) {
			// If we have allowance data but no valid margin, assume no approval needed for now
			setNeedsApproval(false);
		} else {
			// If we don't have allowance data yet, assume approval is needed
			setNeedsApproval(true);
		}
	}, [marginAllowance, marginValue, autoSwapAndApprove, decimals]);

	useEffect(() => {
		if (!isConnected) {
			setNeedsApproval(false);
		}
	}, [isConnected]);

	useEffect(() => {
		if (isConfirmed && hash) {
			setLastTransactionHash(hash);
			// Refetch balances after successful transaction
			refetchMarginBalance();
			refetchAllowance();
		}
	}, [isConfirmed, hash, refetchMarginBalance, refetchAllowance]);

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

	const setLeverageValue = (value: number) => {
		const newLeverage = Math.max(1, Math.min(maxLeverage, value));
		setLeverage(newLeverage);
	};

	const [{ loading: isApprovingToken, error: approvalError }, handleApproveToken] =
		useAsyncFn(async () => {
			if (!isConnected || !address) {
				throw new Error("Please connect your wallet first");
			}

			const approvalAmount = parseUnits("1000000", decimals);

			writeContract({
				address: marginTokenAddress as `0x${string}`,
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

			const marginValidation = validateMargin(marginValue);
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
				margin: marginValue,
				leverage,
				tokenAddress: tradingPair.tokenAddress,
				marginTokenAddress: marginTokenAddress,
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
		}, [isConnected, address, marginValue, leverage, tradingPair, isLong, sendTransaction]);

	return (
		<>
			{marketData && tradingPair.pairAddress && (
				<div className="border-b border-[#4D4D4D]/40 py-4">
					<div className="flex items-center justify-start gap-8 px-6 overflow-x-auto">
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
								{/* <div className="text-white font-medium text-sm">
									{extractTokenSymbol(tradingPair.symbol)}
								</div> */}
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

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">24h Volume</div>
							<div className="text-white text-sm font-medium">
								${marketData.volume24h ? Number(marketData.volume24h).toLocaleString() : "0"}
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">6h Volume</div>
							<div className="text-white text-sm font-medium">
								${marketData.volume6h ? Number(marketData.volume6h).toLocaleString() : "0"}
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">1h Volume</div>
							<div className="text-white text-sm font-medium">
								${marketData.volume1h ? Number(marketData.volume1h).toLocaleString() : "0"}
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">Liquidity</div>
							<div className="text-white text-sm font-medium">
								${marketData.liquidity ? Number(marketData.liquidity).toLocaleString() : "0"}
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

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

			<div className="grid grid-cols-1 lg:grid-cols-3 border-b border-r border-l border-[#4D4D4D]/40">
				<div className="lg:col-span-2">
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
				</div>

				<div className="flex flex-col gap-4 border-l border-[#4D4D4D]/40">
					<div className="flex items-center justify-between px-2">
						<Tabs
							value={isLong ? "long" : "short"}
							onValueChange={(value) => setIsLong(value === "long")}
							className="w-full"
						>
							<TabsList className="grid grid-cols-2 gap-0 bg-transparent p-0 w-full rounded-none border-0">
								<TabsTrigger
									value="long"
									className={`font-medium text-sm transition-all rounded-none border-0 bg-transparent text-[#818181] hover:text-[#bdbdbd] data-[state=active]:bg-transparent data-[state=active]:text-[#4DAD31] data-[state=active]:border-b-2 data-[state=active]:border-green-500 py-4`}
								>
									Long
								</TabsTrigger>
								<TabsTrigger
									value="short"
									className={`font-medium text-sm transition-all rounded-none border-0 bg-transparent text-[#818181] hover:text-[#bdbdbd] data-[state=active]:bg-transparent data-[state=active]:text-[#FF4C4C] data-[state=active]:border-b-2 data-[state=active]:border-red-500`}
								>
									Short
								</TabsTrigger>
							</TabsList>
						</Tabs>
					</div>
					<div className="p-4">
						{isConnected && needsApproval && autoSwapAndApprove && (
							<div className="bg-muted p-4 rounded-lg">
								<h4 className="text-sm text-muted-foreground uppercase font-medium mb-3">
									Wallet Balance
								</h4>
								<div className="space-y-2">
									<div className="flex justify-between items-center">
										<span className="text-muted-foreground">ETH:</span>
										<span className="text-foreground font-medium">
											{ethBalance
												? `${parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(
														4,
													)} ETH`
												: "0.0000 ETH"}
										</span>
									</div>
									<div className="flex justify-between items-center">
										<span className="text-muted-foreground">{marginTokenSymbol}:</span>
										<span className="text-foreground font-medium">
											{marginBalance
												? `${parseFloat(
														formatUnits(BigInt(marginBalance as string), decimals),
													).toFixed(Math.min(6, decimals))} ${marginTokenSymbol}`
												: `0.00 ${marginTokenSymbol}`}
										</span>
									</div>
								</div>
							</div>
						)}
						{isConnected && needsApproval && (
							<div className="bg-muted p-4 rounded-lg">
								<div className="flex justify-between items-center mb-3">
									<h4 className="text-sm text-muted-foreground uppercase font-medium">
										{marginTokenSymbol} Approval
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
											Approve {marginTokenSymbol} spending to create positions
										</p>
										<Button
											onClick={handleApproveToken}
											disabled={
												isApprovingToken ||
												isApproving ||
												isApprovalConfirming ||
												!marginValue ||
												parseFloat(marginValue) <= 0
											}
											className="w-full h-10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{isApprovingToken || isApproving
												? "Confirm in Wallet..."
												: isApprovalConfirming
													? "Confirming..."
													: `Approve ${marginTokenSymbol}`}
										</Button>
									</div>
								) : (
									<div className="flex items-center space-x-2">
										<div className="w-2 h-2 bg-green-400 rounded-full"></div>
										<p className="text-sm text-success">{marginTokenSymbol} spending approved</p>
									</div>
								)}
							</div>
						)}
						{!needsApproval && (
							<>
								<div className="space-y-2">
									<div className="flex justify-between items-center">
										<label
											htmlFor="margin-input"
											className="text-sm text-primary uppercase font-medium"
										>
											Margin ({marginTokenSymbol})
										</label>
										<div className="flex items-center gap-3">
											<span className="text-xs text-muted-foreground">{`Available: ${parseFloat(
												formatUnits(BigInt((marginBalance as string) || "0"), decimals),
											).toFixed(Math.min(6, decimals))} ${marginTokenSymbol}`}</span>
											{marginValue && !validateMargin(marginValue).valid && (
												<span className="text-xs text-destructive">
													{validateMargin(marginValue).error}
												</span>
											)}
										</div>
									</div>
									<div className="relative">
										<div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center">
											<div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
												<span className="text-foreground text-xs font-bold">$</span>
											</div>
										</div>
										<Input
											placeholder="100"
											id="margin-input"
											value={marginValue}
											onChange={(e) => setMarginValue(e.target.value)}
											className={`bg-muted border-gray-100/10 text-foreground text-center text-2xl font-bold h-14 pl-12 pr-20 ${
												marginValue && !validateMargin(marginValue).valid
													? "border-red-500 focus:border-red-500"
													: "focus:border-cyan-500"
											}`}
										/>
										<div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
											<button
												type="button"
												onClick={handleSetMaxMargin}
												className="text-xs px-2 py-1 bg-primary/10 border border-primary/30 rounded text-primary hover:bg-primary/20"
											>
												MAX
											</button>
											<span className="text-primary font-medium">{marginTokenSymbol}</span>
										</div>
									</div>
								</div>
								<div className="space-y-3">
									<div className="flex justify-between items-center">
										<span className="text-sm text-primary uppercase font-medium">Leverage</span>
										<span className="text-success text-lg font-bold">{leverage}x</span>
									</div>
									<div className="relative">
										<div className="flex items-center bg-muted rounded-lg p-4">
											<div className="flex-1 relative w-full">
												<div className="w-full">
													<RadixSlider.Root
														className="relative flex items-center select-none touch-none w-full h-6"
														value={[leverage]}
														min={1}
														max={maxLeverage}
														step={1}
														onValueChange={(v: number[]) => setLeverageValue(v[0])}
														aria-label="Leverage"
													>
														<RadixSlider.Track className="relative bg-slate-700 h-2 rounded-full w-full">
															<RadixSlider.Range className="absolute h-2 bg-linear-to-r from-green-400 to-cyan-400 rounded-full" />
														</RadixSlider.Track>
														<RadixSlider.Thumb className="block w-4 h-4 bg-white rounded-full shadow border border-gray-200" />
													</RadixSlider.Root>
												</div>
												<div className="flex justify-between text-xs text-muted-foreground mt-2">
													{[1, 5, 10, 25, 50, maxLeverage].map((lev) => (
														<span
															key={lev}
															className={leverage === lev ? "text-primary font-bold" : ""}
														>
															{lev}x
														</span>
													))}
												</div>
											</div>
										</div>
									</div>
								</div>
								<div className="space-y-3 text-sm">
									<div className="flex justify-between">
										<span
											className="text-muted-foreground uppercase"
											title="Estimated position size at current price"
										>
											Position Size ({extractTokenSymbol(tradingPair.symbol)})
										</span>
										<span className="text-foreground">
											{(
												(parseFloat(marginValue || "0") * leverage) /
												parseFloat(tradingPair.price.replace(/[$,]/g, ""))
											).toFixed(6)}
										</span>
									</div>
									<div className="flex justify-between">
										<span
											className="text-muted-foreground uppercase"
											title="Total exposure equals margin times leverage"
										>
											Total Exposure
										</span>
										<span className="text-foreground">
											${(parseFloat(marginValue || "0") * leverage).toLocaleString()}
										</span>
									</div>
									<div className="flex justify-between">
										<span
											className="text-muted-foreground uppercase"
											title="Fee charged when opening a position"
										>
											Open Fee
										</span>
										<span className="text-foreground">
											0.1% (~$
											{(parseFloat(marginValue || "0") * 0.001).toFixed(2)})
										</span>
									</div>
									<div className="flex justify-between">
										<span
											className="text-muted-foreground uppercase"
											title="Fee charged on closing, applied to profits only"
										>
											Close Fee (Applied only to profits)
										</span>
										<span className="text-foreground">2%</span>
									</div>
								</div>
								{(approvalError || transactionError) && (
									<div className="p-3 bg-red-900/50 border border-destructive rounded-lg">
										<p className="text-destructive text-sm">
											{approvalError?.message || transactionError?.message}
										</p>
									</div>
								)}
								{isApprovalConfirmed && approvalHash && !needsApproval && (
									<div className="p-3 bg-green-900/50 border border-success rounded-lg">
										<p className="text-success text-sm">
											✅ {marginTokenSymbol} approval confirmed! You can now create positions.
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
								<div className="w-full mt-4">
									<div className="flex items-center gap-3 mb-4">
										<input
											id="auto-swap-approve"
											type="checkbox"
											checked={autoSwapAndApprove}
											onChange={(e) => setAutoSwapAndApprove(e.target.checked)}
											className="w-4 h-4 rounded border bg-muted"
										/>
										<label htmlFor="auto-swap-approve" className="text-xs text-muted-foreground">
											Auto swap & approve
										</label>
									</div>
									<ConnectWallet
										disabled={
											needsApproval ||
											isCreatingPosition ||
											isPending ||
											isConfirming ||
											isApprovingToken ||
											isApproving ||
											isApprovalConfirming
										}
										onClick={handlePlaceTransaction}
										className={
											!isLong ? "bg-linear-to-r from-red-600 via-red-700 to-red-900" : undefined
										}
										connectedNode={
											needsApproval
												? `Approve ${marginTokenSymbol} First`
												: isCreatingPosition
													? "Preparing Transaction..."
													: isPending
														? "Confirm in Wallet..."
														: isConfirming
															? "Confirming..."
															: `${isLong ? "Long" : "Short"} ${tradingPair.symbol.split("/")[0]}`
										}
									/>
								</div>
							</>
						)}
					</div>
				</div>
			</div>

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
		</>
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
