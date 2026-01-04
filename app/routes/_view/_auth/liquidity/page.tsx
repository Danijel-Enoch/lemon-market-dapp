import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Skeleton } from "@app/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import {
	getLiquidityPositions,
	getMarkets,
	type LiquidityPosition,
	type Market,
} from "@app/lib/liquidity-api";
import { formatLargeNumber } from "@app/lib/utils";
import { Loader2, Minus, Plus, Search, Wallet } from "lucide-react";
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

	// Filter based on tab
	const displayMarkets = useMemo(() => {
		if (filterType === "my-positions") {
			return filteredMarkets.filter((m) => positionMarketIds.has(m.marketId));
		}
		return filteredMarkets;
	}, [filteredMarkets, filterType, positionMarketIds]);

	// Get position for a market
	const getPositionForMarket = (marketId: string) => {
		return positions.find((p) => p.marketId === marketId);
	};

	const filterTabs = [
		["all", "All Pools"],
		["my-positions", `My Positions${positions.length > 0 ? ` (${positions.length})` : ""}`],
	] as const;

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
	};

	const isLoading = isLoadingPositions && filterType === "my-positions";

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

			{/* Search and Filters Row */}
			<div className="border-l border-r border-[#202020]">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
					<div className="flex-1 min-w-0 flex items-center gap-4 w-full">
						<div className="relative w-full md:w-80">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
							<Input
								type="text"
								placeholder="Search pools by name..."
								value={searchQuery}
								onChange={handleSearchChange}
								className="py-6 pl-10 h-full border-0 border-r rounded-none focus-visible:ring-0 focus-visible:border-0 w-full"
							/>
						</div>
					</div>

					<div className="flex-none w-full sm:w-auto flex items-center gap-2">
						<Tabs
							value={filterType}
							onValueChange={(value) => setSearchParam("tab", value)}
							className="w-full sm:w-auto"
						>
							<TabsList className="h-auto p-0 bg-transparent border-b-0 space-x-4">
								{filterTabs.map(([key, label]) => (
									<TabsTrigger
										key={String(key)}
										value={key}
										className="text-sm font-medium px-3 py-2 -mb-px hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-[#a3e635] data-[state=active]:text-[#a3e635] rounded-none shadow-none"
									>
										{label}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
					</div>
				</div>
			</div>

			{/* Error State */}
			{error && (
				<div className="p-4 text-center text-sm text-red-500 border border-red-500/20 rounded-lg bg-red-500/5 mt-4">
					{error}
				</div>
			)}

			{/* Table */}
			<div className="space-y-8">
				<div className="relative">
					<div className="overflow-hidden border border-[#202020] bg-[#060606] shadow-[0_6px_24px_rgba(0,0,0,0.6)]">
						<div className="p-0">
							<div className="overflow-x-auto">
								<table className="w-full min-w-[900px] border-collapse">
									<thead>
										<tr className="border-b border-[#222022] bg-[#070707] p-0">
											<th className="text-left px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider">
												Pool
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[100px]">
												APR
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[140px]">
												Total Liquidity
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[140px]">
												Total Exposure
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[120px]">
												Longs
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[120px]">
												Shorts
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[140px]">
												Your Position
											</th>
											<th className="text-right px-4 py-3 text-[#BFC7C7] font-semibold text-xs uppercase tracking-wider w-[120px]">
												Actions
											</th>
										</tr>
									</thead>
									<tbody>
										{isLoading ? (
											// Skeleton loading state
											Array.from({ length: 5 }).map((_, i) => (
												<tr
													key={`skeleton-${
														// biome-ignore lint/suspicious/noArrayIndexKey: needed
														i
													}`}
													className="border-b border-[#1e1e1e]"
												>
													<td className="px-4 py-4 align-middle">
														<div className="flex items-center gap-4">
															<Skeleton className="w-11 h-11 rounded-full" />
															<div className="min-w-0">
																<Skeleton className="h-4 w-24 mb-1" />
																<Skeleton className="h-3 w-16" />
															</div>
														</div>
													</td>
													<td className="px-4 py-4 text-right">
														<Skeleton className="h-4 w-12 ml-auto" />
													</td>
													<td className="px-4 py-4 text-right">
														<Skeleton className="h-4 w-20 ml-auto" />
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
														<Skeleton className="h-8 w-16 ml-auto" />
													</td>
												</tr>
											))
										) : displayMarkets.length > 0 ? (
											displayMarkets.map((market, idx) => {
												const position = getPositionForMarket(market.marketId);
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

												// Calculate position value
												let positionValue = "$0.00";
												if (
													position?.lpTokensReceived &&
													position.onChainData.virtualLiquidity &&
													Number(position.onChainData.totalShares) > 0
												) {
													const value =
														(Number(position.lpTokenDetails?.balance || position.lpTokensReceived) /
															Number(position.onChainData.totalShares)) *
														Number(position.onChainData.virtualLiquidity) *
														1e-6;
													positionValue = `$${value.toLocaleString(undefined, {
														minimumFractionDigits: 2,
														maximumFractionDigits: 2,
													})}`;
												}

												return (
													<tr
														key={`${market.marketId}-${idx}`}
														className="border-b border-[#1e1e1e] hover:bg-[#0b0b0b] transition-colors hover:border hover:border-[#a3e635]/40"
													>
														<td className="px-4 py-4 align-middle">
															<div className="flex items-center gap-4">
																<div className="relative">
																	<div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden border border-[#2c2c2c] bg-[#0b0b0b]">
																		<span className="text-lg">🍋</span>
																	</div>
																	{position && (
																		<div className="absolute -right-1 -bottom-1 text-xs bg-[#a3e635] text-black px-1.5 py-0.5 rounded-full border border-[#84cc16]">
																			LP
																		</div>
																	)}
																</div>
																<div className="min-w-0">
																	<div className="text-[#E9F0EF] font-semibold text-sm leading-5 truncate">
																		{marketName} Pool
																	</div>
																	<div className="text-[#9AA0A0] text-xs truncate">
																		{market.onChainData.longPositionCount +
																			market.onChainData.shortPositionCount}{" "}
																		positions
																	</div>
																</div>
															</div>
														</td>
														<td className="px-4 py-4 text-right">
															<div className="inline-block bg-[#1a2e14] text-[#a3e635] px-2 py-1 rounded text-xs font-semibold">
																{market.apr}%
															</div>
														</td>
														<td className="px-4 py-4 text-right text-[#a3e635] font-semibold text-sm">
															{totalLiquidity}
														</td>
														<td className="px-4 py-4 text-right text-[#E9F0EF] text-sm">
															{totalExposure}
														</td>
														<td className="px-4 py-4 text-right text-green-500 text-sm">
															{longValue}
															<div className="text-xs text-[#9AA0A0]">
																{market.onChainData.longPositionCount} pos
															</div>
														</td>
														<td className="px-4 py-4 text-right text-red-500 text-sm">
															{shortValue}
															<div className="text-xs text-[#9AA0A0]">
																{market.onChainData.shortPositionCount} pos
															</div>
														</td>
														<td className="px-4 py-4 text-right text-[#E9F0EF] font-semibold text-sm">
															{position ? positionValue : "-"}
														</td>
														<td className="px-4 py-4 text-right">
															<div className="flex justify-end gap-2">
																{position ? (
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
														</td>
													</tr>
												);
											})
										) : (
											<tr>
												<td colSpan={8} className="p-12 text-center">
													<div className="flex flex-col items-center gap-2">
														{isLoadingPositions ? (
															<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
														) : (
															<>
																<div className="text-muted-foreground">
																	{filterType === "my-positions"
																		? "You don't have any liquidity positions yet"
																		: searchQuery
																			? `No pools found for "${searchQuery}"`
																			: "No pools available"}
																</div>
																<div className="text-sm text-muted-foreground">
																	{filterType === "my-positions"
																		? "Add liquidity to a pool to start earning trading fees"
																		: "Try adjusting your search or check back later"}
																</div>
																{filterType === "my-positions" && (
																	<Button asChild className="mt-4">
																		<Link to="/liquidity/add">
																			<Plus className="mr-2 h-4 w-4" />
																			Add Liquidity
																		</Link>
																	</Button>
																)}
															</>
														)}
													</div>
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>
					</div>
					<div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 bg-linear-to-r from-[#1a2e14]/10 to-transparent" />
				</div>
			</div>

			{/* Footer Stats */}
			<div className="border-t border-[#222222] bg-[#060606] p-3 flex items-center justify-between text-sm text-[#9AA0A0] mb-16 lg:mb-10">
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
			</div>
		</>
	);
}
