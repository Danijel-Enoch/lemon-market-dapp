import { Button } from "@app/components/ui/button";
import { type ColumnDef, DataTable, type FilterTab } from "@app/components/ui/data-table";
import { Skeleton } from "@app/components/ui/skeleton";
import {
	getLiquidityPositions,
	getMarkets,
	type LiquidityPosition,
	type Market,
} from "@app/lib/liquidity-api";
import { formatLargeNumber } from "@app/lib/utils";
import { Loader2, Minus, Plus, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLoaderData, useSearchParams, useNavigate } from "react-router";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";

export const metadata = {
	title: "Liquidity - Lemon Markets",
	description: "Provide liquidity and earn rewards",
};

export const handle = {
	authTitle: "Connect Wallet to View Liquidity",
	authDescription: "Connect your wallet to provide liquidity and earn trading fees.",
	authIcon: Wallet,
};

type FilterKey = "all" | "my-positions";

// Extended market type with APR
type MarketWithApr = Market & { apr: number };

// Display item that combines market data with position info
interface DisplayMarket extends MarketWithApr {
	position?: LiquidityPosition;
	marketName: string;
	totalLiquidity: string;
	totalExposure: string;
	longValue: string;
	shortValue: string;
	positionValue: string;
}

export async function loader() {
	const response = await getMarkets();
	if (response.success) {
		// Add random APR for now as requested
		const marketsWithApr = response.data.map((m) => ({
			...m,
			apr: Math.floor(Math.random() * 20) + 5, // 5-24%
		}));
		return { initialMarkets: marketsWithApr };
	}
	return { initialMarkets: [], error: response.error || "Failed to fetch markets" };
}

