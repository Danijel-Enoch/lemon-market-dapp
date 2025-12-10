import { ArrowDownRight, ArrowUpRight, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAsyncFn from "react-use/lib/useAsyncFn";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	fetchTokensTrending,
	searchTokens,
	type TokenItem
} from "@/hooks/useTrending";
import type { Metadata } from "@/lib/types";
import { formatLargeNumber, formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
	title: "Trending - Lemon Markets",
	description: "Discover trending tokens and market opportunities"
};

// Removed useSearch & external search results integration

// Types
interface Token {
	id: number;
	symbol: string;
	name: string;
	price: string;
	sortPrice?: number;
	change24h: string;
	volume: string;
	marketCap: string;
	trend: "up" | "down";
	logo: string;
	tokenAddress: string;
	pairAddress?: string;
	// UI fields
	xp?: string; // displayed in XP column (e.g. time or token metric)
	leverage?: string; // small badge in Market column (e.g. 100x)
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
	sortPrice?: number;
	change24h: string;
	volume: string;
	spread: string;
	trend: "up" | "down";
	logo: string;
	xp?: string;
	leverage?: string;
	marketCap?: string;
	totalLiquidity?: string;
}

interface Asset extends Token {
	type: "crypto" | "forex" | "stocks";
}

export default function Home() {
	const navigate = useNavigate();
	const [searchQuery, setSearchQuery] = useState("");
	const [_currentPage, setCurrentPage] = useState(1);
	const [itemsPerPage, setItemsPerPage] = useState(20);
	const [hasMore, setHasMore] = useState(true);
	const observerTarget = useRef<HTMLDivElement>(null);
	const [apiData, setApiData] = useState({
		stocks: [] as Token[],
		fx: [] as ForexPair[],
		tokens: [] as Token[]
	});
	// UI filter state: all | tokens | fx | stocks
	const [filterType, setFilterType] = useState<
		| "all"
		| "crypto"
		| "forex"
		| "commodities"
		| "rwa"
		| "stocks"
		| "gdp"
		| "nft"
	>("all");

	type FilterKey =
		| "all"
		| "crypto"
		| "forex"
		| "commodities"
		| "rwa"
		| "stocks"
		| "gdp"
		| "nft";
	const [chainFilter] = useState<"all" | string>("all");
	const [onlyPerpMarkets] = useState(false);

	// Search state
	const [searchResults, setSearchResults] = useState<Token[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

	// Helper function to normalize TokenItem to Token
	const normalizeToken = (t: TokenItem, index: number): Token => ({
		id: index + 1,
		symbol: String(t.symbol ?? ""),
		name: String(t.name ?? t.symbol ?? ""),
		price: t.priceUsd ? formatPrice(Number(t.priceUsd)) : "$0.00",
		sortPrice: Number(t.priceUsd) || 0,
		change24h:
			typeof t.change24h === "number"
				? `${t.change24h.toFixed(2)}%`
				: String(t.change24h ?? "0.00%"),
		volume: t.volume24h
			? `$${(Number(t.volume24h) / 1000000).toFixed(2)}M`
			: "N/A",
		marketCap: t.marketCap
			? `$${formatLargeNumber(Number(t.marketCap))}`
			: "N/A",
		trend:
			Number(t.change24h ?? 0) >= 0 ? ("up" as const) : ("down" as const),
		logo: String(t.logo ?? ""),
		tokenAddress: String(t.tokenAddress ?? ""),
		pairAddress: String(t.pairAddress ?? ""),
		totalLiquidity: t.liquidityUsd
			? `$${formatLargeNumber(Number(t.liquidityUsd))}`
			: "$0.00",
		realLiquidity: undefined,
		openInterest: undefined,
		hasMarket: t.hasMarket,
		marketId: t.marketId,
		virtualLiquidity: undefined,
		chain: t.chain || undefined
	});

	const handleTradeClick = (item: Asset) => {
		const params = new URLSearchParams();
		params.set("symbol", item.symbol);

		if ("pairAddress" in item && item.pairAddress) {
			params.set("pairAddress", item.pairAddress);
		}
		params.set("tokenAddress", item.tokenAddress);
		params.set("chain", item.chain || "base");
		params.set("assetType", item.type === "stocks" ? "stock" : item.type);
		navigate(`/perp?${params.toString()}`);
	};

	// Removed external search result click handler; local table rows use handleTradeClick

	// specialized stock/forex trade handlers removed — unified handler `handleTradeClick` manages navigation

	const handleSearchChange = async (
		e: React.ChangeEvent<HTMLInputElement>
	) => {
		const value = e.target.value;
		setSearchQuery(value);

		// Clear previous timeout
		if (searchTimeoutRef.current) {
			clearTimeout(searchTimeoutRef.current);
		}

		// If query is too short, clear search results and use local filtering
		if (value.trim().length < 3 && !value.startsWith("0x")) {
			setSearchResults([]);
			setIsSearching(false);
			return;
		}

		// For addresses, search immediately; for text, debounce
		const isAddress = value.startsWith("0x") && value.length >= 40;
		const delay = isAddress ? 0 : 300;

		searchTimeoutRef.current = setTimeout(async () => {
			setIsSearching(true);
			try {
				const response = await searchTokens(value.trim());
				if (response.success && response.data) {
					const normalizedResults = response.data.map((t, i) =>
						normalizeToken(t, i)
					);
					setSearchResults(normalizedResults);
				} else {
					setSearchResults([]);
				}
			} catch (error) {
				console.error("Search error:", error);
				setSearchResults([]);
			} finally {
				setIsSearching(false);
			}
		}, delay);
	};

	// Cleanup search timeout on unmount
	useEffect(() => {
		return () => {
			if (searchTimeoutRef.current) {
				clearTimeout(searchTimeoutRef.current);
			}
		};
	}, []);

	const [{ loading: isLoadingMore, value: tokensResult }, fetchTokens] =
		useAsyncFn(
			async (
				page: number,
				append: boolean = false,
				chain?: string,
				hasMarket?: boolean | null
			) => {
				const tokensData = await fetchTokensTrending({
					limit: itemsPerPage,
					page,
					chain,
					hasMarket: hasMarket ?? undefined
				});
				// Normalize tokens to the local Token interface
				const normalizedTokens = (
					(tokensData.data ||
						[]) as import("@/hooks/useTrending").TokenItem[]
				).map((t, i) => ({
					id: i + 1,
					symbol: String(t.symbol ?? ""),
					name: String(t.name ?? t.symbol ?? ""),
					price: t.priceUsd
						? formatPrice(Number(t.priceUsd))
						: "$0.00",
					sortPrice: Number(t.priceUsd) || 0,
					change24h:
						typeof t.change24h === "number"
							? `${t.change24h.toFixed(2)}%`
							: String(t.change24h ?? "0.00%"),
					volume: t.volume24h
						? `$${(Number(t.volume24h) / 1000000).toFixed(2)}M`
						: "N/A",
					marketCap: t.marketCap
						? `$${formatLargeNumber(Number(t.marketCap))}`
						: "N/A",
					trend:
						Number(t.change24h ?? 0) >= 0
							? ("up" as const)
							: ("down" as const),
					logo: String(t.logo ?? ""),
					tokenAddress: String(t.tokenAddress ?? ""),
					pairAddress: String(t.pairAddress ?? ""),
					totalLiquidity: t.liquidityUsd
						? `$${formatLargeNumber(Number(t.liquidityUsd))}`
						: "$0.00",
					realLiquidity: undefined,
					openInterest: undefined,
					hasMarket: undefined,
					marketId: undefined,
					virtualLiquidity: undefined,
					chain: t.chain || undefined
				}));

				return {
					tokens: normalizedTokens,
					append,
					hasMore: tokensData.pagination?.hasMore ?? false
				};
			},
			[itemsPerPage]
		);

	const [{ loading: isLoading, value: trendingResult }, fetchTrendingData] =
		useAsyncFn(async () => {
			// Fetch tokens with pagination
			await fetchTokens(
				1,
				false,
				chainFilter === "all" ? undefined : chainFilter,
				onlyPerpMarkets
			);

			// const stocksData = await fetchStocksTrending({ limit: 50 });
			// const fxData = await fetchFXTrending({ limit: 50 });

			return { stocks: [], fx: [], tokens: [] };
			/*
			// Transform stocks data
			const transformedStocks: Token[] = (stocksData.data as import("@/hooks/useTrending").StockItem[]).map(
				(stock, index) => ({
					id: index + 1,
					symbol: stock.symbol,
					name: stock.symbol,
					price: typeof stock.price === "number" ? formatPrice(stock.price) : "$0.00",
					sortPrice: stock.price || 0,
					change24h: stock.change24h ? `${stock.change24h.toFixed(2)}%` : "0.00%",
					volume: stock.volume24h ? `$${formatLargeNumber(stock.volume24h)}` : "N/A",
					marketCap: stock.MarketCap ? `$${formatLargeNumber(Number(stock.MarketCap))}` : "N/A",
					trend: (stock.change24h || 0) >= 0 ? "up" : "down",
					logo: "📈",
					tokenAddress: "",
					totalLiquidity: stock.Liquidity
						? `$${formatLargeNumber(Number(stock.Liquidity))}`
						: "$0.00",
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

				const fxItem = fx as import("@/hooks/useTrending").FXItem;

				return {
					id: index + 1,
					symbol: getDisplaySymbol(fxItem.ticker),
					name: getDisplayName(fxItem.ticker),
					price: fxItem.price.toFixed(4),
					sortPrice: fxItem.price,
					change24h: fxItem.change24h ? `${fxItem.change24h.toFixed(2)}%` : "0.00%",
					volume: fxItem.volume24h ? `$${formatLargeNumber(fxItem.volume24h)}` : "N/A",
					spread: "N/A",
					trend: (fxItem.change24h || 0) >= 0 ? "up" : "down",
					logo: getLogo(fxItem.ticker),
					marketCap: fxItem.MarketCap ? `$${formatLargeNumber(Number(fxItem.MarketCap))}` : "N/A",
					totalLiquidity: fxItem.Liquidity ? `$${formatLargeNumber(Number(fxItem.Liquidity))}` : "$0.00",
				};
			});

			return { stocks: transformedStocks, fx: transformedFX, tokens: [] };
			*/
		}, [fetchTokens]);

	// Update apiData when results change
	useEffect(() => {
		if (tokensResult) {
			setApiData((prev) => ({
				...prev,
				tokens: tokensResult.append
					? [...prev.tokens, ...tokensResult.tokens]
					: tokensResult.tokens
			}));
			setHasMore(tokensResult.hasMore);
		}
	}, [tokensResult]);

	useEffect(() => {
		if (trendingResult) {
			setApiData((prev) => ({
				...prev,
				stocks: trendingResult.stocks,
				fx: trendingResult.fx
			}));
		}
	}, [trendingResult]);

	useEffect(() => {
		fetchTrendingData();
	}, [fetchTrendingData]); // Infinite scroll with Intersection Observer

	// Refetch tokens when chain or perp filter changes
	useEffect(() => {
		setCurrentPage(1);
		fetchTokens(
			1,
			false,
			chainFilter === "all" ? undefined : chainFilter,
			onlyPerpMarkets
		);
	}, [chainFilter, onlyPerpMarkets, fetchTokens]);
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
						fetchTokens(
							nextPage,
							true,
							chainFilter === "all" ? undefined : chainFilter,
							onlyPerpMarkets
						);
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
	}, [
		hasMore,
		isLoadingMore,
		isLoading,
		fetchTokens,
		chainFilter,
		onlyPerpMarkets
	]);

	// Determine which tokens to display:
	// - If we have search results from API (query >= 3 chars or is an address), use those
	// - Otherwise, fall back to local filtering of trending data
	const isApiSearchActive =
		searchQuery.trim().length >= 3 ||
		(searchQuery.startsWith("0x") && searchQuery.length >= 40);

	const filteredTokens =
		isApiSearchActive && searchResults.length > 0
			? searchResults
			: isApiSearchActive && searchResults.length === 0 && !isSearching
			? [] // API search returned no results
			: apiData.tokens.filter(
					(token) =>
						token.name
							.toLowerCase()
							.includes(searchQuery.toLowerCase()) ||
						token.symbol
							.toLowerCase()
							.includes(searchQuery.toLowerCase())
			  );
	const _filteredFX = apiData.fx.filter(
		(pair) =>
			pair.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			pair.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);
	const _filteredStocks = apiData.stocks.filter(
		(stock) =>
			stock.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			stock.symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const combinedAssets: Asset[] = [
		...filteredTokens.map((t) => ({ ...t, type: "crypto" } as Asset))
		// ...filteredFX.map(
		// 	(f) =>
		// 		({
		// 			id:
		// 				Number(`10000${f.symbol}`.split("").reduce((s, c) => s + c.charCodeAt(0), 0)) % 999999,
		// 			symbol: f.symbol,
		// 			name: f.name,
		// 			price: formatPrice(parseFloat(f.price ?? "0")),
		// 			sortPrice: f.sortPrice ?? parseFloat(f.price ?? "0"),
		// 			change24h: f.change24h ?? "0.00%",
		// 			volume: f.volume ?? "N/A",
		// 			marketCap: f.marketCap || "N/A",
		// 			totalLiquidity: f.totalLiquidity ?? "$0.00",
		// 			trend: f.trend,
		// 			logo: typeof f.logo === "string" ? f.logo : String(f.logo),
		// 			xp: f.xp ?? "5:23",
		// 			leverage: f.leverage ?? "50x",
		// 			type: "forex",
		// 		}) as Asset,
		// ),
		// ...filteredStocks.map((s) => ({ ...s, type: "stocks" }) as Asset),
	]
		.filter((a) => {
			if (filterType === "all") return true;
			if (filterType === "crypto") return a.type === "crypto";
			if (filterType === "forex") return a.type === "forex";
			if (filterType === "stocks") return a.type === "stocks";
			// The other categories (commodities, rwa, gdp, nft) currently map to none
			return false;
		})
		.sort((a, b) => {
			const priceA = a.sortPrice ?? 0;
			const priceB = b.sortPrice ?? 0;
			return priceB - priceA; // High to low
		});
	// Filter tabs with typed keys to satisfy TypeScript and enable mapping
	const filterTabs = [
		["all", "All"],
		["crypto", "Crypto"]
		// ["forex", "Forex"],
		// ["commodities", "Commodities"],
		// ["rwa", "RWA's"],
		// ["stocks", "Stocks"],
		// ["gdp", "GDP"],
		// ["nft", "NFT"],
	] as const;

	return (
		<>
			<div className="border-l border-r border-[#202020]">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
					<div className="flex-1 min-w-0 flex items-center gap-4">
						<div className="relative w-80">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
							<Input
								type="text"
								placeholder="Search Base tokens by symbol, address, or pair address..."
								value={searchQuery}
								onChange={handleSearchChange}
								className="py-6 pl-10 h-full border-0 border-r rounded-none focus-visible:ring-0 focus-visible:border-0"
							/>
						</div>
					</div>

					<div className="flex-none w-full sm:w-auto">
						<nav className="flex gap-4 items-center justify-start sm:justify-end overflow-x-auto px-1">
							{filterTabs.map(([key, label]) => (
								<button
									type="button"
									key={String(key)}
									onClick={() =>
										setFilterType(key as FilterKey)
									}
									className={`text-sm font-medium px-3 py-2 -mb-px whitespace-nowrap uppercase ${
										filterType === key
											? "text-[#0BB37E] border-b-2 border-[#0BB37E]"
											: "text-[#9AA0A0] hover:text-[#ffffff]"
									}`}
								>
									{label}
								</button>
							))}
						</nav>
					</div>
				</div>
			</div>
			<div className="space-y-8">
				<div className="relative">
					<div className="overflow-hidden border border-[#202020] bg-[#060606] shadow-[0_6px_24px_rgba(0,0,0,0.6)]">
						<div className="p-0">
							<div className="overflow-x-auto">
								<table className="w-full min-w-[900px] border-collapse">
									<thead>
										<tr className="border-b border-[#222022] bg-[#070707] p-0">
											<th className="text-left px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider">
												Market
											</th>
											<th className="text-left px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[72px]">
												XP
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[110px]">
												Price
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[140px]">
												Market Cap
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[140px]">
												Total Liquidity
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[120px]">
												24h Change
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[120px]">
												Open Interest
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[120px]">
												24h Volume
											</th>
										</tr>
									</thead>
									<tbody>
										{isLoading ||
										isSearching ||
										(isLoadingMore &&
											_currentPage === 1) ? (
											// eslint-disable-next-line react/no-array-index-key
											Array.from({ length: 10 }).map(
												(_, i) => (
													<tr
														key={`skeleton-${i}`}
														className="border-b border-[#1e1e1e]"
													>
														<td className="px-4 py-4 align-middle">
															<div className="flex items-center gap-4">
																<Skeleton className="w-11 h-11 rounded-full" />
																<div className="min-w-0">
																	<Skeleton className="h-4 w-16 mb-1" />
																	<Skeleton className="h-3 w-24" />
																</div>
															</div>
														</td>
														<td className="px-4 py-4 text-center">
															<Skeleton className="h-5 w-12 mx-auto" />
														</td>
														<td className="px-4 py-4 text-right">
															<Skeleton className="h-4 w-20 ml-auto" />
														</td>
														<td className="px-4 py-4 text-right">
															<Skeleton className="h-4 w-16 ml-auto" />
														</td>
														<td className="px-4 py-4 text-right">
															<Skeleton className="h-4 w-16 ml-auto" />
														</td>
														<td className="px-4 py-4 text-right">
															<Skeleton className="h-4 w-16 ml-auto" />
														</td>
														<td className="px-4 py-4 text-right">
															<Skeleton className="h-4 w-16 ml-auto" />
														</td>
														<td className="px-4 py-4 text-right">
															<Skeleton className="h-4 w-16 ml-auto" />
														</td>
													</tr>
												)
											)
										) : combinedAssets.length > 0 ? (
											combinedAssets.map(
												(item: Asset, idx: number) => (
													<tr
														key={`${item.type}-${item.id}-${idx}`}
														className="border-b border-[#1e1e1e] hover:bg-[#0b0b0b] transition-colors hover:border hover:border-[#0BB37E]/40 cursor-pointer"
														onClick={() =>
															handleTradeClick(
																item
															)
														}
													>
														<td className="px-4 py-4 align-middle">
															<div className="flex items-center gap-4">
																<div className="relative">
																	<div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden border border-[#2c2c2c] bg-[#0b0b0b]">
																		{item.logo?.startsWith?.(
																			"http"
																		) ? (
																			<img
																				src={
																					item.logo
																				}
																				alt={
																					item.symbol
																				}
																				width={
																					44
																				}
																				height={
																					44
																				}
																				className="w-full h-full object-cover"
																			/>
																		) : (
																			<span className="text-sm">
																				{item.logo ||
																					"🪙"}
																			</span>
																		)}
																	</div>
																	{item.leverage && (
																		<div className="absolute -right-1 -bottom-1 text-xs bg-[#0BB37E] text-black px-1.5 py-0.5 rounded-full border border-[#0A7F57]">
																			{
																				item.leverage
																			}
																		</div>
																	)}
																</div>
																<div className="min-w-0">
																	<div className="text-[#E9F0EF] font-semibold text-sm leading-5 truncate">
																		{
																			item.symbol
																		}
																	</div>
																	<div className="text-[#9AA0A0] text-xs truncate">
																		{
																			item.name
																		}
																	</div>
																</div>
															</div>
														</td>
														<td className="px-4 py-4 text-center">
															<div className="inline-block bg-[#080a07] text-[#9ef0c6] px-2 py-1 rounded text-xs font-semibold">
																{item.xp ??
																	"5:23"}
															</div>
														</td>
														<td className="px-4 py-4 text-right text-[#E9F0EF] font-semibold text-sm">
															{item.price}
														</td>
														<td className="px-4 py-4 text-right text-[#9AA0A0] text-sm">
															{item.marketCap ||
																"N/A"}
														</td>
														<td className="px-4 py-4 text-right text-[#9AA0A0] text-sm">
															{item.totalLiquidity ??
																"$0.00"}
														</td>
														<td className="px-4 py-4 text-right">
															<div className="inline-flex items-center gap-2 justify-end">
																<div
																	className={`inline-flex items-center gap-1 px-2 py-1 ${
																		item.trend ===
																		"up"
																			? "text-[#30E5A7]"
																			: "text-[#FF6B6B]"
																	}`}
																>
																	{item.trend ===
																	"up" ? (
																		<ArrowUpRight className="w-3 h-3" />
																	) : (
																		<ArrowDownRight className="w-3 h-3" />
																	)}
																	<span className="font-medium text-sm">
																		{
																			item.change24h
																		}
																	</span>
																</div>
															</div>
														</td>
														<td className="px-4 py-4 text-right text-[#9AA0A0] text-sm">
															{item.openInterest ??
																"$0.00"}
														</td>
														<td className="px-4 py-4 text-right text-[#9AA0A0] text-sm">
															{item.volume ??
																"N/A"}
														</td>
													</tr>
												)
											)
										) : (
											<tr>
												<td
													colSpan={8}
													className="p-12 text-center"
												>
													<div className="flex flex-col items-center gap-2">
														<div className="text-muted-foreground">
															{isApiSearchActive
																? `No results found for "${searchQuery}"`
																: "No items found"}
														</div>
														<div className="text-sm text-muted-foreground">
															{isApiSearchActive
																? "Try searching by token symbol, name, or contract address"
																: "No data available"}
														</div>
													</div>
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>
					</div>
					<div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 bg-linear-to-r from-[#083b28]/10 to-transparent" />
				</div>
			</div>

			<div className="border-t border-[#222222] bg-[#060606] p-3 flex items-center justify-between text-sm text-[#9AA0A0]">
				<div className="flex items-center gap-2">
					<span>Rows Per Page:</span>
					<select
						value={itemsPerPage}
						onChange={(e) =>
							setItemsPerPage(Number(e.target.value))
						}
						className="bg-[#050505] border border-[#1f1f1f] px-2 py-1 text-sm rounded text-[#E8F0EF]"
					>
						<option value="10">10</option>
						<option value="20">20</option>
						<option value="50">50</option>
					</select>
				</div>
				<div className="flex items-center gap-3 text-[#bfc7c7]">
					<div className="text-[#9AA0A0]">&lt;&lt;</div>
					<div className="text-[#9AA0A0]">&lt;</div>
					<div className="px-2">Page 1 of 25</div>
					<div className="text-[#9AA0A0]">&gt;</div>
					<div className="text-[#9AA0A0]">&gt;&gt;</div>
				</div>
			</div>
		</>
	);
}
