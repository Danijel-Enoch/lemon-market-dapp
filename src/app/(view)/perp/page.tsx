import * as RadixSlider from "@radix-ui/react-slider";
import { Search, TrendingDown, TrendingUp } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useAsyncFn from "react-use/lib/useAsyncFn";
import { formatUnits, parseUnits } from "viem";
import {
	useBalance,
	useConnection,
	useReadContract,
	useSendTransaction,
	useWaitForTransactionReceipt,
	useWriteContract
} from "wagmi";
import { ChartSection } from "@/components/trading/ChartSection";
import { PositionsTable } from "@/components/trading/PositionsTable";
import TradingViewWidget from "@/components/trading/TradingViewWidget";
import { Button } from "@/components/ui/button";
import { ConnectWallet } from "@/components/ui/ConnectWallet";
import { Input } from "@/components/ui/input";
import { SearchModal } from "@/components/ui/SearchModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMarketData } from "@/hooks/useMarketData";
import { fetchTokensTrending } from "@/hooks/useTrending";
import { useUserPositions } from "@/hooks/useUserPositions";
import { ERC20Abi, SyntheticPerpetualContract, usdc } from "@/lib/contracts";
import { formatPrice, getForexPrice, getStockPrice } from "@/lib/oracle";
import {
	extractTokenSymbol,
	formatTxHash,
	getEtherscanUrl,
	validateLeverage,
	validateMargin
} from "@/lib/position-api";
import type { Metadata } from "@/lib/types";
import { useMarketApi } from "@/lib/useMarketApi";
import { referralService } from "@/lib/referral-service";

const miniAppEmbed = {
	version: "1",
	imageUrl: "https://demo.lemonmarkets.xyz/image/trading-icon.svg",
	button: {
		title: "Trade Perpetuals",
		action: {
			type: "launch_miniapp",
			name: "Lemon Markets - Perpetuals",
			url: "https://demo.lemonmarkets.xyz/perp",
			splashImageUrl: "https://demo.lemonmarkets.xyz/image/logo.png",
			splashBackgroundColor: "#000000"
		}
	}
};

export const metadata: Metadata = {
	title: "Perpetuals Trading - Lemon Markets",
	description: "Trade perpetual futures with leverage on Lemon Markets",
	other: {
		"fc:miniapp": JSON.stringify(miniAppEmbed),
		"fc:frame": JSON.stringify(miniAppEmbed)
	},
	openGraph: {
		title: "Perpetuals Trading - Lemon Markets",
		description: "Trade perpetual futures with leverage",
		images: ["https://demo.lemonmarkets.xyz/image/trading-icon.svg"]
	}
};

const DEFAULT_REFERRER_ADDRESS = "0x273d6779DDFa7e942F6b87c420e4072F4468f1cB";

