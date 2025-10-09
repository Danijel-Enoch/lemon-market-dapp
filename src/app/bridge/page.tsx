"use client";

import { LiFiWidget, type WidgetConfig, useWidgetEvents, WidgetEvent } from "@lifi/widget";
import { ArrowLeftRight, Clock, Info, Repeat, Shield, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatPriceChange, getTokenPriceByPair } from "@/lib/oracle";

export default function BridgeSwapPage() {
	const [selectedToken, setSelectedToken] = useState<{
		symbol: string;
		address: string;
		chainId: number;
		pairAddress?: string;
	} | null>(null);
	const [isLoadingPrice, setIsLoadingPrice] = useState(false);
	const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
	const [tokenPrice, setTokenPrice] = useState<{
		price: string;
		change: string;
	} | null>(null);
	const widgetEvents = useWidgetEvents();

	const fetchLatestPrice = async (pairAddress: string) => {
		if (!pairAddress) return;

		setIsLoadingPrice(true);
		try {
			const tokenPriceData = await getTokenPriceByPair(pairAddress, "bsc");
			if (tokenPriceData) {
				setTokenPrice({
					price: formatPrice(tokenPriceData.priceUsd),
					change: tokenPriceData.priceChange24h
						? formatPriceChange(tokenPriceData.priceChange24h)
						: "+0.00%",
				});
				setLastPriceUpdate(new Date());
			}
		} catch (error) {
			console.error("Error fetching latest price:", error);
		} finally {
			setIsLoadingPrice(false);
		}
	};

	useEffect(() => {
		const handleTokenSelected = (data: any) => {
			console.log("Token selected event:", data);

			// Normalize the token address to lowercase for consistent matching
			const tokenAddress = data.tokenAddress?.toLowerCase() || data.address?.toLowerCase();
			const symbol = data.symbol?.toUpperCase();

			console.log("Normalized address:", tokenAddress);
			console.log("Token symbol:", symbol);

			// Map by symbol (more reliable than address across chains)
			// Using BSC pair addresses for DexScreener
			const symbolToPairMap: Record<string, { pairAddress: string }> = {
				BNB: {
					pairAddress: "0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE", // BNB/BUSD on BSC
				},
				WBNB: {
					pairAddress: "0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE", // WBNB/BUSD on BSC
				},
				ETH: {
					pairAddress: "0x74E4716E431f45807DCF19f284c7aA99F18a4fbc", // ETH/BUSD on BSC
				},
				BTCB: {
					pairAddress: "0xF45cd219aEF8618A92BAa7aD848364a158a24F33", // BTCB/BUSD on BSC
				},
				BTC: {
					pairAddress: "0xF45cd219aEF8618A92BAa7aD848364a158a24F33",
				},
				WBTC: {
					pairAddress: "0xF45cd219aEF8618A92BAa7aD848364a158a24F33",
				},
				USDT: {
					pairAddress: "0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE", // Show BNB chart for stablecoins
				},
				USDC: {
					pairAddress: "0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE",
				},
			};

			const pairInfo = symbol ? symbolToPairMap[symbol] : undefined;

			console.log("Pair info found:", pairInfo);

			setSelectedToken({
				symbol: symbol || "TOKEN",
				address: tokenAddress || data.tokenAddress || "",
				chainId: data.chainId || 1,
				pairAddress: pairInfo?.pairAddress,
			});

			// Fetch price if pair address exists
			if (pairInfo?.pairAddress) {
				console.log("Fetching price for pair:", pairInfo.pairAddress);
				fetchLatestPrice(pairInfo.pairAddress);
			}
		};

		// Listen to multiple events to catch token selection
		widgetEvents.on(WidgetEvent.SourceChainTokenSelected, handleTokenSelected);
		widgetEvents.on(WidgetEvent.DestinationChainTokenSelected, handleTokenSelected);

		return () => {
			widgetEvents.off(WidgetEvent.SourceChainTokenSelected, handleTokenSelected);
			widgetEvents.off(WidgetEvent.DestinationChainTokenSelected, handleTokenSelected);
		};
	}, [widgetEvents]);

	// Auto-refresh price every 30 seconds
	useEffect(() => {
		if (!selectedToken?.pairAddress) return;

		const interval = setInterval(() => {
			fetchLatestPrice(selectedToken.pairAddress!);
		}, 30000); // 30 seconds

		return () => clearInterval(interval);
	}, [selectedToken?.pairAddress]);

	const widgetConfig: WidgetConfig = {
		integrator: "omni-bot",
		fee: 0.02,
		theme: {
			container: {
				boxShadow: "0 0 0 1px #333333",
				borderRadius: "12px",
			},
			palette: {
				primary: {
					main: "#a3e635",
				},
				secondary: {
					main: "#2d3748",
				},
				background: {
					default: "#0a0a0a",
					paper: "#1a1a1a",
				},
				grey: {
					300: "#333333",
					800: "#1a1a1a",
				},
				text: {
					primary: "#e8eaed",
					secondary: "#94a3b8",
				},
			},
			shape: {
				borderRadius: 8,
				borderRadiusSecondary: 12,
			},
			typography: {
				fontFamily: "var(--font-inter), Inter, sans-serif",
			},
		},
		appearance: "dark",
	};

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-[1600px]">
				<div className="mb-8">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-primary/10 rounded-lg">
							<Repeat className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-foreground">Bridge & Swap</h1>
							<p className="text-muted-foreground text-sm">
								Bridge tokens across chains and swap assets
							</p>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="space-y-6 lg:col-span-2">
						{selectedToken?.pairAddress ? (
							<Card className="bg-card border-gray-100/10">
								<CardHeader>
									<CardTitle className="text-foreground flex items-center justify-between">
										<span>{selectedToken.symbol} Price Chart</span>
										<div className="flex items-center space-x-4">
											<div className="flex items-center space-x-2">
												{tokenPrice && (
													<>
														<div className="text-2xl font-bold text-success">
															{isLoadingPrice ? (
																<div className="animate-pulse">Loading...</div>
															) : (
																tokenPrice.price
															)}
														</div>
														<Badge
															className={`${
																tokenPrice.change.startsWith("+")
																	? "bg-primary hover:bg-primary/90"
																	: "bg-destructive hover:bg-destructive/90"
															}`}
														>
															{tokenPrice.change}
														</Badge>
													</>
												)}
												<Button
													size="sm"
													variant="ghost"
													onClick={() => fetchLatestPrice(selectedToken.pairAddress!)}
													disabled={isLoadingPrice}
													className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
													title="Refresh price"
												>
													<svg
														className={`h-4 w-4 ${isLoadingPrice ? "animate-spin" : ""}`}
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
														/>
													</svg>
												</Button>
											</div>
										</div>
									</CardTitle>
								</CardHeader>
								<CardContent>
									{lastPriceUpdate && (
										<div className="mb-2 text-xs text-gray-500 text-right">
											Last updated: {lastPriceUpdate.toLocaleTimeString()}
										</div>
									)}
									<div id="dexscreener-embed" className="bg-[#0a0a0a] rounded-lg overflow-hidden">
										<iframe
											src={`https://dexscreener.com/bsc/${selectedToken.pairAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15&background=0a0a0a`}
											width="100%"
											height="500"
											style={{
												border: "none",
												background: "#0a0a0a",
											}}
											title={`${selectedToken.symbol} Chart`}
										></iframe>
									</div>
								</CardContent>
							</Card>
						) : (
							<Card className="bg-card border-gray-100/10">
								<CardContent className="flex items-center justify-center h-[600px]">
									<div className="text-center text-muted-foreground">
										<p className="text-lg mb-2">Select a token to view price chart</p>
										<p className="text-sm">
											Choose a token from the bridge widget to see live price data
										</p>
									</div>
								</CardContent>
							</Card>
						)}
						<Card className="bg-gradient-to-br from-green-800/60 via-green-800/40 to-green-950/60 border-white/10 backdrop-blur-sm">
							<CardContent className="px-4">
								<div className="flex items-start gap-3">
									<Info className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
									<div>
										<h4 className="text-sm font-semibold text-white mb-2">Bridge & Swap Fees</h4>
										<p className="text-xs text-white/70 mb-2">
											A 2% protocol fee is applied to bridge and swap transactions
										</p>
										<div className="text-xs text-white/60">
											Additional gas fees and bridge provider fees may apply
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
					<div className="flex flex-col gap-2">
						<LiFiWidget integrator="omni-bot" config={widgetConfig} />
					</div>
				</div>
			</main>
		</div>
	);
}
