import { Loader2, Minus, Plus, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { AuthGate } from "@app/components/ui/AuthGate";
import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card";
import {
	getMarkets,
	getLiquidityPositions,
	type Market,
	type LiquidityPosition,
} from "@app/lib/liquidity-api";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";

export const metadata = {
	title: "Liquidity - Lemon Markets",
	description: "Provide liquidity and earn rewards",
};

function LiquidityPoolsList() {
	const [markets, setMarkets] = useState<(Market & { apr: number })[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchMarkets = async () => {
			try {
				const response = await getMarkets();
				if (response.success) {
					// Add random APR for now as requested
					const marketsWithApr = response.data.map((m) => ({
						...m,
						apr: Math.floor(Math.random() * 20) + 5, // 5-24%
					}));
					setMarkets(marketsWithApr);
				} else {
					setError(response.error || "Failed to fetch markets");
				}
			} catch (e) {
				console.error(e);
				setError("An error occurred while fetching markets");
			} finally {
				setIsLoading(false);
			}
		};
		fetchMarkets();
	}, []);

	if (isLoading) {
		return (
			<div className="flex justify-center p-4">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return <p className="text-sm text-red-500 text-center">{error}</p>;
	}

	if (markets.length === 0) {
		return <p className="text-sm text-muted-foreground text-center">No pools available</p>;
	}

	return (
		<>
			{markets.map((market) => (
				<div
					key={market.marketId}
					className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
				>
					<div>
						<p className="font-medium">
							{market.onChainData.marketId.split("-")[0] || "Unknown"} Pool
						</p>
						<div className="flex flex-col gap-1 mt-1">
							<p className="text-sm text-muted-foreground">APR: {market.apr}%</p>
							<p className="text-sm text-muted-foreground">
								Total Exposure: $
								{parseFloat(
									formatUnits(BigInt(market.exposure?.totalExposure || 0), 6),
								).toLocaleString()}
							</p>
							<div className="flex gap-3 text-xs">
								<span className="text-green-500 font-medium">
									Longs: {market.onChainData.longPositionCount} ($
									{parseFloat(
										formatUnits(BigInt(market.exposure?.totalLong || 0), 6),
									).toLocaleString()}
									)
								</span>
								<span className="text-red-500 font-medium">
									Shorts: {market.onChainData.shortPositionCount} ($
									{parseFloat(
										formatUnits(BigInt(market.exposure?.totalShort || 0), 6),
									).toLocaleString()}
									)
								</span>
							</div>
						</div>
					</div>
					<div className="text-right">
						<p className="font-medium text-green-500">
							{market.onChainData.realLiquidity
								? `$${formatUnits(BigInt(market.onChainData.virtualLiquidity), 6).toLocaleString()}`
								: "$0"}{" "}
							Liquidity
						</p>
						{/* <p className="text-sm text-muted-foreground">
							Vol:{" "}
							{market.volume24h
								? `$${market.volume24h.toLocaleString()}`
								: "-"}
						</p> */}
					</div>
				</div>
			))}
		</>
	);
}

function LiquidityContent() {
	return (
		<div className="min-h-screen w-full mt-8">
			<div className="w-full">
				<div className="flex items-center justify-between mb-8">
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

				<div className="grid grid-cols-1 gap-6 mb-8">
					<MyPositionsList />
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Liquidity Pools</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<LiquidityPoolsList />
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

function MyPositionsList() {
	const { address } = useAccount();
	const [positions, setPositions] = useState<LiquidityPosition[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchPositions = async () => {
			if (!address) return;
			try {
				const response = await getLiquidityPositions(address);
				if (response.success) {
					setPositions(response.data);
				} else {
					setError(response.error || "Failed to fetch positions");
				}
			} catch (e) {
				console.error(e);
				setError("An error occurred while fetching positions");
			} finally {
				setIsLoading(false);
			}
		};
		fetchPositions();
	}, [address]);

	if (isLoading) {
		return (
			<div className="flex justify-center p-4">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return null; // Don't show anything on error for now? Or show error
	}

	if (positions.length === 0) {
		return null; // Don't show the section if no positions
	}

	return (
		<Card className="border-accent/20 mb-8">
			<CardHeader>
				<CardTitle>My Positions</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{positions.map((position) => (
						<div
							key={position.marketId}
							className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
						>
							<div>
								<p className="font-medium">
									{position.onChainData.marketId.split("-")[0] || "Unknown"} Pool
								</p>
								<div className="flex flex-col gap-1 mt-1">
									<p className="text-sm text-muted-foreground">
										Provided: $
										{parseFloat(formatUnits(BigInt(position.amountProvided), 6)).toLocaleString()}
									</p>
									<p className="text-sm text-muted-foreground">
										Entry Time:{" "}
										{new Date(Number(position.entryTimestamp) * 1000).toLocaleDateString()}
									</p>
								</div>
							</div>
							<div className="text-right">
								<p className="font-medium text-green-500">
									{position.lpTokensReceived &&
									position.onChainData.virtualLiquidity &&
									Number(position.onChainData.totalShares) > 0
										? `$${(
												(Number(position.lpTokenDetails?.balance || position.lpTokensReceived) /
													Number(position.onChainData.totalShares)) *
													Number(position.onChainData.virtualLiquidity) *
													1e-6
											).toLocaleString(undefined, {
												minimumFractionDigits: 2,
												maximumFractionDigits: 2,
											})}`
										: "$0.00"}{" "}
									Value
								</p>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export default function LiquidityPage() {
	return (
		<AuthGate
			icon={Wallet}
			title="Connect Wallet to View Liquidity"
			description="Connect your wallet to provide liquidity and earn trading fees."
		>
			<LiquidityContent />
		</AuthGate>
	);
}
