"use client";

import { ArrowDownRight, ArrowUpRight, Info, Search, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAsyncFn } from "react-use";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchResults } from "@/components/ui/SearchResults";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearch } from "@/hooks/useSearch";
import type { SearchResult } from "@/lib/search-service";

// Types
interface Token {
	id: number;
	symbol: string;
	name: string;
	price: string;
	change24h: string;
	volume: string;
	marketCap: string;
	trend: "up" | "down";
	logo: string;
	tokenAddress: string;
	pairAddress?: string;
	// Virtual market fields
	totalLiquidity?: string;
	realLiquidity?: string;
	openInterest?: string;
	hasMarket?: boolean;
	marketId?: string | null;
	virtualLiquidity?: string;
	chain?: string;
	chainId?: string;
}

interface ForexPair {
	id: number;
	symbol: string;
	name: string;
	price: string;
	change24h: string;
	volume: string;
	spread: string;
	trend: "up" | "down";
	logo: string;
}

// API Response Types
interface APIStockData {
	Ticker: string;
	Price: number;
	Timestamp: string;
}

interface APIResponse {
	data: APIStockData[];
}

interface TokenAPIResponse {
	data: Token[];
	pagination?: {
		page: number;
		limit: number;
		total: number;
		hasMore: boolean;
	};
}

