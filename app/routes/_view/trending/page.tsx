import { type ColumnDef, DataTable, type FilterTab } from "@app/components/ui/data-table";
import { Skeleton } from "@app/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@app/components/ui/select";
import { fetchTokensTrending, searchTokens, type TokenItem } from "@app/hooks/useTrending";
import type { MetaFunction } from "react-router";
import { formatLargeNumber, formatPrice } from "@app/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/page";

export const meta: MetaFunction = () => {
	return [
		{ title: "Trending - Lemon Markets" },
		{ name: "description", content: "Discover trending tokens and market opportunities" },
	];
};

export async function loader({ request }: { request: Request }) {
	const url = new URL(request.url);
	const chain = url.searchParams.get("chain") || "base";
	const sort = url.searchParams.get("sort") || "liquidity";
	const limit = Number(url.searchParams.get("limit")) || 20;

	const tokensData = await fetchTokensTrending({
		limit,
		page: 1,
		chain: chain === "all" ? undefined : chain,
		sort,
	});

	return {
		initialTokens: tokensData.data || [],
		initialHasMore: tokensData.pagination?.hasMore ?? false,
		chain,
		sort,
	};
}

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
	xp?: string;
	leverage?: string;
	totalLiquidity?: string;
	realLiquidity?: string;
	openInterest?: string;
	hasMarket?: boolean;
	marketId?: string | null;
	virtualLiquidity?: string;
	chain?: string;
	chainId?: string;
}

interface Asset extends Token {
	type: "crypto" | "forex" | "stocks";
}

type FilterKey = "all" | "crypto" | "forex" | "commodities" | "rwa" | "stocks" | "gdp" | "nft";

// Helper function to normalize TokenItem to Token
const normalizeToken = (t: TokenItem, index: number): Token => ({
	id: index + 1,
	symbol: String(t.symbol ?? ""),
	name: String(t.name ?? t.symbol ?? ""),
	price: t.priceUsd ? formatPrice(Number(t.priceUsd)) : "$0.00",
	sortPrice: Number(t.priceUsd) || 0,
	change24h:
		typeof t.change24h === "number" ? `${t.change24h.toFixed(2)}%` : String(t.change24h ?? "0.00%"),
	volume: t.volume24h ? `$${(Number(t.volume24h) / 1000000).toFixed(2)}M` : "N/A",
	marketCap: t.marketCap ? `$${formatLargeNumber(Number(t.marketCap))}` : "N/A",
	trend: Number(t.change24h ?? 0) >= 0 ? ("up" as const) : ("down" as const),
	logo: String(t.logo ?? ""),
	tokenAddress: String(t.tokenAddress ?? ""),
	pairAddress: String(t.pairAddress ?? ""),
	totalLiquidity: t.liquidityUsd ? `$${formatLargeNumber(Number(t.liquidityUsd))}` : "$0.00",
	realLiquidity: undefined,
	openInterest: undefined,
	hasMarket: t.hasMarket,
	marketId: t.marketId,
	virtualLiquidity: undefined,
	chain: t.chain || undefined,
});

// Helper to determine initial items per page based on viewport
const getInitialItemsPerPage = () => {
	if (typeof window === "undefined") return 20;
	return window.innerWidth < 768 ? 10 : 20;
};

