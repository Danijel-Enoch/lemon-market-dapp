import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Liquidity - Lemon Markets",
	description: "Provide liquidity and earn rewards",
};

export default function LiquidityPage() {
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
							<div className="text-2xl font-bold">$1,234,567</div>
							<p className="text-sm text-muted-foreground">Across all pools</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Your Positions</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">5</div>
							<p className="text-sm text-muted-foreground">Active liquidity positions</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>24h Fees Earned</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-green-500">$123.45</div>
							<p className="text-sm text-muted-foreground">+5.2% from yesterday</p>
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
								{[
									{ pair: "BTC/USDT", tvl: "$500K", apr: "12.5%" },
									{ pair: "ETH/USDT", tvl: "$300K", apr: "8.3%" },
									{ pair: "SOL/USDT", tvl: "$150K", apr: "15.7%" },
								].map((pool) => (
									<div
										key={pool.pair}
										className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
									>
										<div>
											<p className="font-medium">{pool.pair}</p>
											<p className="text-sm text-muted-foreground">TVL: {pool.tvl}</p>
										</div>
										<div className="text-right">
											<p className="font-medium text-green-500">{pool.apr} APR</p>
											<p className="text-sm text-muted-foreground">Estimated</p>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Your Liquidity Positions</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground">
								Your active liquidity positions will be displayed here.
							</p>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
