"use client";

import {
	ArrowDownRight,
	ArrowUpRight,
	Info,
	Loader2,
	Search,
	TrendingUp
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchResults } from "@/components/ui/SearchResults";
import { useSearch } from "@/hooks/useSearch";
import { type SearchResult } from "@/lib/search-service";

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
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const observerTarget = useRef<HTMLDivElement>(null);
	const [apiData, setApiData] = useState({
		stocks: [] as Token[],
		fx: [] as ForexPair[],
		tokens: [] as Token[]
	});

	// New search functionality
	const {
		results: searchResults,
		isLoading: isSearchLoading,
		error: searchError,
		search,
		clearResults
	} = useSearch({
		chains: ["base"]
	});

	const handleTradeClick = (item: Token) => {
		const params = new URLSearchParams();
		params.set("symbol", item.symbol);

		if ("pairAddress" in item && item.pairAddress) {
			params.set("pairAddress", item.pairAddress);
		}
		console.log({ item });
		params.set("tokenAddress", item.tokenAddress);
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

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setSearchQuery(value);

		if (value.trim().length >= 2) {
			search(value);
		} else {
			clearResults();
		}
	};

	const fetchTokens = useCallback(
		async (page: number, append: boolean = false) => {
			try {
				if (append) {
					setIsLoadingMore(true);
				} else {
					setIsLoading(true);
				}

				const tokensResponse = await fetch(
					`/api/trending/tokens?page=${page}&limit=10`
				);
				if (!tokensResponse.ok) {
					throw new Error(
						`Tokens API failed: ${tokensResponse.status}`
					);
				}
				const tokensData: TokenAPIResponse =
					await tokensResponse.json();

				setApiData((prev) => ({
					...prev,
					tokens: append
						? [...prev.tokens, ...tokensData.data]
						: tokensData.data
				}));

				setHasMore(tokensData.pagination?.hasMore ?? false);
			} catch (error) {
				console.error("Error fetching tokens:", error);
			} finally {
				if (!append) setIsLoading(false);
				setIsLoadingMore(false);
			}
		},
		[]
	);

	useEffect(() => {
		const fetchTrendingData = async () => {
			try {
				setIsLoading(true);

				// Fetch tokens with pagination
				fetchTokens(1, false);

				const stocksResponse = await fetch("/api/trending/stocks");
				if (!stocksResponse.ok) {
					throw new Error(
						`Stocks API failed: ${stocksResponse.status}`
					);
				}
				const stocksData: APIResponse = await stocksResponse.json();

				const fxResponse = await fetch("/api/trending/fx");
				if (!fxResponse.ok) {
					throw new Error(`FX API failed: ${fxResponse.status}`);
				}
				const fxData: APIResponse = await fxResponse.json();

				const transformedFX: ForexPair[] = fxData.data.map(
					(fx, index) => {
						const getDisplaySymbol = (ticker: string) => {
							if (ticker.includes("AUD-USD")) return "AUD/USD";
							if (ticker.includes("CNY-USD")) return "CNY/USD";
							if (ticker.includes("NGN-USD")) return "NGN/USD";
							return ticker;
						};

						const getDisplayName = (ticker: string) => {
							if (ticker.includes("AUD"))
								return "Australian Dollar/US Dollar";
							if (ticker.includes("CNY"))
								return "Chinese Yuan/US Dollar";
							if (ticker.includes("NGN"))
								return "Nigerian Naira/US Dollar";
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
							logo: getLogo(fx.Ticker)
						};
					}
				);

				setApiData((prev) => ({
					...prev,
					stocks: [],
					fx: transformedFX
				}));
			} catch (error) {
				console.error("Error fetching trending data:", error);
				setApiData((prev) => ({
					...prev,
					stocks: [],
					fx: []
				}));
			} finally {
				setIsLoading(false);
			}
		};

		fetchTrendingData();
	}, [fetchTokens]);

	// Infinite scroll with Intersection Observer
	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (
					entries[0].isIntersecting &&
					hasMore &&
					!isLoadingMore &&
					!isLoading
				) {
					setCurrentPage((prev) => {
						const nextPage = prev + 1;
						fetchTokens(nextPage, true);
						return nextPage;
					});
				}
			},
			{ threshold: 0.1 }
		);

		if (observerTarget.current) {
			observer.observe(observerTarget.current);
		}

		return () => {
			if (observerTarget.current) {
				observer.unobserve(observerTarget.current);
			}
		};
	}, [hasMore, isLoadingMore, isLoading, fetchTokens]);

	const filteredTokens = apiData.tokens.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredFX = apiData.fx.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredStocks = apiData.stocks.filter(
		(token) =>
			token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const isForex = true;

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-[1600px]">
				<div className="mb-8 space-y-6">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-primary/10 rounded-lg">
							<TrendingUp className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-foreground">
								Trending Assets
							</h1>
							<p className="text-muted-foreground text-sm">
								Discover popular assets and market performance
							</p>
						</div>
					</div>

					<Card className="border-primary/20 bg-primary/5">
						<CardContent className="p-4">
							<div className="flex items-start gap-3">
								<Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
								<div className="space-y-3">
									<div>
										<h3 className="text-sm font-semibold text-foreground mb-1">
											Perpetual Trading Availability
										</h3>
										<p className="text-muted-foreground text-xs">
											Perpetual trading is currently
											supported for tokens on these DEXs:
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										{[
											"PancakeSwap V2",
											"PancakeSwap V3",
											"SushiSwap BSC",
											"MDEX BSC",
											"BiSwap",
											"BakerySwap",
											"Uniswap V2 BNB"
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
								Searching for &quot;{searchQuery}&quot; on Base
								network via DexScreener and GeckoTerminal
							</p>
							{searchQuery.startsWith("0x") && (
								<p className="text-muted-foreground text-xs bg-blue-500/10 border border-blue-500/20 rounded p-2">
									💡 Detected contract address - searching on
									Base chain
								</p>
							)}
						</div>
					)}

					{/* Search Results */}
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

				{/* Only show trending data if not searching or no search results */}
				{(!searchQuery ||
					(searchQuery.length < 2 && searchResults.length === 0)) && (
					<>
						{isLoading ? (
							<div className="flex flex-col items-center justify-center py-24 gap-4">
								<Loader2 className="w-8 h-8 text-primary animate-spin" />
								<div className="text-foreground font-medium">
									Loading trending assets...
								</div>
								<div className="text-muted-foreground text-sm">
									Fetching real-time market data
								</div>
							</div>
						) : (
							<div className="space-y-8">
								<Card className="overflow-hidden border-gray-100/10">
									<CardHeader className="border-b border-gray-100/10">
										<CardTitle className="text-lg font-semibold">
											Top Trending Tokens
										</CardTitle>
									</CardHeader>
									<CardContent className="p-0">
										<div className="overflow-x-auto">
											<table className="w-full">
												<thead>
													<tr className="border-b border-gray-100/10 bg-muted/30">
														<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
															#
														</th>
														<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
															{isForex
																? "Pair"
																: "Token"}
														</th>
														<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
															Price
														</th>
														<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
															24h Change
														</th>
														<th className="text-left p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
															{isForex
																? "Volume"
																: "Volume"}
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
													{filteredTokens.length >
													0 ? (
														filteredTokens.map(
															(item, index) => (
																<tr
																	key={
																		item.id
																	}
																	className="border-b border-gray-100/10 hover:bg-card-hover transition-colors"
																>
																	<td className="p-3 text-muted-foreground text-sm">
																		{index +
																			1}
																	</td>
																	<td className="p-3">
																		<div className="flex items-center gap-3">
																			<div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden border border-primary/20">
																				{item.logo?.startsWith(
																					"http"
																				) ? (
																					<img
																						src={
																							item.logo
																						}
																						alt={
																							item.symbol
																						}
																						className="w-full h-full object-cover"
																						onError={(
																							e
																						) => {
																							e.currentTarget.style.display =
																								"none";
																							e.currentTarget.parentElement!.textContent =
																								"🪙";
																						}}
																					/>
																				) : (
																					item.logo ||
																					"🪙"
																				)}
																			</div>
																			<div>
																				<div className="text-foreground font-medium text-sm">
																					{
																						item.symbol
																					}
																				</div>
																				<div className="text-muted-foreground text-xs">
																					{
																						item.name
																					}
																				</div>
																			</div>
																		</div>
																	</td>
																	<td className="p-3 text-foreground font-medium text-sm">
																		{
																			item.price
																		}
																	</td>
																	<td className="p-3">
																		<Badge
																			variant="outline"
																			className={`gap-1 ${
																				item.trend ===
																				"up"
																					? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
																					: "bg-destructive/20 text-destructive border-destructive/30 hover:bg-destructive/20"
																			}`}
																		>
																			{item.trend ===
																			"up" ? (
																				<ArrowUpRight className="w-3 h-3" />
																			) : (
																				<ArrowDownRight className="w-3 h-3" />
																			)}
																			{
																				item.change24h
																			}
																		</Badge>
																	</td>
																	<td className="p-3 text-muted-foreground text-sm">
																		{
																			item.volume
																		}
																	</td>
																	<td className="p-3 text-muted-foreground text-sm">
																		{
																			item.marketCap
																		}
																	</td>
																	<td className="p-3 text-muted-foreground text-sm">
																		<div className="flex items-center gap-2">
																			{item.totalLiquidity ||
																				"$0.00"}
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
																		{item.openInterest ||
																			"$0.00"}
																	</td>
																	<td className="p-3">
																		<Button
																			onClick={() =>
																				handleTradeClick(
																					item
																				)
																			}
																			size="sm"
																		>
																			Trade
																		</Button>
																	</td>
																</tr>
															)
														)
													) : (
														<tr>
															<td
																colSpan={9}
																className="p-12 text-center"
															>
																<div className="flex flex-col items-center gap-2">
																	<div className="text-muted-foreground">
																		{searchQuery
																			? "No items found"
																			: "No data available"}
																	</div>
																	<div className="text-sm text-muted-foreground">
																		{searchQuery
																			? "Try adjusting your search"
																			: "Unable to fetch data"}
																	</div>
																</div>
															</td>
														</tr>
													)}
												</tbody>
											</table>
										</div>
										{/* Infinite scroll loader */}
										{!searchQuery && (
											<div className="p-4 border-t border-gray-100/10">
												{isLoadingMore && (
													<div className="flex items-center justify-center gap-2">
														<Loader2 className="w-5 h-5 text-primary animate-spin" />
														<span className="text-sm text-muted-foreground">
															Loading more
															tokens...
														</span>
													</div>
												)}
												{!isLoadingMore && hasMore && (
													<div
														ref={observerTarget}
														className="h-4"
													/>
												)}
												{!hasMore &&
													filteredTokens.length >
														0 && (
														<div className="text-center text-sm text-muted-foreground">
															No more tokens to
															load
														</div>
													)}
											</div>
										)}
									</CardContent>
								</Card>
							</div>
						)}
					</>
				)}
			</main>
		</div>
	);
}