// Column definitions for the trending table
const getColumns = (): ColumnDef<Asset>[] => [
	{
		key: "market",
		header: "Market",
		headerAlign: "left",
		cellAlign: "left",
		render: (item) => (
			<div className="flex items-center gap-4">
				<div className="relative">
					<div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden border border-[#2c2c2c] bg-[#0b0b0b]">
						{item.logo?.startsWith?.("http") ? (
							<img
								src={item.logo}
								alt={item.symbol}
								width={44}
								height={44}
								className="w-full h-full object-cover"
							/>
						) : (
							<span className="text-sm">{item.logo || "🪙"}</span>
						)}
					</div>
					{item.leverage && (
						<div className="absolute -right-1 -bottom-1 text-xs bg-[#a3e635] text-black px-1.5 py-0.5 rounded-full border border-[#84cc16]">
							{item.leverage}
						</div>
					)}
				</div>
				<div className="min-w-0">
					<div className="text-[#E9F0EF] font-semibold text-sm leading-5 truncate">
						{item.symbol}
					</div>
					<div className="text-[#9AA0A0] text-xs truncate">{item.name}</div>
				</div>
			</div>
		),
		skeleton: () => (
			<div className="flex items-center gap-4">
				<Skeleton className="w-11 h-11 rounded-full" />
				<div className="min-w-0">
					<Skeleton className="h-4 w-16 mb-1" />
					<Skeleton className="h-3 w-24" />
				</div>
			</div>
		),
	},
	{
		key: "xp",
		header: "XP",
		headerAlign: "left",
		cellAlign: "center",
		width: "w-[72px]",
		render: (item) => (
			<div className="inline-block bg-[#1a2e14] text-[#a3e635] px-2 py-1 rounded text-xs font-semibold">
				{item.xp ?? "5:23"}
			</div>
		),
		skeleton: () => <Skeleton className="h-5 w-12 mx-auto" />,
	},
	{
		key: "price",
		header: "Price",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[110px]",
		render: (item) => <span className="text-[#E9F0EF] font-semibold text-sm">{item.price}</span>,
		skeleton: () => <Skeleton className="h-4 w-20 ml-auto" />,
	},
	{
		key: "marketCap",
		header: "Market Cap",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[140px]",
		render: (item) => <span className="text-[#9AA0A0] text-sm">{item.marketCap || "N/A"}</span>,
		skeleton: () => <Skeleton className="h-4 w-16 ml-auto" />,
	},
	{
		key: "totalLiquidity",
		header: "Total Liquidity",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[140px]",
		render: (item) => (
			<span className="text-[#9AA0A0] text-sm">{item.totalLiquidity ?? "$0.00"}</span>
		),
		skeleton: () => <Skeleton className="h-4 w-16 ml-auto" />,
	},
	{
		key: "change24h",
		header: "24h Change",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[120px]",
		render: (item) => (
			<div className="inline-flex items-center gap-2 justify-end">
				<div
					className={`inline-flex items-center gap-1 px-2 py-1 ${
						item.trend === "up" ? "text-[#a3e635]" : "text-[#FF6B6B]"
					}`}
				>
					{item.trend === "up" ? (
						<ArrowUpRight className="w-3 h-3" />
					) : (
						<ArrowDownRight className="w-3 h-3" />
					)}
					<span className="font-medium text-sm">{item.change24h}</span>
				</div>
			</div>
		),
		skeleton: () => <Skeleton className="h-4 w-16 ml-auto" />,
	},
	{
		key: "openInterest",
		header: "Open Interest",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[120px]",
		render: (item) => (
			<span className="text-[#9AA0A0] text-sm">{item.openInterest ?? "$0.00"}</span>
		),
		skeleton: () => <Skeleton className="h-4 w-16 ml-auto" />,
	},
	{
		key: "volume",
		header: "24h Volume",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[120px]",
		render: (item) => <span className="text-[#9AA0A0] text-sm">{item.volume ?? "N/A"}</span>,
		skeleton: () => <Skeleton className="h-4 w-16 ml-auto" />,
	},
];

export default function Home({ loaderData: { initialTokens } }: Route.ComponentProps) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [searchQuery, setSearchQuery] = useState("");
	// Initialize with default (SSR-safe) value and update on mount
	const [itemsPerPage, setItemsPerPage] = useState(getInitialItemsPerPage());

	const filterType = (searchParams.get("type") as FilterKey) || "all";
	const chainFilter = searchParams.get("chain") || "all";

	const setSearchParam = (key: string, value: string) => {
		const newParams = new URLSearchParams(searchParams);
		if (value === "all" || !value) {
			newParams.delete(key);
		} else {
			newParams.set(key, value);
		}
		navigate(`?${newParams.toString()}`, { replace: true });
	};

	// Search state
	const [searchResults, setSearchResults] = useState<Token[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

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

	const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
					const normalizedResults = response.data.map((t, i) => normalizeToken(t, i));
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

	const isApiSearchActive =
		searchQuery.trim().length >= 3 || (searchQuery.startsWith("0x") && searchQuery.length >= 40);

	const normalizedInitialTokens = initialTokens.map((t, i) => normalizeToken(t as TokenItem, i));

	const filteredTokens =
		isApiSearchActive && searchResults.length > 0
			? searchResults
			: isApiSearchActive && searchResults.length === 0 && !isSearching
				? [] // API search returned no results
				: normalizedInitialTokens.filter(
						(token) =>
							token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
							token.symbol.toLowerCase().includes(searchQuery.toLowerCase()),
					);

	const combinedAssets: Asset[] = [
		...filteredTokens.map((t) => ({ ...t, type: "crypto" }) as Asset),
	]
		.filter((a) => {
			if (filterType === "all") return true;
			if (filterType === "crypto") return a.type === "crypto";
			if (filterType === "forex") return a.type === "forex";
			if (filterType === "stocks") return a.type === "stocks";
			return false;
		})
		.sort((a, b) => {
			const priceA = a.sortPrice ?? 0;
			const priceB = b.sortPrice ?? 0;
			return priceB - priceA; // High to low
		});

	// Filter tabs
	const filterTabs: FilterTab[] = [
		{ key: "all", label: "All" },
		{ key: "crypto", label: "Crypto" },
	];

	// Chain options
	const chainOptions = [
		{ value: "all", label: "All Chains" },
		{ value: "base", label: "Base" },
		{ value: "arbitrum", label: "Arbitrum" },
		{ value: "solana", label: "Solana" },
	];

	const columns = getColumns();

	return (
		<DataTable
			data={combinedAssets}
			isLoading={isSearching && combinedAssets.length === 0}
			skeletonCount={10}
			searchPlaceholder="Search Base tokens by symbol, address, or pair address..."
			searchValue={searchQuery}
			onSearchChange={handleSearchChange}
			filterTabs={filterTabs}
			activeFilter={filterType}
			onFilterChange={(value) => setSearchParam("type", value)}
			showChainFilter
			chainOptions={chainOptions}
			chainFilter={chainFilter}
			onChainChange={(v) => setSearchParam("chain", v)}
			columns={columns}
			getRowKey={(item, idx) => `${item.type}-${item.id}-${idx}`}
			onRowClick={handleTradeClick}
			emptyTitle={isApiSearchActive ? `No results found for "${searchQuery}"` : "No items found"}
			emptyDescription={
				isApiSearchActive
					? "Try searching by token symbol, name, or contract address"
					: "No data available"
			}
			footer={
				<>
					<div className="flex items-center gap-2">
						<span>Rows Per Page:</span>
						<Select
							value={String(itemsPerPage)}
							onValueChange={(value) => setItemsPerPage(Number(value))}
						>
							<SelectTrigger className="w-[70px] bg-[#050505] border-[#1f1f1f] text-[#E8F0EF]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="10">10</SelectItem>
								<SelectItem value="20">20</SelectItem>
								<SelectItem value="50">50</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-center gap-3 text-[#bfc7c7]">
						<div className="text-[#9AA0A0]">&lt;&lt;</div>
						<div className="text-[#9AA0A0]">&lt;</div>
						<div className="px-2">Page 1 of 25</div>
						<div className="text-[#9AA0A0]">&gt;</div>
						<div className="text-[#9AA0A0]">&gt;&gt;</div>
					</div>
				</>
			}
		/>
	);
}
