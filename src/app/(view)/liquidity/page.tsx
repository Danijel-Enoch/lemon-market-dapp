import { Loader2, Plus, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AuthGate } from "@/components/ui/AuthGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMarkets, type Market } from "@/lib/liquidity-api";
import { formatUnits } from "viem";

export const metadata = {
	title: "Liquidity - Lemon Markets",
	description: "Provide liquidity and earn rewards",
};

function LiquidityPoolsList() {
	const [markets, setMarkets] = useState<Market[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchMarkets = async () => {
			try {
				const response = await getMarkets();
				if (response.success) {
					setMarkets(response.data);
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
				console.log({market}),
				<div
					key={market.marketId}
					className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
				>
					<div>
						<p className="font-medium">{market.onChainData.marketId.split("_")[0] || "Unknown"} Pool</p>
						<p className="text-sm text-muted-foreground">APR: 13%</p>
					</div>
					<div className="text-right">
						<p className="font-medium text-green-500">
							{market.onChainData.realLiquidity ? `$${formatUnits(BigInt(market.onChainData.virtualLiquidity), 6).toLocaleString()}` : "$0"} Liquidity
						</p>
						<p className="text-sm text-muted-foreground">
							Vol: {market.volume24h ? `$${market.volume24h.toLocaleString()}` : "-"}
						</p>
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
					<Button asChild>
						<Link to="/liquidity/add">
							<Plus className="mr-2 h-4 w-4" />
							Add Liquidity
						</Link>
					</Button>
				</div>

				<div className="grid grid-cols-1 gap-6 mb-8">
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
