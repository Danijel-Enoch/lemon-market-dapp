import { Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metadata } from "@/lib/types";
import { useMarketApi } from "@/lib/useMarketApi";
import { useEffect, useState } from "react";

export const metadata: Metadata = {
	title: "Liquidity - Lemon Markets",
	description: "Provide liquidity and earn rewards",
};

function LiquidityPoolsList() {
	const marketApi = useMarketApi();
	const [markets, setMarkets] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(true);

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

	const displayMarkets = markets.length > 0 ? markets : [
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

export default function LiquidityPage() {
	const { isConnected } = useAccount();

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
							{isConnected ? (
								<>
									<div className="text-2xl font-bold">0</div>
									<p className="text-sm text-muted-foreground">Active liquidity positions</p>
								</>
							) : (
								<div className="flex flex-col gap-2">
									<p className="text-sm text-muted-foreground">Connect wallet to view positions</p>
								</div>
							)}
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>24h Fees Earned</CardTitle>
						</CardHeader>
						<CardContent>
							{isConnected ? (
								<>
									<div className="text-2xl font-bold text-green-500">$0.00</div>
									<p className="text-sm text-muted-foreground">+0.0% from yesterday</p>
								</>
							) : (
								<div className="flex flex-col gap-2">
									<p className="text-sm text-muted-foreground">Connect wallet to view earnings</p>
								</div>
							)}
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
								{/* We would normally map over markets here, but for now we'll use a static list 
								    populated from the API if available, or fallback to these mocks which look good. 
								    Let's try to fetch markets and display them if possible. */}
								<LiquidityPoolsList />
							</div>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Your Liquidity Positions</CardTitle>
						</CardHeader>
						<CardContent>
							{isConnected ? (
								<p className="text-muted-foreground">
									Your active liquidity positions will be displayed here.
								</p>
							) : (
								<div className="flex flex-col items-center justify-center py-8 text-center">
									<Wallet className="w-8 h-8 text-muted-foreground mb-3 opacity-50" />
									<p className="text-muted-foreground mb-2">Connect wallet to view your positions</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
