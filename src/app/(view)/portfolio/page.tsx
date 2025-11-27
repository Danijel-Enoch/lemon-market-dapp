import { Wallet, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metadata } from "@/lib/types";

export const metadata: Metadata = {
	title: "Portfolio - Lemon Markets",
	description: "View your portfolio information",
};

export default function PortfolioPage() {
	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="mb-8">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-primary/10 rounded-lg">
							<Wallet className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h1 className="text-3xl font-bold text-foreground">Portfolio</h1>
							<p className="text-muted-foreground text-sm">
								Overview of your investments and positions
							</p>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Total Balance</CardTitle>
							<DollarSign className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">$12,345.67</div>
							<p className="text-xs text-muted-foreground">
								<span className="text-green-500 flex items-center gap-1">
									<TrendingUp className="h-3 w-3" />
									+2.5%
								</span>{" "}
								from last month
							</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Active Positions</CardTitle>
							<TrendingUp className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">8</div>
							<p className="text-xs text-muted-foreground">
								<span className="text-green-500">+1</span> new this week
							</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">24h P&L</CardTitle>
							<TrendingUp className="h-4 w-4 text-green-500" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold text-green-500">+$234.56</div>
							<p className="text-xs text-muted-foreground">+1.8%</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Total Value</CardTitle>
							<Wallet className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">$45,678.90</div>
							<p className="text-xs text-muted-foreground">
								<span className="text-red-500 flex items-center gap-1">
									<TrendingDown className="h-3 w-3" />
									-0.5%
								</span>{" "}
								from yesterday
							</p>
						</CardContent>
					</Card>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Asset Allocation</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground">
								Asset allocation chart will be displayed here.
							</p>
						</CardContent>
					</Card>

					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle>Recent Transactions</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground">
								Recent transactions list will be displayed here.
							</p>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
