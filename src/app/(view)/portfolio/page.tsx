import { DollarSign, TrendingUp, Wallet } from "lucide-react";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { PositionsTable } from "@/components/trading/PositionsTable";
import { AuthGate } from "@/components/ui/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserPositions } from "@/hooks/useUserPositions";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Portfolio - Lemon Markets",
	description: "View your portfolio information",
};

function PortfolioContent() {
	const { address } = useAccount();
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

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
							<DollarSign className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{ethBalanceValue.toFixed(4)} ETH</div>
							<p className="text-xs text-muted-foreground">Available in wallet</p>
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
							<TrendingUp
								className={`h-4 w-4 ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}
							/>
						</CardHeader>
						<CardContent>
							<div
								className={`text-2xl font-bold ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}
							>
								{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
							</div>
							<p className="text-xs text-muted-foreground">Unrealized P&L</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Account Value</CardTitle>
							<Wallet className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">${totalPortfolioValue.toFixed(2)}</div>
							<p className="text-xs text-muted-foreground">Margin + P&L</p>
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
			</main>
		</div>
	);
}

export default function PortfolioPage() {
	return (
		<AuthGate
			icon={Wallet}
			title="Connect Wallet to View Portfolio"
			description="Connect your wallet to view your portfolio, positions, and performance."
		>
			<PortfolioContent />
		</AuthGate>
	);
}
