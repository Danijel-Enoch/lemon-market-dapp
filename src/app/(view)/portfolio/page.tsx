import { DollarSign, TrendingUp, Wallet } from "lucide-react";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PositionsTable } from "@/components/trading/PositionsTable";
import { useUserPositions } from "@/hooks/useUserPositions";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Portfolio - Lemon Markets",
	description: "View your portfolio information",
};

export default function PortfolioPage() {
	const { address, isConnected } = useAccount();
	const { data: ethBalance } = useBalance({
		address: address,
		query: { enabled: !!address },
	});

	const {
		positions,
		isLoading: isLoadingPositions,
		error: positionsError,
		refetch: fetchUserPositions,
		openPositions,
		totalPnl,
		totalMargin,
	} = useUserPositions();

	const ethBalanceValue = ethBalance
		? parseFloat(formatUnits(ethBalance.value, ethBalance.decimals))
		: 0;
	
	// Note: We don't have a reliable ETH price here without fetching it, 
	// but for now we can display the ETH amount or assume a static price for estimation if needed.
	// For this implementation, we'll focus on the margin + PnL as the "Portfolio Value" 
	// derived from the platform usage.
	
	const totalPortfolioValue = totalMargin + totalPnl;

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8">
					<div>
						<h1 className="text-2xl font-medium text-muted-foreground">Portfolio</h1>
						<p className="text-muted-foreground text-xs">
							Overview of your investments and positions
						</p>
					</div>
				</div>

				{isConnected ? (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
							<Card className="border-accent/20">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
									<DollarSign className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{ethBalanceValue.toFixed(4)} ETH
									</div>
									<p className="text-xs text-muted-foreground">
										Available in wallet
									</p>
								</CardContent>
							</Card>

							<Card className="border-accent/20">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium">Active Positions</CardTitle>
									<TrendingUp className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">{openPositions.length}</div>
									<p className="text-xs text-muted-foreground">
										<span className="text-green-500">{positions.length}</span> total trades
									</p>
								</CardContent>
							</Card>

							<Card className="border-accent/20">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium">Total P&L</CardTitle>
									<TrendingUp className={`h-4 w-4 ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`} />
								</CardHeader>
								<CardContent>
									<div className={`text-2xl font-bold ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
										{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
									</div>
									<p className="text-xs text-muted-foreground">
										Unrealized P&L
									</p>
								</CardContent>
							</Card>

							<Card className="border-accent/20">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
									<CardTitle className="text-sm font-medium">Account Value</CardTitle>
									<Wallet className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">${totalPortfolioValue.toFixed(2)}</div>
									<p className="text-xs text-muted-foreground">
										Margin + P&L
									</p>
								</CardContent>
							</Card>
						</div>

						<div className="grid grid-cols-1 gap-6">
							<Card className="border-accent/20">
								<CardHeader>
									<CardTitle>Your Positions</CardTitle>
								</CardHeader>
								<CardContent>
									<PositionsTable
										positions={positions}
										isLoading={isLoadingPositions}
										error={positionsError}
										onRefetch={fetchUserPositions}
									/>
								</CardContent>
							</Card>
						</div>
					</>
				) : (
					<div className="flex flex-col items-center justify-center py-20 text-center">
						<Wallet className="h-16 w-16 text-muted-foreground mb-4" />
						<h2 className="text-xl font-medium mb-2">Connect your wallet</h2>
						<p className="text-muted-foreground max-w-md">
							Connect your wallet to view your portfolio, positions, and performance.
						</p>
					</div>
				)}
			</main>
		</div>
	);
}