export default function Home() {
	const router = useRouter();
	const [searchQuery, setSearchQuery] = useState("");
	const [_currentPage, setCurrentPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const observerTarget = useRef<HTMLDivElement>(null);
	const [apiData, setApiData] = useState({
		stocks: [] as Token[],
		fx: [] as ForexPair[],
		tokens: [] as Token[],
	});
	// UI filter state: all | tokens | fx | stocks
	const [filterType, setFilterType] = useState<"all" | "tokens" | "fx" | "stocks">("all");
	const [chainFilter, setChainFilter] = useState<"all" | string>("all");
	const [onlyPerpMarkets, setOnlyPerpMarkets] = useState(false);

	// New search functionality
	const {
		results: searchResults,
		isLoading: isSearchLoading,
		error: searchError,
		search,
		clearResults,
	} = useSearch({
		chains: ["base"],
	});

	const handleTradeClick = (item: Token) => {
		const params = new URLSearchParams();
		params.set("symbol", item.symbol);

		if ("pairAddress" in item && item.pairAddress) {
			params.set("pairAddress", item.pairAddress);
		}
		params.set("tokenAddress", item.tokenAddress);
		params.set("chain", item.chain || "base");
		router.push(`/perp?${params.toString()}`);
	};

	const handleSearchResultTradeClick = (result: SearchResult) => {
		const params = new URLSearchParams();
		params.set("symbol", result.symbol);
		params.set("pairAddress", result.pairAddress);
		if (result.tokenAddress) {
			params.set("tokenAddress", result.tokenAddress);
		}
		router.push(`/perp?${params.toString()}`);
	};

	const handleStockTradeClick = (stock: Token) => {
		const params = new URLSearchParams();
		params.set("symbol", stock.symbol);
		params.set("chain", "base");
		params.set("assetType", "stock");
		router.push(`/perp?${params.toString()}`);
	};

	const handleForexTradeClick = (pair: ForexPair) => {
		const params = new URLSearchParams();
		params.set("symbol", pair.symbol);
		params.set("chain", "base");
		params.set("assetType", "forex");
		router.push(`/perp?${params.toString()}`);
	};

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setSearchQuery(value);

		if (value.trim().length >= 2) {
			search(value);
		} else {
			clearResults();
		}
	};

	const [{ loading: isLoadingMore, value: tokensResult }, fetchTokens] = useAsyncFn(
		async (page: number, append: boolean = false, chain?: string, hasMarket?: boolean | null) => {
			const params = new URLSearchParams();
			params.set("page", String(page));
			params.set("limit", "10");
			if (chain && chain !== "all") params.set("chain", chain);
			if (hasMarket !== undefined && hasMarket !== null) params.set("hasMarket", String(hasMarket));

			const tokensResponse = await fetch(`/api/trending/tokens?${params.toString()}`);
			if (!tokensResponse.ok) {
				throw new Error(`Tokens API failed: ${tokensResponse.status}`);
			}
			const tokensData: TokenAPIResponse = await tokensResponse.json();
			// Normalize tokens to the local Token interface
			const normalizedTokens = (tokensData.data || []).map((t, i) => ({
				id: i + 1,
				symbol: t.symbol,
				name: t.name || t.symbol,
				price: t.priceUsd ? `$${Number(t.priceUsd).toFixed(6)}` : t.price || "$0.00",
				change24h:
					typeof t.change24h === "number" ? `${t.change24h.toFixed(2)}%` : t.change24h || "0.00%",
				volume: t.volume24h ? `$${(Number(t.volume24h) / 1000000).toFixed(2)}M` : "N/A",
				marketCap: "N/A",
				trend: (t.change24h ?? 0) >= 0 ? ("up" as const) : ("down" as const),
				logo: t.logo || "",
				tokenAddress: t.tokenAddress || "",
				pairAddress: t.pairAddress || "",
				totalLiquidity: undefined,
				realLiquidity: undefined,
				openInterest: undefined,
				hasMarket: undefined,
				marketId: undefined,
				virtualLiquidity: undefined,
				chain: t.chain || undefined,
			}));

			return {
				tokens: normalizedTokens,
				append,
				hasMore: tokensData.pagination?.hasMore ?? false,
			};
		},
		[],
	);

	const [{ loading: isLoading, value: trendingResult }, fetchTrendingData] =
		useAsyncFn(async () => {
			// Fetch tokens with pagination
			fetchTokens(1, false, chainFilter === "all" ? undefined : chainFilter, onlyPerpMarkets);

			const stocksResponse = await fetch("/api/trending/stocks");
			if (!stocksResponse.ok) {
				throw new Error(`Stocks API failed: ${stocksResponse.status}`);
			}
			const stocksData: APIResponse = await stocksResponse.json();

			const fxResponse = await fetch("/api/trending/fx");
			if (!fxResponse.ok) {
				throw new Error(`FX API failed: ${fxResponse.status}`);
			}
			const fxData: APIResponse = await fxResponse.json();

			// Transform stocks data
			const transformedStocks: Token[] = stocksData.data.map(
				(stock: APIStockData, index: number) => ({
					id: index + 1,
					symbol: stock.Ticker,
					name: stock.Ticker,
					price: typeof stock.Price === "number" ? stock.Price.toFixed(2) : "0.00",
					change24h: "N/A",
					volume: "N/A",
					marketCap: "N/A",
					trend: "up" as const,
					logo: "📈",
					tokenAddress: "",
					chain: "base",
				}),
			);

			const transformedFX: ForexPair[] = fxData.data.map((fx, index) => {
				const getDisplaySymbol = (ticker: string) => {
					if (ticker.includes("AUD-USD")) return "AUD/USD";
					if (ticker.includes("CNY-USD")) return "CNY/USD";
					if (ticker.includes("NGN-USD")) return "NGN/USD";
					return ticker;
				};

				const getDisplayName = (ticker: string) => {
					if (ticker.includes("AUD")) return "Australian Dollar/US Dollar";
					if (ticker.includes("CNY")) return "Chinese Yuan/US Dollar";
					if (ticker.includes("NGN")) return "Nigerian Naira/US Dollar";
					return ticker;
				};

				const getLogo = (ticker: string) => {
					if (ticker.includes("AUD")) return "🇦🇺";
					if (ticker.includes("CNY")) return "🇨🇳";
					if (ticker.includes("NGN")) return "🇳🇬";
					return "💱";
				};

				return {
					id: index + 1,
					symbol: getDisplaySymbol(fx.Ticker),
					name: getDisplayName(fx.Ticker),
					price: fx.Price.toFixed(4),
					change24h: "N/A",
					volume: "N/A",
					spread: "N/A",
					trend: "up",
					logo: getLogo(fx.Ticker),
				};
			});

			return { stocks: transformedStocks, fx: transformedFX, tokens: [] };
		}, [fetchTokens]);

	// Update apiData when results change
	useEffect(() => {
		if (tokensResult) {
			setApiData((prev) => ({
				...prev,
				tokens: tokensResult.append
					? [...prev.tokens, ...tokensResult.tokens]
					: tokensResult.tokens,
			}));
			setHasMore(tokensResult.hasMore);
		}
	}, [tokensResult]);

	useEffect(() => {
		if (trendingResult) {
			setApiData((prev) => ({
				...prev,
				stocks: trendingResult.stocks,
				fx: trendingResult.fx,
			}));
		}
	}, [trendingResult]);

	useEffect(() => {
		fetchTrendingData();
	}, [fetchTrendingData]); // Infinite scroll with Intersection Observer

	// Refetch tokens when chain or perp filter changes
	useEffect(() => {
		setCurrentPage(1);
		fetchTokens(1, false, chainFilter === "all" ? undefined : chainFilter, onlyPerpMarkets);
	}, [chainFilter, onlyPerpMarkets, fetchTokens]);
	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
					setCurrentPage((prev) => {
						const nextPage = prev + 1;
						fetchTokens(
							nextPage,
							true,
							chainFilter === "all" ? undefined : chainFilter,
							onlyPerpMarkets,
						);
						return nextPage;
					});
				}
			},
			{ threshold: 0.1 },
		);

		if (observerTarget.current) {
			observer.observe(observerTarget.current);
		}

		return () => {
			if (observerTarget.current) {
				observer.unobserve(observerTarget.current);
			}
		};
	}, [hasMore, isLoadingMore, isLoading, fetchTokens, chainFilter, onlyPerpMarkets]);

	const filteredTokens = apiData.tokens.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const filteredFX = apiData.fx.filter(
		(fx) =>
			fx.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			fx.symbol.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const filteredStocks = apiData.stocks.filter(
		(stock) =>
			stock.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const renderTokenTable = (items: Token[], title: string) => (
		<Card className="overflow-hidden border-primary/30 rounded-xl">
			<CardHeader className="border-b border-primary/30 bg-primary/5 rounded-t-xl">
				<CardTitle className="text-lg font-semibold">{title}</CardTitle>
			</CardHeader>
			<CardContent className="p-0 rounded-b-xl">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="border-b border-primary/20 bg-muted/30">
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									#
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Token
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Price
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									24h Change
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Volume
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Market Cap
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Total Liquidity
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Open Interest
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Action
								</th>
							</tr>
						</thead>
						<tbody>
							{items.length > 0 ? (
								items.map((item, index) => (
									<tr
										key={item.id}
										className="border-b border-primary/20 hover:bg-primary/5 transition-colors"
									>
										<td className="p-3 text-muted-foreground text-sm">{index + 1}</td>
										<td className="p-3">
											<div className="flex items-center gap-3">
												<div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden border border-primary/20">
													{item.logo?.startsWith("http") ? (
														<Image
															src={item.logo}
															alt={item.symbol}
															width={32}
															height={32}
															className="w-full h-full object-cover"
															onError={(e) => {
																e.currentTarget.style.display = "none";
																const parent = e.currentTarget.parentElement;
																if (parent) {
																	parent.textContent = "🪙";
																}
															}}
														/>
													) : (
														item.logo || "🪙"
													)}
												</div>
												<div>
													<div className="text-foreground font-medium text-sm">{item.symbol}</div>
													<div className="text-muted-foreground text-xs">{item.name}</div>
												</div>
											</div>
										</td>
										<td className="p-3 text-foreground font-medium text-sm">{item.price}</td>
										<td className="p-3">
											<Badge
												variant="outline"
												className={`gap-1 ${
													item.trend === "up"
														? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
														: "bg-destructive/20 text-destructive border-destructive/30 hover:bg-destructive/20"
												}`}
											>
												{item.trend === "up" ? (
													<ArrowUpRight className="w-3 h-3" />
												) : (
													<ArrowDownRight className="w-3 h-3" />
												)}
												{item.change24h}
											</Badge>
										</td>
										<td className="p-3 text-muted-foreground text-sm">{item.volume}</td>
										<td className="p-3 text-muted-foreground text-sm">{item.marketCap}</td>
										<td className="p-3 text-muted-foreground text-sm">
											<div className="flex items-center gap-2">
												{item.totalLiquidity || "$0.00"}
												{item.hasMarket && (
													<Badge
														variant="outline"
														className="text-xs bg-primary/10 text-primary border-primary/30"
													>
														Market
													</Badge>
												)}
											</div>
										</td>
										<td className="p-3 text-muted-foreground text-sm">
											{item.openInterest || "$0.00"}
										</td>
										<td className="p-3">
											<Button onClick={() => handleTradeClick(item)} size="sm">
												Trade
											</Button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={9} className="p-12 text-center">
										<div className="flex flex-col items-center gap-2">
											<div className="text-muted-foreground">No items found</div>
											<div className="text-sm text-muted-foreground">No data available</div>
										</div>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);

	const renderForexTable = (items: ForexPair[], title: string) => (
		<Card className="overflow-hidden border-primary/30 rounded-xl">
			<CardHeader className="border-b border-primary/30 bg-primary/5 rounded-t-xl">
				<CardTitle className="text-lg font-semibold">{title}</CardTitle>
			</CardHeader>
			<CardContent className="p-0 rounded-b-xl">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="border-b border-primary/20 bg-muted/30">
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									#
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Pair
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Price
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									24h Change
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Volume
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Spread
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Action
								</th>
							</tr>
						</thead>
						<tbody>
							{items.length > 0 ? (
								items.map((item, index) => (
									<tr
										key={item.id}
										className="border-b border-primary/20 hover:bg-primary/5 transition-colors"
									>
										<td className="p-3 text-muted-foreground text-sm">{index + 1}</td>
										<td className="p-3">
											<div className="flex items-center gap-3">
												<div className="w-8 h-8 text-lg">{item.logo}</div>
												<div>
													<div className="text-foreground font-medium text-sm">{item.symbol}</div>
													<div className="text-muted-foreground text-xs">{item.name}</div>
												</div>
											</div>
										</td>
										<td className="p-3 text-foreground font-medium text-sm">{item.price}</td>
										<td className="p-3">
											<Badge
												variant="outline"
												className={`gap-1 ${
													item.trend === "up"
														? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
														: "bg-destructive/20 text-destructive border-destructive/30 hover:bg-destructive/20"
												}`}
											>
												{item.trend === "up" ? (
													<ArrowUpRight className="w-3 h-3" />
												) : (
													<ArrowDownRight className="w-3 h-3" />
												)}
												{item.change24h}
											</Badge>
										</td>
										<td className="p-3 text-muted-foreground text-sm">{item.volume}</td>
										<td className="p-3 text-muted-foreground text-sm">{item.spread}</td>
										<td className="p-3">
											<Button onClick={() => handleForexTradeClick(item)} size="sm">
												Trade
											</Button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={6} className="p-12 text-center">
										<div className="flex flex-col items-center gap-2">
											<div className="text-muted-foreground">No items found</div>
											<div className="text-sm text-muted-foreground">No data available</div>
										</div>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);

	const renderStocksTable = (items: Token[], title: string) => (
		<Card className="overflow-hidden border-primary/30 rounded-xl">
			<CardHeader className="border-b border-primary/30 bg-primary/5 rounded-t-xl">
				<CardTitle className="text-lg font-semibold">{title}</CardTitle>
			</CardHeader>
			<CardContent className="p-0 rounded-b-xl">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="border-b border-primary/20 bg-muted/30">
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									#
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Stock
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Price
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									24h Change
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Volume
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									P/E Ratio
								</th>
								<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
									Action
								</th>
							</tr>
						</thead>
						<tbody>
							{items.length > 0 ? (
								items.map((item, index) => (
									<tr
										key={item.id}
										className="border-b border-primary/20 hover:bg-primary/5 transition-colors"
									>
										<td className="p-3 text-muted-foreground text-sm">{index + 1}</td>
										<td className="p-3">
											<div className="flex items-center gap-3">
												<div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden border border-primary/20">
													{item.logo?.startsWith("http") ? (
														<Image
															src={item.logo}
															alt={item.symbol}
															width={32}
															height={32}
															className="w-full h-full object-cover"
															onError={(e) => {
																e.currentTarget.style.display = "none";
																const parent = e.currentTarget.parentElement;
																if (parent) {
																	parent.textContent = "📈";
																}
															}}
														/>
													) : (
														item.logo || "📈"
													)}
												</div>
												<div>
													<div className="text-foreground font-medium text-sm">{item.symbol}</div>
													<div className="text-muted-foreground text-xs">{item.name}</div>
												</div>
											</div>
										</td>
										<td className="p-3 text-foreground font-medium text-sm">${item.price}</td>
										<td className="p-3">
											<Badge
												variant="outline"
												className={`gap-1 ${
													item.trend === "up"
														? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
														: "bg-destructive/20 text-destructive border-destructive/30 hover:bg-destructive/20"
												}`}
											>
												{item.trend === "up" ? (
													<ArrowUpRight className="w-3 h-3" />
												) : (
													<ArrowDownRight className="w-3 h-3" />
												)}
												{item.change24h}
											</Badge>
										</td>
										<td className="p-3 text-muted-foreground text-sm">{item.volume}</td>
										<td className="p-3 text-muted-foreground text-sm">{item.marketCap || "N/A"}</td>
										<td className="p-3">
											<Button onClick={() => handleStockTradeClick(item)} size="sm">
												Trade
											</Button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={6} className="p-12 text-center">
										<div className="flex flex-col items-center gap-2">
											<div className="text-muted-foreground">No items found</div>
											<div className="text-sm text-muted-foreground">No data available</div>
										</div>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8 space-y-6">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-primary/10 rounded-lg">
							<TrendingUp className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-foreground">Trending Assets</h1>
							<p className="text-muted-foreground text-sm">
								Discover popular assets and market performance
							</p>
						</div>
					</div>

					<Card className="border-primary/20 bg-primary/5">
						<CardContent className="p-4">
							<div className="flex items-start gap-3">
								<Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
								<div className="space-y-3">
									<div>
										<h3 className="text-sm font-semibold text-foreground mb-1">
											Perpetual Trading Availability
										</h3>
										<p className="text-muted-foreground text-xs">
											Perpetual trading is currently supported for tokens on these DEXs:
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										{[
											"UniswapV2",
											"UniswapV3",
											"SwapBased",
											"DackieSwap",
											"HorizonDex",
											"SushiSwapV3",
											"VelocimeterV2",
											"Aerodrome",
											"Slipstream",
										].map((dex) => (
											<Badge
												key={dex}
												variant="outline"
												className="text-xs border-primary/40 text-primary bg-primary/10"
											>
												{dex}
											</Badge>
										))}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				<div className="mb-8 space-y-4">
					<div className="relative max-w-md">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
						<Input
							type="text"
							placeholder="Search Base tokens by symbol, address, or pair address..."
							value={searchQuery}
							onChange={handleSearchChange}
							className="pl-10"
						/>
					</div>
					{searchQuery && (
						<div className="space-y-2">
							<p className="text-muted-foreground text-xs">
								Searching for &quot;{searchQuery}&quot; on Base network via DexScreener and
								GeckoTerminal
							</p>
							{searchQuery.startsWith("0x") && (
								<p className="text-muted-foreground text-xs bg-blue-500/10 border border-blue-500/20 rounded p-2">
									💡 Detected contract address - searching on Base chain
								</p>
							)}
						</div>
					)}

					{searchQuery.length >= 2 && (
						<SearchResults
							results={searchResults}
							isLoading={isSearchLoading}
							error={searchError}
							query={searchQuery}
							onTradeClick={handleSearchResultTradeClick}
						/>
					)}
				</div>

				{!searchQuery && (
					<div className="space-y-8">
						{isLoading ? (
							<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
								{Array.from({ length: 9 }).map((_, i) => (
									<Card key={`market-skeleton-${Date.now()}-${i}`} className="border-accent/20">
										<CardHeader className="pb-3">
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-3">
													<Skeleton className="h-10 w-10 rounded-full" />
													<div className="space-y-2">
														<Skeleton className="h-4 w-16" />
														<Skeleton className="h-3 w-24" />
													</div>
												</div>
												<Skeleton className="h-6 w-16" />
											</div>
										</CardHeader>
										<CardContent className="space-y-2">
											<div className="flex justify-between">
												<Skeleton className="h-4 w-12" />
												<Skeleton className="h-4 w-20" />
											</div>
											<div className="flex justify-between">
												<Skeleton className="h-4 w-16" />
												<Skeleton className="h-4 w-16" />
											</div>
											<Skeleton className="h-9 w-full mt-4" />
										</CardContent>
									</Card>
								))}
							</div>
						) : (
							<>
								<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
									<div className="flex gap-2 items-center">
										<Button
											size="sm"
											variant={chainFilter === "all" ? "default" : "ghost"}
											onClick={() => {
												setChainFilter("all");
												setCurrentPage(1);
												fetchTokens(1, false, undefined, onlyPerpMarkets);
											}}
										>
											All Chains
										</Button>
										{["base", "ethereum", "bsc", "solana"].map((c) => (
											<Button
												key={c}
												size="sm"
												variant={chainFilter === c ? "default" : "ghost"}
												onClick={() => {
													setChainFilter(c);
													setCurrentPage(1);
													fetchTokens(1, false, c, onlyPerpMarkets);
												}}
											>
												{c}
											</Button>
										))}
										<Button
											size="sm"
											variant={onlyPerpMarkets ? "default" : "ghost"}
											onClick={() => {
												setOnlyPerpMarkets((v) => {
													const newVal = !v;
													setCurrentPage(1);
													fetchTokens(
														1,
														false,
														chainFilter === "all" ? undefined : chainFilter,
														newVal,
													);
													return newVal;
												});
											}}
										>
											Perp Markets
										</Button>
									</div>
									<div className="flex gap-2 items-center">
										<Button
											size="sm"
											variant={filterType === "all" ? "default" : "ghost"}
											onClick={() => setFilterType("all")}
										>
											All
										</Button>
										<Button
											size="sm"
											variant={filterType === "tokens" ? "default" : "ghost"}
											onClick={() => setFilterType("tokens")}
										>
											Tokens
										</Button>
										<Button
											size="sm"
											variant={filterType === "fx" ? "default" : "ghost"}
											onClick={() => setFilterType("fx")}
										>
											Forex
										</Button>
										<Button
											size="sm"
											variant={filterType === "stocks" ? "default" : "ghost"}
											onClick={() => setFilterType("stocks")}
										>
											Stocks
										</Button>
									</div>
								</div>

								{(filterType === "all" || filterType === "tokens") &&
									filteredTokens.length > 0 &&
									renderTokenTable(filteredTokens, "Top Trending Tokens")}
								{(filterType === "all" || filterType === "fx") &&
									filteredFX.length > 0 &&
									renderForexTable(filteredFX, "Forex Pairs")}
								{(filterType === "all" || filterType === "stocks") &&
									filteredStocks.length > 0 &&
									renderStocksTable(filteredStocks, "Top Stocks")}
								{filteredTokens.length === 0 &&
									filteredFX.length === 0 &&
									filteredStocks.length === 0 && (
										<div className="flex flex-col items-center justify-center py-12 gap-4">
											<div className="text-muted-foreground">No data available</div>
											<div className="text-sm text-muted-foreground">
												Unable to fetch trending assets
											</div>
										</div>
									)}
							</>
						)}
					</div>
				)}

				{/* Filters were moved above the table content */}
			</main>
		</div>
	);
}
