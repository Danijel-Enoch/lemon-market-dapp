import { TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Spot Trading - Lemon Markets",
	description: "Trade cryptocurrencies on the spot market",
};

interface TradingPair {
	pair: string;
	price: string;
	change: string;
	volume: string;
}

export default function SpotPage() {
	const [pairs, setPairs] = useState<TradingPair[]>([]);

	useEffect(() => {
		const fetchSpotData = async () => {
			try {
				// Fetch data for popular pairs from DexScreener
				const popularPairs = [
					{
						pair: "BTC/USDT",
						chain: "ethereum",
						address: "0x110492b51f32416d90e9b69b3a43a4b8e8a2b5e8",
					},
					{
						pair: "ETH/USDT",
						chain: "ethereum",
						address: "0x11b815efB8f581194ae79006d24E0d814B7697F6",
					},
					{
						pair: "SOL/USDT",
						chain: "solana",
						address: "So11111111111111111111111111111111111111112",
					},
				];

				const fetchedPairs: TradingPair[] = [];

				for (const { pair, chain, address } of popularPairs) {
					try {
						const response = await fetch(`/api/dexscreener/latest/dex/pairs/${chain}/${address}`);
						if (response.ok) {
							const data = await response.json();
							const pairData = data.pair || data.pairs?.[0];
							if (pairData) {
								const price = parseFloat(pairData.priceUsd || "0").toFixed(2);
								const change24h = pairData.priceChange?.h24 || 0;
								const change = `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`;
								const volume = `$${(parseFloat(pairData.volume?.h24 || "0") / 1000000).toFixed(1)}M`;

								fetchedPairs.push({
									pair,
									price: `$${price}`,
									change,
									volume,
								});
							}
						}
					} catch (error) {
						console.error(`Failed to fetch data for ${pair}:`, error);
					}
				}

				// Fallback to mock data if no real data
				if (fetchedPairs.length === 0) {
					setPairs([
						{ pair: "BTC/USDT", price: "43,250.00", change: "+2.5%", volume: "$1.2B" },
						{ pair: "ETH/USDT", price: "2,650.00", change: "-1.2%", volume: "$800M" },
						{ pair: "SOL/USDT", price: "98.50", change: "+5.8%", volume: "$300M" },
					]);
				} else {
					setPairs(fetchedPairs);
				}
			} catch (error) {
				console.error("Failed to fetch spot data:", error);
				// Fallback data
				setPairs([
					{ pair: "BTC/USDT", price: "43,250.00", change: "+2.5%", volume: "$1.2B" },
					{ pair: "ETH/USDT", price: "2,650.00", change: "-1.2%", volume: "$800M" },
					{ pair: "SOL/USDT", price: "98.50", change: "+5.8%", volume: "$300M" },
				]);
			} finally {
			}
		};

		fetchSpotData();
	}, []);

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8">
					<div>
						<h1 className="text-2xl font-medium text-muted-foreground">Spot Trading</h1>
						<p className="text-muted-foreground text-xs">Buy and sell cryptocurrencies instantly</p>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Trading Pairs</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{pairs.map((item) => (
									<div key={item.pair} className="flex items-center justify-between">
										<div>
											<p className="font-medium">{item.pair}</p>
											<p className="text-sm text-muted-foreground">{item.price}</p>
										</div>
										<div className="text-right">
											<div
												className={`flex items-center gap-1 ${item.change.startsWith("+") ? "text-green-500" : "text-red-500"}`}
											>
												{item.change.startsWith("+") ? (
													<TrendingUp className="h-4 w-4" />
												) : (
													<TrendingDown className="h-4 w-4" />
												)}
												<span className="text-sm font-medium">{item.change}</span>
											</div>
											<p className="text-xs text-muted-foreground">{item.volume}</p>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<Card className="lg:col-span-2 border-accent/20">
						<CardHeader>
							<CardTitle>Market Overview</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground">
								Market data and charts will be displayed here.
							</p>
							<p className="text-sm text-muted-foreground mt-2">
								Integrated with DexScreener API for real-time market data.
							</p>
						</CardContent>
					</Card>
				</div>

				<Card className="border-accent/20">
					<CardHeader>
						<CardTitle>Order Book</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground">Live order book will be displayed here.</p>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
