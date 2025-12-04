import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/ui/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Metadata } from "@/lib/types";
import { useMarketApi } from "@/lib/useMarketApi";

export const metadata: Metadata = {
	title: "Liquidity - Lemon Markets",
	description: "Provide liquidity and earn rewards",
};

function LiquidityPoolsList() {
	const marketApi = useMarketApi();
	const [markets, setMarkets] = useState<any[]>([]);
	const [_isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const fetchMarkets = async () => {
			try {
				const response = await marketApi.markets.list();
				if (response && Array.isArray(response)) {
					setMarkets(response.slice(0, 5)); // Show top 5
				} else {
					// Fallback
					setMarkets([]);
				}
			} catch (e) {
				console.error(e);
			} finally {
				setIsLoading(false);
			}
		};
		fetchMarkets();
	}, [marketApi]);

	const displayMarkets =
		markets.length > 0
			? markets
			: [
					{ pair: "BTC/USDT", tvl: "$500K", apr: "12.5%" },
					{ pair: "ETH/USDT", tvl: "$300K", apr: "8.3%" },
					{ pair: "SOL/USDT", tvl: "$150K", apr: "15.7%" },
				];

	return (
		<>
			{displayMarkets.map((pool: any) => (
				<div
					key={pool.pair || pool.id}
					className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
				>
					<div>
						<p className="font-medium">{pool.pair || pool.name || "Unknown Pool"}</p>
						<p className="text-sm text-muted-foreground">TVL: {pool.tvl || "$0"}</p>
					</div>
					<div className="text-right">
						<p className="font-medium text-green-500">{pool.apr || "0%"} APR</p>
						<p className="text-sm text-muted-foreground">Estimated</p>
					</div>
				</div>
			))}
		</>
	);
}

function LiquidityContent() {
	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8">
					<div>
						<h1 className="text-2xl font-medium text-muted-foreground">Liquidity</h1>
						<p className="text-muted-foreground text-xs">
							Provide liquidity to pools and earn trading fees
						</p>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Total Liquidity</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">$0</div>
							<p className="text-sm text-muted-foreground">Across all pools</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Your Positions</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">0</div>
							<p className="text-sm text-muted-foreground">Active liquidity positions</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>24h Fees Earned</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-green-500">$0.00</div>
							<p className="text-sm text-muted-foreground">+0.0% from yesterday</p>
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
							<EmptyState
								icon={Wallet}
								title="No positions yet"
								description="Your active liquidity positions will be displayed here."
							/>
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
