"use client";

import { motion } from "framer-motion";
import { Activity, AlertCircle, RefreshCw, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { PositionsTable } from "@/components/trading/PositionsTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserPositions } from "@/hooks/useUserPositions";

export default function PositionsPage() {
	const { address, isConnected } = useAccount();
	const {
		positions,
		enhancedPositions,
		isLoading,
		error,
		refetch,
		refetchEnhanced,
		isEnhancedMode,
		toggleEnhancedMode,
		totalUnrealizedPnL,
		totalPortfolioValue,
		openPositions,
		totalPnl,
		totalMargin,
	} = useUserPositions();

	// Use the same approach as the perp page - just use the actual positions
	const displayPositions = isEnhancedMode && enhancedPositions ? enhancedPositions : positions;

	// Calculate statistics - use the same approach as perp page
	const totalPnL = totalPnl; // Use the calculated totalPnl from the hook

	const profitablePositions = displayPositions.filter((p) => {
		if (
			isEnhancedMode &&
			"unrealizedPnL" in p &&
			p.unrealizedPnL !== undefined &&
			p.unrealizedPnL !== null &&
			typeof p.unrealizedPnL === "number"
		) {
			return p.unrealizedPnL > 0;
		}
		const pnl = parseFloat(p.pnl || "0");
		return pnl > 0;
	}).length;

	const winRate =
		displayPositions.length > 0 ? (profitablePositions / displayPositions.length) * 100 : 0;

	// Use openPositions from the hook
	const openPositionsCount = openPositions.length;

	return (
		<div className="min-h-screen bg-black text-white p-4 md:p-8">
			<div className="max-w-screen-2xl mx-auto space-y-8">
				{/* Page Header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6 }}
					className="space-y-4"
				>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="p-2 bg-primary/10 rounded-lg">
								<Wallet className="w-6 h-6 text-primary" />
							</div>
							<div>
								<h1 className="text-3xl font-bold text-foreground">My Positions</h1>
								<div className="flex items-center gap-2">
									<p className="text-muted-foreground text-sm">
										Track your trading performance and manage your positions
									</p>
									{!isConnected && (
										<Badge variant="outline" className="border-orange-500/20 text-orange-400">
											<Wallet className="w-3 h-3 mr-1" />
											Connect Wallet
										</Badge>
									)}
								</div>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<Button
								variant="outline"
								onClick={() => (isEnhancedMode ? refetchEnhanced() : refetch())}
								disabled={isLoading}
								className="border-white/20 hover:border-green-500/40 bg-neutral-900/60"
							>
								<RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
								Refresh
							</Button>
							<Button
								variant={isEnhancedMode ? "default" : "outline"}
								onClick={toggleEnhancedMode}
								className={
									isEnhancedMode
										? "bg-gradient-to-r from-lime-300 via-green-600 to-green-950 text-gray-100 hover:opacity-90"
										: "border-white/20 hover:border-green-500/40 bg-neutral-900/60"
								}
							>
								<Activity className="w-4 h-4 mr-2" />
								{isEnhancedMode ? "Enhanced Mode" : "Standard Mode"}
							</Button>
						</div>
					</div>
				</motion.div>

				{/* Statistics Cards */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.1 }}
					className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
				>
					<Card className="bg-neutral-900/60 border-white/10 backdrop-blur-sm">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm font-medium text-white/70 uppercase tracking-wider">
								Total Positions
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
								{displayPositions.length}
							</div>
							<div className="text-sm text-white/70 mt-1">{openPositionsCount} active</div>
						</CardContent>
					</Card>

					<Card className="bg-neutral-900/60 border-white/10 backdrop-blur-sm">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm font-medium text-white/70 uppercase tracking-wider">
								Total PnL
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex items-center gap-2">
								<div
									className={`text-2xl font-bold ${
										totalPnL >= 0
											? "bg-gradient-to-r from-lime-300 to-green-500 bg-clip-text text-transparent"
											: "text-red-400"
									}`}
								>
									${totalPnL.toFixed(2)}
								</div>
								{totalPnL >= 0 ? (
									<TrendingUp className="w-5 h-5 text-green-400" />
								) : (
									<TrendingDown className="w-5 h-5 text-red-400" />
								)}
							</div>
							{isEnhancedMode && (
								<div className="text-sm text-white/70 mt-1">
									Unrealized: ${totalUnrealizedPnL?.toFixed(2) || "0.00"}
								</div>
							)}
						</CardContent>
					</Card>

					<Card className="bg-neutral-900/60 border-white/10 backdrop-blur-sm">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm font-medium text-white/70 uppercase tracking-wider">
								Win Rate
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
								{winRate.toFixed(1)}%
							</div>
							<div className="text-sm text-white/70 mt-1">
								{profitablePositions}/{displayPositions.length} profitable
							</div>
						</CardContent>
					</Card>

					<Card className="bg-neutral-900/60 border-white/10 backdrop-blur-sm">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm font-medium text-white/70 uppercase tracking-wider">
								Portfolio Value
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
								${totalPortfolioValue?.toFixed(2) || "0.00"}
							</div>
							<div className="text-sm text-white/70 mt-1">Real-time value</div>
						</CardContent>
					</Card>
				</motion.div>

				{/* Enhanced Mode Info */}
				{isEnhancedMode && (
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, delay: 0.2 }}
					>
						<Card className="bg-gradient-to-br from-green-800/60 via-green-800/40 to-green-950/60 border-white/10 backdrop-blur-sm">
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<Badge
										variant="secondary"
										className="bg-gradient-to-r from-lime-300 via-green-600 to-green-950 text-gray-100 border-0"
									>
										Enhanced Mode Active
									</Badge>
									<p className="text-sm text-white/70">
										Real-time PnL calculations powered by Lemon Oracle with micro-precision pricing
									</p>
								</div>
							</CardContent>
						</Card>
					</motion.div>
				)}

				{/* Error State */}
				{error && (
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, delay: 0.2 }}
					>
						<Card className="bg-red-900/20 border-red-500/20">
							<CardContent className="p-4">
								<div className="text-red-400 text-sm">Error loading positions: {error}</div>
							</CardContent>
						</Card>
					</motion.div>
				)}

				{/* Positions Table */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.3 }}
				>
					<div className="mb-4">
						<h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
							Position Details
							{positions.length > 0 && ` (${positions.length})`}
						</h2>
						{positions.length > 0 && (
							<div className="flex gap-4 text-sm">
								<span className="text-white/70">
									Open: <span className="text-white">{openPositions.length}</span>
								</span>
								<span className="text-white/70">
									Total Margin: <span className="text-white">${totalMargin.toFixed(2)}</span>
								</span>
								<span className="text-white/70">
									Total PnL:{" "}
									<span className={totalPnl >= 0 ? "text-green-400" : "text-red-400"}>
										{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
									</span>
								</span>
							</div>
						)}
					</div>

					<PositionsTable
						positions={positions}
						isLoading={isLoading}
						error={error}
						onRefetch={refetch}
						tradingPairAddress={undefined}
					/>
				</motion.div>
			</div>
		</div>
	);
}
