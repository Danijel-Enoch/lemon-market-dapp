/**
 * Enhanced Positions Table Component
 *
 * This component demonstrates how to use the enhanced positions feature with
 * real-time PnL calculations powered by the lemon oracle client.
 */

import React from "react";
import { useUserPositions } from "@/hooks/useUserPositions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EnhancedPositionsTableProps {
	className?: string;
}

export function EnhancedPositionsTable({
	className
}: EnhancedPositionsTableProps) {
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
		openPositions
	} = useUserPositions();

	const displayPositions =
		isEnhancedMode && enhancedPositions ? enhancedPositions : positions;
	const openDisplayPositions = displayPositions.filter(
		(p) => p.status === "OPEN"
	);

	const formatPrice = (price: string | undefined) => {
		if (!price) return "N/A";
		return price.startsWith("$")
			? price
			: `$${parseFloat(price).toFixed(6)}`;
	};

	const formatPnL = (pnl: number | undefined) => {
		if (pnl === undefined) return "N/A";
		const formatted = Math.abs(pnl).toFixed(2);
		return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`;
	};

	const formatPercentage = (percentage: number | undefined) => {
		if (percentage === undefined) return "N/A";
		const formatted = Math.abs(percentage).toFixed(2);
		return percentage >= 0 ? `+${formatted}%` : `-${formatted}%`;
	};

	const getPnLColor = (pnl: number | undefined) => {
		if (pnl === undefined) return "text-gray-500";
		return pnl >= 0 ? "text-green-600" : "text-red-600";
	};

	const getConfidenceBadgeVariant = (confidence?: string) => {
		switch (confidence) {
			case "high":
				return "default";
			case "medium":
				return "secondary";
			case "low":
				return "outline";
			default:
				return "outline";
		}
	};

	if (isLoading) {
		return (
			<Card className={className}>
				<CardContent className="pt-6">
					<div className="flex items-center justify-center py-8">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
						<span className="ml-2">Loading positions...</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card className={className}>
				<CardContent className="pt-6">
					<div className="text-center py-8">
						<p className="text-red-600 mb-4">{error}</p>
						<Button
							onClick={isEnhancedMode ? refetchEnhanced : refetch}
							variant="outline"
						>
							Retry
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className={className}>
			{/* Header with toggle */}
			<Card className="mb-4">
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>Positions</CardTitle>
						<div className="flex items-center space-x-4">
							<Button
								onClick={toggleEnhancedMode}
								variant={isEnhancedMode ? "default" : "outline"}
								size="sm"
							>
								{isEnhancedMode
									? "Real-time Mode"
									: "Basic Mode"}
							</Button>
							<Button
								onClick={
									isEnhancedMode ? refetchEnhanced : refetch
								}
								variant="outline"
								size="sm"
							>
								Refresh
							</Button>
						</div>
					</div>

					{isEnhancedMode &&
						(totalUnrealizedPnL !== undefined ||
							totalPortfolioValue !== undefined) && (
							<div className="grid grid-cols-2 gap-4 mt-4">
								<div className="text-sm">
									<span className="text-gray-500">
										Total Portfolio Value:
									</span>
									<div className="text-lg font-semibold">
										$
										{totalPortfolioValue?.toFixed(2) ||
											"0.00"}
									</div>
								</div>
								<div className="text-sm">
									<span className="text-gray-500">
										Total Unrealized PnL:
									</span>
									<div
										className={`text-lg font-semibold ${getPnLColor(
											totalUnrealizedPnL
										)}`}
									>
										{formatPnL(totalUnrealizedPnL)}
									</div>
								</div>
							</div>
						)}
				</CardHeader>
			</Card>

			{/* Positions Table */}
			<Card>
				<CardContent className="pt-6">
					{openDisplayPositions.length === 0 ? (
						<div className="text-center py-8 text-gray-500">
							No open positions found
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b">
										<th className="text-left p-2">
											Symbol
										</th>
										<th className="text-left p-2">Side</th>
										<th className="text-left p-2">
											Entry Price
										</th>
										{isEnhancedMode && (
											<th className="text-left p-2">
												Current Price
											</th>
										)}
										<th className="text-left p-2">
											Margin
										</th>
										<th className="text-left p-2">
											Leverage
										</th>
										{isEnhancedMode && (
											<th className="text-left p-2">
												Unrealized PnL
											</th>
										)}
										{isEnhancedMode && (
											<th className="text-left p-2">
												PnL %
											</th>
										)}
										{isEnhancedMode && (
											<th className="text-left p-2">
												Source
											</th>
										)}
										<th className="text-left p-2">
											Status
										</th>
									</tr>
								</thead>
								<tbody>
									{openDisplayPositions.map((position) => {
										const enhanced =
											isEnhancedMode &&
											"currentPrice" in position;

										return (
											<tr
												key={position.id}
												className="border-b hover:bg-gray-50"
											>
												<td className="p-2 font-medium">
													{position.tokenSymbol}
												</td>
												<td className="p-2">
													<Badge
														variant={
															position.isLong
																? "default"
																: "secondary"
														}
													>
														{position.side}
													</Badge>
												</td>
												<td className="p-2">
													{formatPrice(
														position.entryPrice
													)}
												</td>
												{isEnhancedMode && (
													<td className="p-2">
														{formatPrice(
															enhanced
																? (
																		position as any
																  ).currentPrice
																: undefined
														)}
													</td>
												)}
												<td className="p-2">
													{position.margin}
												</td>
												<td className="p-2">
													{position.leverage}
												</td>
												{isEnhancedMode && (
													<td
														className={`p-2 font-medium ${getPnLColor(
															enhanced
																? (
																		position as any
																  )
																		.unrealizedPnL
																: undefined
														)}`}
													>
														{formatPnL(
															enhanced
																? (
																		position as any
																  )
																		.unrealizedPnL
																: undefined
														)}
													</td>
												)}
												{isEnhancedMode && (
													<td
														className={`p-2 font-medium ${getPnLColor(
															enhanced
																? (
																		position as any
																  )
																		.unrealizedPnL
																: undefined
														)}`}
													>
														{formatPercentage(
															enhanced
																? (
																		position as any
																  )
																		.unrealizedPnLPercentage
																: undefined
														)}
													</td>
												)}
												{isEnhancedMode && (
													<td className="p-2">
														{enhanced &&
															(position as any)
																.priceSource && (
																<div className="flex items-center space-x-2">
																	<Badge
																		variant={getConfidenceBadgeVariant(
																			(
																				position as any
																			)
																				.priceConfidence
																		)}
																	>
																		{
																			(
																				position as any
																			)
																				.priceSource
																		}
																	</Badge>
																	{(
																		position as any
																	)
																		.priceConfidence && (
																		<span className="text-xs text-gray-500">
																			{
																				(
																					position as any
																				)
																					.priceConfidence
																			}
																		</span>
																	)}
																</div>
															)}
													</td>
												)}
												<td className="p-2">
													<Badge
														variant={
															position.status ===
															"OPEN"
																? "default"
																: "outline"
														}
													>
														{position.status}
													</Badge>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>

			{isEnhancedMode && (
				<div className="mt-4 text-xs text-gray-500 text-center">
					Real-time prices from Lemon Oracle • Data updated every 30
					seconds
				</div>
			)}
		</div>
	);
}
