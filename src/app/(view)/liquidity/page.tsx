import { Wallet, Plus, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";

import { AuthGate } from "@/components/ui/AuthGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
	getLiquidityPools,
	getUserLiquidityPositions,
	type LiquidityPool,
	type LiquidityPosition,
} from "@/lib/liquidity-api";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Liquidity - Lemon Markets",
	description: "Provide liquidity and earn rewards",
};

function LiquidityPoolsList() {
	const [pools, setPools] = useState<LiquidityPool[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchPools = async () => {
			try {
				const response = await getLiquidityPools();
				if (response.success) {
					setPools(response.pools);
				} else {
					setError(response.error || "Failed to fetch pools");
				}
			} catch (e) {
				console.error(e);
				setError("An error occurred while fetching pools");
			} finally {
				setIsLoading(false);
			}
		};
		fetchPools();
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

	if (pools.length === 0) {
		return <p className="text-sm text-muted-foreground text-center">No pools available</p>;
	}

	return (
		<>
			{pools.map((pool) => (
				<div key={pool.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
					<div>
						<p className="font-medium">{pool.pair || pool.name || "Unknown Pool"}</p>
						<p className="text-sm text-muted-foreground">TVL: {pool.tvl}</p>
					</div>
					<div className="text-right">
						<p className="font-medium text-green-500">{pool.apr} APR</p>
						<p className="text-sm text-muted-foreground">Vol: {pool.volume24h || "-"}</p>
					</div>
				</div>
			))}
		</>
	);
}

function UserLiquidityPositions() {
	const { address } = useAccount();
	const [positions, setPositions] = useState<LiquidityPosition[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!address) {
			setIsLoading(false);
			return;
		}

		const fetchPositions = async () => {
			try {
				const response = await getUserLiquidityPositions(address);
				if (response.success) {
					setPositions(response.positions);
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

	if (!address) {
		return (
			<EmptyState
				icon={Wallet}
				title="No positions yet"
				description="Your active liquidity positions will be displayed here."
			/>
		);
	}

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

	if (positions.length === 0) {
		return (
			<EmptyState
				icon={Wallet}
				title="No positions yet"
				description="Your active liquidity positions will be displayed here."
			/>
		);
	}

	return (
		<div className="space-y-4">
			{positions.map((pos) => (
				<div key={pos.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
					<div>
						<p className="font-medium">{pos.pair}</p>
						<p className="text-sm text-muted-foreground">Amount: {pos.amount} USDC</p>
					</div>
					<div className="text-right">
						<p className="font-medium">{pos.value}</p>
						{pos.unrealizedPnl && (
							<p
								className={`text-sm ${pos.unrealizedPnl.startsWith("-") ? "text-red-500" : "text-green-500"}`}
							>
								{pos.unrealizedPnl}
							</p>
						)}
					</div>
				</div>
			))}
		</div>
	);
}

function LiquidityContent() {
	const { address } = useAccount();
	const [totalLiquidity, setTotalLiquidity] = useState("$0");
	const [feesEarned, setFeesEarned] = useState("$0.00");

	// Fetch totals (optional integration point, for now we can sum up positions if available or fetch specific stats endpoint)
	useEffect(() => {
		if (address) {
			getUserLiquidityPositions(address).then((res) => {
				if (res.success) {
					setTotalLiquidity(res.totalValue || "$0");
					setFeesEarned(res.totalFeesEarned || "$0.00");
				}
			});
		}
	}, [address]);

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="flex items-center justify-between mb-8">
					<div>
						<h1 className="text-2xl font-medium text-muted-foreground">Liquidity</h1>
						<p className="text-muted-foreground text-xs">
							Provide liquidity to pools and earn trading fees
						</p>
					</div>
					<Button asChild>
						<Link to="/liquidity/add">
							<Plus className="mr-2 h-4 w-4" />
							Add Liquidity
						</Link>
					</Button>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Total Liquidity</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{totalLiquidity}</div>
							<p className="text-sm text-muted-foreground">Your total liquidity</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>24h Fees Earned</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-green-500">{feesEarned}</div>
							<p className="text-sm text-muted-foreground">Last 24 hours</p>
						</CardContent>
					</Card>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Your Liquidity Positions</CardTitle>
						</CardHeader>
						<CardContent>
							<UserLiquidityPositions />
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
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