// Column definitions for the liquidity table
const getColumns = (): ColumnDef<DisplayMarket>[] => [
	{
		key: "pool",
		header: "Pool",
		headerAlign: "left",
		cellAlign: "left",
		render: (item) => (
			<div className="flex items-center gap-4">
				<div className="relative">
					<div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden border border-[#2c2c2c] bg-[#0b0b0b]">
						<span className="text-lg">🍋</span>
					</div>
					{item.position && (
						<div className="absolute -right-1 -bottom-1 text-xs bg-[#a3e635] text-black px-1.5 py-0.5 rounded-full border border-[#84cc16]">
							LP
						</div>
					)}
				</div>
				<div className="min-w-0">
					<div className="text-[#E9F0EF] font-semibold text-sm leading-5 truncate">
						{item.marketName} Pool
					</div>
					<div className="text-[#9AA0A0] text-xs truncate">
						{item.onChainData.longPositionCount + item.onChainData.shortPositionCount} positions
					</div>
				</div>
			</div>
		),
		skeleton: () => (
			<div className="flex items-center gap-4">
				<Skeleton className="w-11 h-11 rounded-full" />
				<div className="min-w-0">
					<Skeleton className="h-4 w-24 mb-1" />
					<Skeleton className="h-3 w-16" />
				</div>
			</div>
		),
	},
	{
		key: "apr",
		header: "APR",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[100px]",
		render: (item) => (
			<div className="inline-block bg-[#1a2e14] text-[#a3e635] px-2 py-1 rounded text-xs font-semibold">
				{item.apr}%
			</div>
		),
		skeleton: () => <Skeleton className="h-4 w-12 ml-auto" />,
	},
	{
		key: "totalLiquidity",
		header: "Total Liquidity",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[140px]",
		render: (item) => (
			<span className="text-[#a3e635] font-semibold text-sm">{item.totalLiquidity}</span>
		),
		skeleton: () => <Skeleton className="h-4 w-20 ml-auto" />,
	},
	{
		key: "totalExposure",
		header: "Total Exposure",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[140px]",
		render: (item) => <span className="text-[#E9F0EF] text-sm">{item.totalExposure}</span>,
		skeleton: () => <Skeleton className="h-4 w-20 ml-auto" />,
	},
	{
		key: "longs",
		header: "Longs",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[120px]",
		render: (item) => (
			<>
				<span className="text-green-500 text-sm">{item.longValue}</span>
				<div className="text-xs text-[#9AA0A0]">{item.onChainData.longPositionCount} pos</div>
			</>
		),
		skeleton: () => <Skeleton className="h-4 w-16 ml-auto" />,
	},
	{
		key: "shorts",
		header: "Shorts",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[120px]",
		render: (item) => (
			<>
				<span className="text-red-500 text-sm">{item.shortValue}</span>
				<div className="text-xs text-[#9AA0A0]">{item.onChainData.shortPositionCount} pos</div>
			</>
		),
		skeleton: () => <Skeleton className="h-4 w-16 ml-auto" />,
	},
	{
		key: "yourPosition",
		header: "Your Position",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[140px]",
		render: (item) => (
			<span className="text-[#E9F0EF] font-semibold text-sm">
				{item.position ? item.positionValue : "-"}
			</span>
		),
		skeleton: () => <Skeleton className="h-4 w-16 ml-auto" />,
	},
	{
		key: "actions",
		header: "Actions",
		headerAlign: "right",
		cellAlign: "right",
		width: "w-[120px]",
		render: (item) => (
			// biome-ignore lint/a11y/useKeyWithClickEvents: no need
			<div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
				{item.position ? (
					<Button size="sm" variant="outline" asChild>
						<Link to="/liquidity/remove">
							<Minus className="h-3 w-3" />
						</Link>
					</Button>
				) : null}
				<Button size="sm" asChild>
					<Link to="/liquidity/add">
						<Plus className="h-3 w-3" />
					</Link>
				</Button>
			</div>
		),
		skeleton: () => <Skeleton className="h-8 w-16 ml-auto" />,
	},
];

// Calculate position value
const calculatePositionValue = (position: LiquidityPosition | undefined): string => {
	if (
		!position?.lpTokensReceived ||
		!position.onChainData.virtualLiquidity ||
		Number(position.onChainData.totalShares) <= 0
	) {
		return "$0.00";
	}
	const value =
		(Number(position.lpTokenDetails?.balance || position.lpTokensReceived) /
			Number(position.onChainData.totalShares)) *
		Number(position.onChainData.virtualLiquidity) *
		1e-6;
	return `$${value.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
};

export default function LiquidityPage() {
	const { initialMarkets, error: loaderError } = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { address } = useAccount();

	// State
	const [searchQuery, setSearchQuery] = useState("");
	const [markets] = useState<MarketWithApr[]>(initialMarkets);
	const [positions, setPositions] = useState<LiquidityPosition[]>([]);
	const [isLoadingPositions, setIsLoadingPositions] = useState(true);
	const [error] = useState<string | null>(loaderError || null);

	const filterType = (searchParams.get("tab") as FilterKey) || "all";

	const setSearchParam = (key: string, value: string) => {
		const newParams = new URLSearchParams(searchParams);
		if (value === "all" || !value) {
			newParams.delete(key);
		} else {
			newParams.set(key, value);
		}
		navigate(`?${newParams.toString()}`, { replace: true });
	};

	// Fetch user positions
	useEffect(() => {
		const fetchPositions = async () => {
			if (!address) {
				setIsLoadingPositions(false);
				return;
			}
			try {
				const response = await getLiquidityPositions(address);
				if (response.success) {
					setPositions(response.data);
				}
			} catch (e) {
				console.error(e);
			} finally {
				setIsLoadingPositions(false);
			}
		};
		fetchPositions();
	}, [address]);

	// Filter markets based on search
	const filteredMarkets = useMemo(() => {
		return markets.filter((market) => {
			const marketName = market.onChainData.marketId.split("-")[0] || "Unknown";
			return marketName.toLowerCase().includes(searchQuery.toLowerCase());
		});
	}, [markets, searchQuery]);

	// Get position market IDs for filtering
	const positionMarketIds = useMemo(() => {
		return new Set(positions.map((p) => p.marketId));
	}, [positions]);

	// Transform markets to display items
	const displayMarkets: DisplayMarket[] = useMemo(() => {
		const filtered =
			filterType === "my-positions"
				? filteredMarkets.filter((m) => positionMarketIds.has(m.marketId))
				: filteredMarkets;

		return filtered.map((market) => {
			const position = positions.find((p) => p.marketId === market.marketId);
			const marketName = market.onChainData.marketId.split("-")[0] || "Unknown";
			const totalLiquidity = market.onChainData.virtualLiquidity
				? `$${formatLargeNumber(Number(formatUnits(BigInt(market.onChainData.virtualLiquidity), 6)))}`
				: "$0";
			const totalExposure = market.exposure?.totalExposure
				? `$${formatLargeNumber(Number(formatUnits(BigInt(market.exposure.totalExposure), 6)))}`
				: "$0";
			const longValue = market.exposure?.totalLong
				? `$${formatLargeNumber(Number(formatUnits(BigInt(market.exposure.totalLong), 6)))}`
				: "$0";
			const shortValue = market.exposure?.totalShort
				? `$${formatLargeNumber(Number(formatUnits(BigInt(market.exposure.totalShort), 6)))}`
				: "$0";
			const positionValue = calculatePositionValue(position);

			return {
				...market,
				position,
				marketName,
				totalLiquidity,
				totalExposure,
				longValue,
				shortValue,
				positionValue,
			};
		});
	}, [filteredMarkets, filterType, positionMarketIds, positions]);

	const filterTabs: FilterTab[] = [
		{ key: "all", label: "All Pools" },
		{
			key: "my-positions",
			label: `My Positions${positions.length > 0 ? ` (${positions.length})` : ""}`,
		},
	];

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
	};

	const isLoading = isLoadingPositions && filterType === "my-positions";

	const columns = getColumns();

	// Determine empty state content
	const getEmptyContent = () => {
		if (isLoadingPositions) {
			return {
				title: "",
				description: "",
				action: <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />,
			};
		}
		if (filterType === "my-positions") {
			return {
				title: "You don't have any liquidity positions yet",
				description: "Add liquidity to a pool to start earning trading fees",
				action: (
					<Button asChild className="mt-4">
						<Link to="/liquidity/add">
							<Plus className="mr-2 h-4 w-4" />
							Add Liquidity
						</Link>
					</Button>
				),
			};
		}
		if (searchQuery) {
			return {
				title: `No pools found for "${searchQuery}"`,
				description: "Try adjusting your search or check back later",
				action: undefined,
			};
		}
		return {
			title: "No pools available",
			description: "Try adjusting your search or check back later",
			action: undefined,
		};
	};

	const emptyContent = getEmptyContent();

	return (
		<>
			{/* Header */}
			<div className="flex items-center justify-between mb-6 mt-8">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Liquidity</h1>
					<p className="text-muted-foreground text-xs">
						Provide liquidity to pools and earn trading fees
					</p>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link to="/liquidity/remove">
							<Minus className="mr-2 h-4 w-4" />
							Remove Liquidity
						</Link>
					</Button>
					<Button asChild>
						<Link to="/liquidity/add">
							<Plus className="mr-2 h-4 w-4" />
							Add Liquidity
						</Link>
					</Button>
				</div>
			</div>

			{/* Error State */}
			{error && (
				<div className="p-4 text-center text-sm text-red-500 border border-red-500/20 rounded-lg bg-red-500/5 mt-4">
					{error}
				</div>
			)}

			<DataTable
				data={displayMarkets}
				isLoading={isLoading}
				skeletonCount={5}
				searchPlaceholder="Search pools by name..."
				searchValue={searchQuery}
				onSearchChange={handleSearchChange}
				filterTabs={filterTabs}
				activeFilter={filterType}
				onFilterChange={(value) => setSearchParam("tab", value)}
				columns={columns}
				getRowKey={(item, idx) => `${item.marketId}-${idx}`}
				emptyTitle={emptyContent.title}
				emptyDescription={emptyContent.description}
				emptyAction={emptyContent.action}
				footer={
					<>
						<div className="flex items-center gap-4">
							<span>
								Total Pools: <span className="text-[#E8F0EF]">{markets.length}</span>
							</span>
							{positions.length > 0 && (
								<span>
									Your Positions: <span className="text-[#a3e635]">{positions.length}</span>
								</span>
							)}
						</div>
						<div className="text-[#9AA0A0]">
							Showing {displayMarkets.length} of {markets.length} pools
						</div>
					</>
				}
			/>
		</>
	);
}