function PerpContent() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const [didDefaultTrendingRedirect, setDidDefaultTrendingRedirect] =
		useState(false);
	const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
	const [tradingPair, setTradingPair] = useState({
		symbol: "",
		price: "",
		change: "",
		pairAddress: "",
		tokenAddress: "",
		chain: "base", // Default to base chain
		assetType: "crypto" as "crypto" | "stock" | "forex" // Track asset type
	});

	const {
		positions,
		isLoading: isLoadingPositions,
		error: positionsError,
		refetch: fetchUserPositions,
		openPositions,
		totalPnl,
		totalMargin
	} = useUserPositions();

	const marketApi = useMarketApi();

	const { address, isConnected } = useConnection();
	const { mutate, data: hash, error, isPending } = useSendTransaction();
	const { isLoading: isConfirming, isSuccess: isConfirmed } =
		useWaitForTransactionReceipt({
			hash
		});

	const {
		mutate: writeContract,
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

	// dynamic margin token support: use the pair quote token as the default margin token (fallback to USDC)
	const [marginTokenAddress, setMarginTokenAddress] = useState(
		usdc as `0x${string}`
	);
	const [marginTokenSymbol, setMarginTokenSymbol] = useState("USDC");
	const [marginTokenDecimals, setMarginTokenDecimals] = useState<number>(6);
	const [marginTokenPriceUsd, setMarginTokenPriceUsd] = useState<
		number | null
	>(null);
	const [marginTokenLogo, setMarginTokenLogo] = useState<string | null>(null);

	const { data: marginBalance, refetch: refetchMarginBalance } =
		useReadContract({
			address: marginTokenAddress as `0x${string}`,
			abi: ERC20Abi,
			functionName: "balanceOf",
			args: address ? [address] : undefined,
			query: { enabled: !!address && !!marginTokenAddress }
		});

	const { data: marginAllowance, refetch: refetchAllowance } =
		useReadContract({
			address: marginTokenAddress as `0x${string}`,
			abi: ERC20Abi,
			functionName: "allowance",
			args: address
				? [address, SyntheticPerpetualContract as `0x${string}`]
				: undefined,
			query: { enabled: !!address && !!marginTokenAddress }
		});

	const { data: decimalsFromChain } = useReadContract({
		address: marginTokenAddress as `0x${string}`,
		abi: ERC20Abi,
		functionName: "decimals",
		args: [],
		query: { enabled: !!marginTokenAddress }
	});

	const [isLong, setIsLong] = useState(true);
	const [marginValue, setMarginValue] = useState("");
	const [autoSwapAndApprove, setAutoSwapAndApprove] = useState(false);
	const [leverage, setLeverage] = useState(2);
	const [chartType, setChartType] = useState<"dexscreener" | "beta">(
		"dexscreener"
	);
	const [_lastTransactionHash, setLastTransactionHash] = useState<
		string | null
	>(null);
	const [needsApproval, setNeedsApproval] = useState(false);
	const [referrerAddress, setReferrerAddress] = useState<string>(
		DEFAULT_REFERRER_ADDRESS
	);

	// Compute available margin token amount from contract balance
	const decimals =
		decimalsFromChain !== undefined
			? Number(decimalsFromChain)
			: marginTokenDecimals;
	const availableMargin = marginBalance
		? parseFloat(formatUnits(BigInt(marginBalance as string), decimals))
		: 0;
	const availableMarginUsd =
		Number.isFinite(Number(availableMargin)) && marginTokenPriceUsd
			? availableMargin * (marginTokenPriceUsd || 0)
			: 0;

	const handleSetMaxMargin = () => {
		const maxVal = availableMargin || 0;
		setMarginValue(String(maxVal.toFixed(2)));
	};

	const maxLeverage = 100;

	// Ticker tokens are fetched via TopTicker in layout

	const { marketData, refetch: fetchMarketData } = useMarketData(
		tradingPair.assetType === "crypto" ? tradingPair.chain : "base",
		tradingPair.assetType === "crypto"
			? tradingPair.pairAddress
			: searchParams.get("pairAddress") ?? ""
	);

	useEffect(() => {
		if (decimalsFromChain !== undefined) {
			setMarginTokenDecimals(Number(decimalsFromChain));
		}
	}, [decimalsFromChain]);

	// Fetch user's referrer address, fallback to default if not found
	useEffect(() => {
		let cancelled = false;
		async function fetchReferrer() {
			if (!address) {
				return;
			}

			try {
				const data = await referralService.getReferrer(address);

				if (!cancelled) {
					if (data.success && data.referrer?.address) {
						setReferrerAddress(data.referrer.address);
					}
				}
			} catch (err) {
				console.error("Error fetching referrer:", err);
			}
		}
		fetchReferrer();
		return () => {
			cancelled = true;
		};
	}, [address]);

	// Set chart type based on asset type
	useEffect(() => {
		if (tradingPair.assetType !== "crypto") {
			setChartType("beta");
		}
	}, [tradingPair.assetType]);

	// Update margin token address/symbol whenever marketData or tradingPair changes
	useEffect(() => {
		if (marketData?.quoteTokenAddress) {
			//setMarginTokenAddress(marketData.quoteTokenAddress as `0x${string}`);
			setMarginTokenSymbol(marketData.quoteTokenSymbol || "USDC");
		} else if (tradingPair.tokenAddress) {
			//setMarginTokenAddress(tradingPair.tokenAddress as `0x${string}`);
			setMarginTokenSymbol(
				extractTokenSymbol(tradingPair.symbol) || "USDC"
			);
		} else {
			//setMarginTokenAddress(usdc as `0x${string}`);
			setMarginTokenSymbol("USDC");
		}
	}, [marketData, tradingPair]);

	// Fetch margin token USD price whenever marginTokenAddress changes
	useEffect(() => {
		let cancelled = false;
		async function fetchMarginTokenPrice() {
			if (!marginTokenAddress) {
				setMarginTokenPriceUsd(null);
				return;
			}
			try {
				const res = await fetch(
					`/api/price/token?tokenAddress=${marginTokenAddress}&chain=${
						tradingPair.chain || "base"
					}`
				);
				if (res.ok) {
					const data = await res.json();
					if (!cancelled) {
						setMarginTokenPriceUsd(Number(data.priceUsd || null));
					}
				}
			} catch {
				if (!cancelled) setMarginTokenPriceUsd(null);
			}
		}
		fetchMarginTokenPrice();

		const interval = setInterval(fetchMarginTokenPrice, 30000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [marginTokenAddress, tradingPair.chain]);

	// Fetch margin token logo. Prefer logos from the marketData (quote/base) when possible,
	// otherwise query DexScreener tokens endpoint for metadata
	useEffect(() => {
		let cancelled = false;
		async function fetchMarginTokenLogo() {
			if (!marginTokenAddress) {
				setMarginTokenLogo(null);
				return;
			}

			// Prefer logos already found in marketData
			if (
				marketData?.quoteTokenAddress &&
				marketData.quoteTokenAddress === marginTokenAddress
			) {
				setMarginTokenLogo(marketData.quoteTokenLogo || null);
				return;
			}
			if (
				marketData?.baseTokenAddress &&
				marketData.baseTokenAddress === marginTokenAddress
			) {
				setMarginTokenLogo(marketData.baseTokenLogo || null);
				return;
			}

			try {
				const chainParam = tradingPair.chain || "base";
				const resp = await fetch(
					`https://api.dexscreener.com/latest/dex/tokens/${chainParam}/${marginTokenAddress}`
				);
				if (!resp.ok) {
					if (!cancelled) setMarginTokenLogo(null);
					return;
				}
				const json = await resp.json();
				const firstPair = json.pairs?.[0] || json.pair || null;
				const tokenLogoFound =
					firstPair?.baseToken?.logo ||
					firstPair?.info?.imageUrl ||
					json?.info?.imageUrl ||
					null;
				if (!cancelled) setMarginTokenLogo(tokenLogoFound || null);
			} catch {
				if (!cancelled) setMarginTokenLogo(null);
			}
		}
		fetchMarginTokenLogo();
		return () => {
			cancelled = true;
		};
	}, [marginTokenAddress, marketData, tradingPair.chain]);

	const [{ loading: isLoadingPrice, value: priceData }, fetchLatestPrice] =
		useAsyncFn(async () => {
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
						lastUpdate
					};
				}
			} else if (assetType === "forex") {
				// Fetch forex price using price API
				const forexPrice = await getForexPrice(tradingPair.symbol);
				if (forexPrice?.success) {
					return {
						price: formatPrice(forexPrice.price),
						change: "N/A", // Forex API doesn't provide change data
						lastUpdate
					};
				}
			}
			// For crypto, we now rely on useMarketData to avoid double fetching
			return null;
		}, [
			tradingPair.symbol,
			tradingPair.pairAddress,
			tradingPair.assetType,
			tradingPair.chain
		]);

	// Update tradingPair when priceData changes (for stocks/forex) or marketData changes (for crypto)
	useEffect(() => {
		if (tradingPair.assetType === "crypto" && marketData) {
			setTradingPair((prev) => ({
				...prev,
				price: marketData.priceUsd
					? formatPrice(parseFloat(marketData.priceUsd))
					: prev.price,
				change: marketData.priceChange || prev.change
			}));
		} else if (priceData) {
			setTradingPair((prev) => ({
				...prev,
				price: priceData.price,
				change: priceData.change
			}));
		}
	}, [priceData, marketData, tradingPair.assetType]);

	useEffect(() => {
		const symbol = searchParams.get("symbol");
		const pairAddress = searchParams.get("pairAddress");
		const tokenAddress = searchParams.get("tokenAddress");
		const chain = searchParams.get("chain") || "base";
		const assetType = (searchParams.get("assetType") || "crypto") as
			| "crypto"
			| "stock"
			| "forex";

		// If no symbol/pair/token was passed in the URL, redirect to the top performing trending token
		if (
			!symbol &&
			!pairAddress &&
			!tokenAddress &&
			!didDefaultTrendingRedirect
		) {
			setDidDefaultTrendingRedirect(true);
			(async () => {
				try {
					const data = await fetchTokensTrending({
						limit: 5,
						page: 1,
						chain: "base",
						sort: "change"
					});
					// Support both array-shaped and single object responses for backwards compatibility
					const top = Array.isArray(data?.data)
						? data.data[0]
						: data?.data;
					if (top) {
						const params = new URLSearchParams();
						const token =
							top as import("@/hooks/useTrending").TokenItem;
						if (token.symbol) params.set("symbol", token.symbol);
						if (token.pairAddress)
							params.set("pairAddress", token.pairAddress);
						if (token.tokenAddress)
							params.set("tokenAddress", token.tokenAddress);
						params.set("chain", token.chain || "base");
						params.set("assetType", "crypto");
						navigate(`/perp?${params.toString()}`, {
							replace: true
						});
						return;
					}
				} catch {}
			})();
		}

		if (symbol) {
			// Format the symbol for display
			// For stocks and forex, use symbol as-is
			// For crypto, add /USDT if not already present
			const formattedSymbol =
				assetType === "crypto"
					? symbol.includes("/")
						? symbol
						: `${symbol}/USDT`
					: symbol;

			setTradingPair((prev) => ({
				...prev,
				symbol: formattedSymbol,
				pairAddress: pairAddress || prev.pairAddress,
				tokenAddress: tokenAddress || prev.tokenAddress,
				chain: chain,
				assetType: assetType
			}));
		}
	}, [searchParams, navigate, didDefaultTrendingRedirect]);

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
		if (
			!autoSwapAndApprove ||
			!marginValue ||
			parseFloat(marginValue) <= 0
		) {
			setNeedsApproval(false);
			return;
		}

		if (
			marginAllowance !== undefined &&
			marginValue &&
			parseFloat(marginValue) > 0
		) {
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

	const [
		{ loading: isApprovingToken, error: approvalError },
		handleApproveToken
	] = useAsyncFn(async () => {
		if (!isConnected || !address) {
			throw new Error("Please connect your wallet first");
		}

		const approvalAmount = parseUnits("1000000", decimals);

		writeContract({
			address: marginTokenAddress as `0x${string}`,
			abi: ERC20Abi,
			functionName: "approve",
			args: [SyntheticPerpetualContract as `0x${string}`, approvalAmount]
		});
	}, [isConnected, address, writeContract]);

	// Handle place transaction
	const [
		{ loading: isCreatingPosition, error: transactionError },
		handlePlaceTransaction
	] = useAsyncFn(async () => {
		if (!isConnected || !address) {
			throw new Error("Please connect your wallet first");
		}

		if (tradingPair.assetType !== "crypto") {
			throw new Error(
				"Trading is currently only available for crypto assets"
			);
		}

		// Convert margin token amount to USD for validation (if price available)
		const marginUsdForValidation = marginTokenPriceUsd
			? String(parseFloat(marginValue || "0") * marginTokenPriceUsd)
			: marginValue;
		const marginValidation = validateMargin(marginUsdForValidation);
		if (!marginValidation.valid) {
			throw new Error(marginValidation.error || "Invalid margin");
		}

		const leverageValidation = validateLeverage(leverage);
		if (!leverageValidation.valid) {
			throw new Error(leverageValidation.error || "Invalid leverage");
		}

		const tokenSymbol = extractTokenSymbol(tradingPair.symbol)
			.toUpperCase()
			.replace(" ", "");
		const tokenAddress = tradingPair.tokenAddress;
		const chainName = tradingPair.chain || "base";

		// Market ID format: "{Token Symbol in uppercase}-{Token Contract Address}-{currentChain Name}"
		const marketId = `${tokenSymbol}-${tokenAddress}-${chainName}`;
		//console.log("referrerAddress:", referrerAddress);
		const result = await marketApi.positions.open({
			marketId,
			isLong,
			margin: marginValue,
			leverage,
			userAddress: address,
			referrer: referrerAddress
		});

		if (!result) {
			throw new Error("Failed to create position");
		}

		// Check for API error response
		if (typeof result === "object" && "error" in result && result.error) {
			throw new Error(
				typeof result.error === "string"
					? result.error
					: "Failed to create position"
			);
		}

		if (
			typeof result === "object" &&
			"success" in result &&
			result.success === false
		) {
			throw new Error("Failed to create position");
		}

		let txResult = result as {
			to?: string;
			data?: string;
			gasEstimate?: number;
		};

		// Handle case where tx data is nested in 'data' property
		if (
			"data" in txResult &&
			typeof txResult.data === "object" &&
			txResult.data !== null
		) {
			const nestedData = txResult.data as {
				to?: string;
				data?: string;
				gasEstimate?: number;
			};
			if (nestedData.to && nestedData.data) {
				txResult = nestedData;
			}
		}

		if (!txResult.to || !txResult.data) {
			//console.error("Invalid transaction data received:", result);
			throw new Error("Received invalid transaction data from API");
		}

		mutate({
			to: txResult.to as `0x${string}`,
			data: txResult.data as `0x${string}`,
			value: BigInt(0),
			gas: txResult.gasEstimate
				? BigInt(String(txResult.gasEstimate))
				: undefined
		});
	}, [
		isConnected,
		address,
		marginValue,
		leverage,
		tradingPair,
		isLong,
		mutate,
		marginTokenPriceUsd,
		referrerAddress
	]);

	return (
		<>
			{marketData && tradingPair.pairAddress ? (
				<div className="border-b border-[#4D4D4D]/40 py-4">
					<div className="flex items-center justify-start gap-8 px-6 overflow-x-auto">
						<div className="flex items-center gap-3 min-w-fit">
							{marketData.tokenLogo &&
								(marketData.tokenLogo.startsWith("http") ||
									marketData.tokenLogo.startsWith("/")) && (
									<img
										src={marketData.tokenLogo}
										alt={`${marketData.baseTokenSymbol} logo`}
										className="w-7 h-7 rounded-full"
										onError={(e) => {
											e.currentTarget.style.display =
												"none";
										}}
									/>
								)}
							<div>
								{/* <div className="text-white font-medium text-sm">
									{extractTokenSymbol(tradingPair.symbol)}
								</div> */}
								<div className="flex items-center gap-2 mt-0.5">
									<button
										type="button"
										className="text-white text-xs cursor-pointer hover:text-gray-300"
										onClick={() =>
											setIsSearchModalOpen(true)
										}
									>
										{marketData.baseTokenSymbol}/
										{marketData.quoteTokenSymbol}
									</button>
									{marketData.priceChange && (
										<span
											className={`text-xs px-1.5 py-0.5 rounded ${
												marketData.priceChange.startsWith(
													"+"
												)
													? "bg-[#002400] text-[#4DAD31]"
													: "bg-[#240000] text-[#FF4C4C]"
											}`}
										>
											{marketData.priceChange}
										</span>
									)}
									<Search
										className="w-4 h-4 text-white cursor-pointer hover:text-gray-300"
										onClick={() =>
											setIsSearchModalOpen(true)
										}
									/>
								</div>
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								24h Volume
							</div>
							<div className="text-white text-sm font-medium">
								{tradingPair.assetType === "crypto"
									? `$${
											marketData?.volume24h
												? Number(
														marketData.volume24h
												  ).toLocaleString()
												: "0"
									  }`
									: "N/A"}
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								6h Volume
							</div>
							<div className="text-white text-sm font-medium">
								{tradingPair.assetType === "crypto"
									? `$${
											marketData?.volume6h
												? Number(
														marketData.volume6h
												  ).toLocaleString()
												: "0"
									  }`
									: "N/A"}
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								1h Volume
							</div>
							<div className="text-white text-sm font-medium">
								{tradingPair.assetType === "crypto"
									? `$${
											marketData?.volume1h
												? Number(
														marketData.volume1h
												  ).toLocaleString()
												: "0"
									  }`
									: "N/A"}
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								Liquidity
							</div>
							<div className="text-white text-sm font-medium">
								{tradingPair.assetType === "crypto"
									? `$${
											marketData?.liquidity
												? Number(
														marketData.liquidity
												  ).toLocaleString()
												: "0"
									  }`
									: "N/A"}
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						{marketData.marketCap && (
							<>
								<div className="flex flex-col gap-1 min-w-fit">
									<div className="text-[#A6A6A6] text-xs">
										Market Cap
									</div>
									<div className="text-white text-sm font-medium">
										$
										{Number(
											marketData.marketCap
										).toLocaleString()}
									</div>
								</div>
								<div className="h-9 w-px bg-[#4F6347]" />
							</>
						)}

						{marketData.fdv && (
							<>
								<div className="flex flex-col gap-1 min-w-fit">
									<div className="text-[#A6A6A6] text-xs">
										FDV
									</div>
									<div className="text-white text-sm font-medium">
										$
										{Number(
											marketData.fdv
										).toLocaleString()}
									</div>
								</div>
								<div className="h-9 w-px bg-[#4F6347]" />
							</>
						)}

						{marketData.txns24h && (
							<>
								<div className="flex flex-col gap-1 min-w-fit">
									<div className="text-[#A6A6A6] text-xs">
										24h Txns
									</div>
									<div className="flex items-center gap-2 text-sm">
										<span className="text-[#4DAD31]">
											{marketData.txns24h.buys}
										</span>
										<span className="text-[#DEDEDE]">
											/
										</span>
										<span className="text-[#FF4C4C]">
											{marketData.txns24h.sells}
										</span>
									</div>
								</div>
								<div className="h-9 w-px bg-[#4F6347]" />
							</>
						)}

						{marketData.txns6h && (
							<div className="flex flex-col gap-1 min-w-fit">
								<div className="text-[#A6A6A6] text-xs">
									6h Txns
								</div>
								<div className="flex items-center gap-2 text-sm">
									<span className="text-[#4DAD31]">
										{marketData.txns6h.buys}
									</span>
									<span className="text-[#DEDEDE]">/</span>
									<span className="text-[#FF4C4C]">
										{marketData.txns6h.sells}
									</span>
								</div>
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="border-b border-[#4D4D4D]/40 py-4">
					<div className="flex items-center justify-start gap-8 px-6 overflow-x-auto">
						<div className="flex items-center gap-3 min-w-fit">
							<Skeleton className="w-7 h-7 rounded-full" />
							<div>
								<div className="flex items-center gap-2 mt-0.5">
									<Skeleton className="h-4 w-20" />
									<Skeleton className="h-4 w-12" />
								</div>
							</div>
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								24h Volume
							</div>
							<Skeleton className="h-5 w-16" />
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								6h Volume
							</div>
							<Skeleton className="h-5 w-16" />
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								1h Volume
							</div>
							<Skeleton className="h-5 w-16" />
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								Liquidity
							</div>
							<Skeleton className="h-5 w-16" />
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								Market Cap
							</div>
							<Skeleton className="h-5 w-16" />
						</div>

						<div className="h-9 w-px bg-[#4F6347]" />

						<div className="flex flex-col gap-1 min-w-fit">
							<div className="text-[#A6A6A6] text-xs">
								24h Txns
							</div>
							<div className="flex items-center gap-2 text-sm">
								<Skeleton className="h-4 w-6" />
								<span className="text-[#DEDEDE]">/</span>
								<Skeleton className="h-4 w-6" />
							</div>
						</div>
					</div>
				</div>
			)}

			<div className="grid grid-cols-1 lg:grid-cols-3 border-b border-r border-l border-[#4D4D4D]/40">
				<div className="lg:col-span-2">
					{tradingPair.pairAddress || tradingPair.symbol ? (
						tradingPair.assetType === "crypto" ? (
							<div className="relative">
								{/* Chart Type Toggle */}
								<div className="absolute bottom-2 left-2 z-10 flex items-center gap-2">
									<button
										type="button"
										onClick={() =>
											setChartType("dexscreener")
										}
										className={`px-3 py-1 text-xs rounded transition-colors ${
											chartType === "dexscreener"
												? "bg-[#4DAD31] text-white"
												: "text-gray-400 hover:text-white bg-black/50 backdrop-blur-sm"
										}`}
									>
										DexScreener
									</button>
									<button
										type="button"
										onClick={() => setChartType("beta")}
										className={`px-3 py-1 text-xs rounded transition-colors ${
											chartType === "beta"
												? "bg-[#4DAD31] text-white"
												: "text-gray-400 hover:text-white bg-black/50 backdrop-blur-sm"
										}`}
									>
										Lemon Chart
									</button>
								</div>
								{chartType === "dexscreener" ? (
									<div style={{ height: "600px" }}>
										<iframe
											src={`https://dexscreener.com/${tradingPair.chain}/${tradingPair.pairAddress}?embed=1&theme=dark&info=0&sidebar=0&settings=0&trades=0&pair=0&toolbar=0&header=0&footer=0`}
											width="100%"
											height="100%"
											style={{ border: "none" }}
											title="DexScreener Chart"
											allow="clipboard-write; allow-popups; allow-popups-to-escape-sandbox; allow-forms; allow-scripts; allow-same-origin; fullscreen"
										/>
									</div>
								) : (
									<ChartSection
										pairAddress={tradingPair.pairAddress}
										chain={tradingPair.chain}
										symbol={tradingPair.symbol}
										assetType={tradingPair.assetType}
										priceData={priceData ?? undefined}
										fetchLatestPrice={fetchLatestPrice}
										isLoadingPrice={isLoadingPrice}
										marketData={marketData}
									/>
								)}
							</div>
						) : (
							<div style={{ height: "500px" }}>
								<TradingViewWidget
									symbol={tradingPair.symbol}
									theme="dark"
									interval="D"
								/>
							</div>
						)
					) : (
						<div
							className="relative w-full"
							style={{ height: "500px" }}
						>
							<div className="flex flex-col gap-3 animate-pulse p-4">
								<div className="flex items-center justify-between">
									<div className="flex space-x-4">
										<Skeleton className="h-6 w-16" />
										<Skeleton className="h-6 w-16" />
										<Skeleton className="h-6 w-16" />
									</div>
									<div className="flex items-center gap-6">
										<Skeleton className="h-4 w-8" />
										<Skeleton className="h-4 w-12" />
										<Skeleton className="h-4 w-8" />
										<Skeleton className="h-4 w-12" />
										<Skeleton className="h-4 w-8" />
										<Skeleton className="h-4 w-12" />
										<Skeleton className="h-4 w-8" />
										<Skeleton className="h-4 w-12" />
									</div>
								</div>
								<div className="flex items-end justify-between h-full gap-1 px-2">
									{Array.from({ length: 50 }, (_, i) => (
										<div
											key={`chart-skeleton-${i}`}
											className="bg-gray-800 rounded-t flex-1"
											style={{
												height: `${
													Math.random() * 60 + 40
												}%`
											}}
										/>
									))}
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="flex flex-col gap-4 border-l border-[#4D4D4D]/40">
					<div className="flex items-center justify-between px-2">
						<Tabs
							value={isLong ? "long" : "short"}
							onValueChange={(value) =>
								setIsLong(value === "long")
							}
							className="w-full"
						>
							<TabsList className="grid grid-cols-2 gap-0 bg-transparent p-0 w-full rounded-none border-0">
								<TabsTrigger
									value="long"
									className={`font-medium text-sm transition-all rounded-none border-0 bg-transparent text-[#818181] hover:text-[#bdbdbd] data-[state=active]:bg-transparent data-[state=active]:text-[#4DAD31] data-[state=active]:border-b-2 data-[state=active]:border-[#4DAD31] py-4`}
								>
									<TrendingUp className="w-4 h-4" />
									Long
								</TabsTrigger>
								<TabsTrigger
									value="short"
									className={`font-medium text-sm transition-all rounded-none border-0 bg-transparent text-[#818181] hover:text-[#bdbdbd] data-[state=active]:bg-transparent data-[state=active]:text-[#FF4C4C] data-[state=active]:border-b-2 data-[state=active]:border-[#FF4C4C] py-4`}
								>
									<TrendingDown className="w-4 h-4" />
									Short
								</TabsTrigger>
							</TabsList>
						</Tabs>
					</div>
					{tradingPair.pairAddress && marketData ? (
						<div className="flex flex-col gap-2 p-4">
							{isConnected &&
								needsApproval &&
								autoSwapAndApprove && (
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
													{marginTokenSymbol}:
												</span>
												<span className="text-foreground font-medium">
													{marginBalance
														? `${parseFloat(
																formatUnits(
																	BigInt(
																		marginBalance as string
																	),
																	decimals
																)
														  ).toFixed(
																Math.min(
																	6,
																	decimals
																)
														  )} ${marginTokenSymbol} ${
																marginTokenPriceUsd
																	? `(~$${marginTokenPriceUsd.toFixed(
																			4
																	  )})`
																	: ""
														  }`
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
											{needsApproval
												? "Required"
												: "Approved"}
										</span>
									</div>

									{needsApproval ? (
										<div className="space-y-3">
											<p className="text-sm text-muted-foreground">
												Approve {marginTokenSymbol}{" "}
												spending to create positions
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
											<p className="text-sm text-success">
												{marginTokenSymbol} spending
												approved
											</p>
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
													formatUnits(
														BigInt(
															(marginBalance as string) ||
																"0"
														),
														decimals
													)
												).toFixed(
													Math.min(6, decimals)
												)} ${marginTokenSymbol} ${
													marginTokenPriceUsd
														? `(~$${availableMarginUsd.toFixed(
																2
														  )})`
														: ""
												}`}</span>
											</div>
										</div>
										<div className="relative">
											<div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center">
												{marginTokenLogo ? (
													<img
														src={marginTokenLogo}
														alt={`${marginTokenSymbol} logo`}
														className="w-6 h-6 rounded-full"
													/>
												) : (
													<div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
														<span className="text-foreground text-xs font-bold">
															$
														</span>
													</div>
												)}
											</div>
											<Input
												placeholder="100"
												id="margin-input"
												value={marginValue}
												onChange={(e) =>
													setMarginValue(
														e.target.value
													)
												}
												className={`bg-muted border-gray-100/10 text-foreground text-right text-3xl font-bold h-14 pl-12 pr-30 ${
													marginValue &&
													!validateMargin(marginValue)
														.valid
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
												<span className="text-primary font-medium">
													{marginTokenSymbol}
												</span>
											</div>
										</div>

										{marginValue &&
											!validateMargin(marginValue)
												.valid && (
												<div className="text-xs mb-2 text-destructive">
													{
														validateMargin(
															marginValue
														).error
													}
												</div>
											)}
									</div>
									<div className="space-y-3">
										<div className="flex justify-between items-center">
											<span className="text-sm text-primary uppercase font-medium">
												Leverage
											</span>
											<span className="text-success text-lg font-bold">
												{leverage}x
											</span>
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
															onValueChange={(
																v: number[]
															) =>
																setLeverageValue(
																	v[0]
																)
															}
															aria-label="Leverage"
														>
															<RadixSlider.Track className="relative bg-slate-700 h-2 rounded-full w-full">
																<RadixSlider.Range className="absolute h-2 bg-green-600 rounded-full" />
															</RadixSlider.Track>
															<RadixSlider.Thumb className="block w-4 h-4 bg-white rounded-full shadow border border-gray-200" />
														</RadixSlider.Root>
													</div>
													<div className="flex justify-between text-xs text-muted-foreground mt-2">
														{[
															1,
															25,
															50,
															75,
															maxLeverage
														].map((lev) => (
															<span
																key={lev}
																className={
																	leverage ===
																	lev
																		? "text-primary font-bold"
																		: ""
																}
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
												Position Size (
												{extractTokenSymbol(
													tradingPair.symbol
												)}
												)
											</span>
											<span className="text-foreground">
												{(
													(parseFloat(
														marginValue || "0"
													) *
														(marginTokenPriceUsd ||
															1) *
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
											<span
												className="text-muted-foreground uppercase"
												title="Total exposure equals margin times leverage"
											>
												Total Exposure
											</span>
											<span className="text-foreground">
												$
												{(
													parseFloat(
														marginValue || "0"
													) *
													(marginTokenPriceUsd || 1) *
													leverage
												).toLocaleString()}
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
												{(
													parseFloat(
														marginValue || "0"
													) *
													(marginTokenPriceUsd || 1) *
													0.001
												).toFixed(2)}
												)
											</span>
										</div>
										<div className="flex justify-between">
											<span
												className="text-muted-foreground uppercase"
												title="Fee charged on closing, applied to profits only"
											>
												Close Fee (Applied only to
												profits)
											</span>
											<span className="text-foreground">
												2%
											</span>
										</div>
									</div>
									{(approvalError || transactionError) && (
										<div className="p-3 bg-red-900/50 border border-destructive rounded-lg">
											<p className="text-destructive text-sm">
												{approvalError?.message ||
													transactionError?.message}
											</p>
										</div>
									)}
									{isApprovalConfirmed &&
										approvalHash &&
										!needsApproval && (
											<div className="p-3 bg-green-900/50 border border-success rounded-lg">
												<p className="text-success text-sm">
													✅ {marginTokenSymbol}{" "}
													approval confirmed! You can
													now create positions.
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
													⏳ Waiting for
													confirmation...
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
									<div className="w-full mt-4">
										<div className="flex items-center gap-3 mb-4">
											<input
												id="auto-swap-approve"
												type="checkbox"
												checked={autoSwapAndApprove}
												onChange={(e) =>
													setAutoSwapAndApprove(
														e.target.checked
													)
												}
												className="w-4 h-4 rounded border bg-muted"
											/>
											<label
												htmlFor="auto-swap-approve"
												className="text-xs text-muted-foreground"
											>
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
												isApprovalConfirming ||
												tradingPair.assetType !==
													"crypto"
											}
											onClick={handlePlaceTransaction}
											className={
												!isLong
													? "bg-linear-to-r from-red-600 via-red-700 to-red-900"
													: undefined
											}
											connectedNode={
												tradingPair.assetType !==
												"crypto"
													? "Trading not available for this asset"
													: needsApproval
													? `Approve ${marginTokenSymbol} First`
													: isCreatingPosition
													? "Preparing Transaction..."
													: isPending
													? "Confirm in Wallet..."
													: isConfirming
													? "Confirming..."
													: `${
															isLong
																? "Long"
																: "Short"
													  } ${
															tradingPair.symbol.split(
																"/"
															)[0]
													  }`
											}
										/>
									</div>
								</>
							)}
						</div>
					) : (
						<div className="p-4 space-y-4">
							{/* Skeleton for margin input */}
							<div className="space-y-2">
								<div className="flex justify-between items-center">
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-4 w-32" />
								</div>
								<Skeleton className="h-14 w-full" />
							</div>
							{/* Skeleton for leverage */}
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<Skeleton className="h-4 w-16" />
									<Skeleton className="h-6 w-12" />
								</div>
								<Skeleton className="h-16 w-full rounded-lg" />
							</div>
							{/* Skeleton for position calculations */}
							<div className="space-y-3">
								<div className="flex justify-between">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-4 w-20" />
								</div>
								<div className="flex justify-between">
									<Skeleton className="h-4 w-28" />
									<Skeleton className="h-4 w-16" />
								</div>
								<div className="flex justify-between">
									<Skeleton className="h-4 w-16" />
									<Skeleton className="h-4 w-12" />
								</div>
								<div className="flex justify-between">
									<Skeleton className="h-4 w-40" />
									<Skeleton className="h-4 w-8" />
								</div>
							</div>
							{/* Skeleton for button */}
							<Skeleton className="h-12 w-full" />
						</div>
					)}
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
				{isLoadingPositions ? (
					<div className="bg-card border border-gray-100/10 rounded-lg p-4">
						<div className="space-y-4">
							{/* Skeleton for table header */}
							<div className="flex justify-between items-center border-b border-gray-100/10 pb-2">
								<Skeleton className="h-6 w-32" />
								<Skeleton className="h-6 w-24" />
							</div>
							{/* Skeleton for table rows */}
							{Array.from({ length: 3 }, (_, i) => (
								<div
									key={i}
									className="flex justify-between items-center py-3 border-b border-gray-100/10"
								>
									<div className="flex items-center gap-3">
										<Skeleton className="h-6 w-20" />
										<Skeleton className="h-5 w-12" />
									</div>
									<div className="flex gap-6">
										<Skeleton className="h-4 w-16" />
										<Skeleton className="h-4 w-12" />
										<Skeleton className="h-4 w-14" />
										<Skeleton className="h-4 w-16" />
										<Skeleton className="h-8 w-16" />
									</div>
								</div>
							))}
						</div>
					</div>
				) : (
					<PositionsTable
						positions={positions}
						isLoading={isLoadingPositions}
						error={positionsError}
						onRefetch={fetchUserPositions}
						tradingPairAddress={tradingPair.pairAddress}
					/>
				)}
			</div>

			<SearchModal
				open={isSearchModalOpen}
				onOpenChange={setIsSearchModalOpen}
			/>
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
