import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import {
	getUserPositions,
	getEnhancedUserPositions,
	type Position,
	type EnhancedPosition,
	type GetPositionsResponse,
	type GetEnhancedPositionsResponse
} from "@/lib/position-api";
import { getTokenPriceService } from "@/lib/token-price-service";

export interface UseUserPositionsResult {
	positions: Position[];
	enhancedPositions?: EnhancedPosition[];
	isLoading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
	refetchEnhanced: () => Promise<void>;
	isEmpty: boolean;
	openPositions: Position[];
	closedPositions: Position[];
	totalPnl: number;
	totalMargin: number;
	totalUnrealizedPnL?: number;
	totalPortfolioValue?: number;
	profitablePositions: Position[];
	unprofitablePositions: Position[];
	isEnhancedMode: boolean;
	toggleEnhancedMode: () => void;
}

/**
 * Helper function to calculate real-time PnL for a position
 */
async function calculatePositionRealTimePnL(
	position: Position
): Promise<number> {
	if (position.status === "CLOSED") {
		// For closed positions, use the finalPnl from subgraph
		if (position.pnlRaw) {
			try {
				return parseFloat(position.pnlRaw) / 1e6; // Convert from USDC wei
			} catch {
				return 0;
			}
		}
		return 0;
	}

	// For open positions, calculate real-time PnL using token price service
	try {
		const tokenPriceService = getTokenPriceService();
		const pnlCalculation = await tokenPriceService.calculatePositionPnL(
			position.tokenaddress,
			position.entryPrice,
			position.margin,
			position.leverage,
			position.isLong,
			position.liquidationPrice
		);

		return pnlCalculation?.unrealizedPnL || 0;
	} catch (error) {
		console.warn(
			`Failed to calculate real-time PnL for position ${position.id}:`,
			error
		);
		return 0;
	}
}

/**
 * Custom hook for managing user positions
 * Automatically fetches positions when wallet is connected and provides utility methods
 * Supports both basic and enhanced mode with real-time PnL calculations
 */
export function useUserPositions(): UseUserPositionsResult {
	const { address, isConnected } = useAccount();
	const [positions, setPositions] = useState<Position[]>([]);
	const [enhancedPositions, setEnhancedPositions] = useState<
		EnhancedPosition[]
	>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isEnhancedMode, setIsEnhancedMode] = useState(false);
	const [totalUnrealizedPnL, setTotalUnrealizedPnL] = useState<number>(0);
	const [totalPortfolioValue, setTotalPortfolioValue] = useState<number>(0);
	const [calculatedPnLMap, setCalculatedPnLMap] = useState<
		Map<string, number>
	>(new Map());

	const calculateRealTimePnL = useCallback(async () => {
		if (positions.length === 0) {
			setCalculatedPnLMap(new Map());
			return;
		}

		try {
			const pnlMap = new Map<string, number>();

			// Calculate PnL for each position
			await Promise.all(
				positions.map(async (position) => {
					const pnl = await calculatePositionRealTimePnL(position);
					pnlMap.set(position.id, pnl);
				})
			);

			setCalculatedPnLMap(pnlMap);
		} catch (error) {
			console.error("Error calculating real-time PnL:", error);
		}
	}, [positions]);

	const fetchPositions = useCallback(async () => {
		if (!address) return;

		setIsLoading(true);
		setError(null);

		try {
			const response = await getUserPositions(address);
			if (response.success) {
				setPositions(response.positions);
			} else {
				setError(response.error || "Failed to fetch positions");
			}
		} catch (err) {
			console.error("Error fetching positions:", err);
			setError("Failed to load positions");
		} finally {
			setIsLoading(false);
		}
	}, [address]);

	const fetchEnhancedPositions = useCallback(async () => {
		if (!address) return;

		setIsLoading(true);
		setError(null);

		try {
			const response = await getEnhancedUserPositions(address);
			if (response.success) {
				setPositions(response.positions as Position[]); // Set basic positions too
				setEnhancedPositions(response.positions);
				setTotalUnrealizedPnL(response.totalUnrealizedPnL || 0);
				setTotalPortfolioValue(response.totalPortfolioValue || 0);
			} else {
				setError(
					response.error || "Failed to fetch enhanced positions"
				);
			}
		} catch (err) {
			console.error("Error fetching enhanced positions:", err);
			setError("Failed to load enhanced positions");
		} finally {
			setIsLoading(false);
		}
	}, [address]);

	// Fetch positions when wallet connects/disconnects
	useEffect(() => {
		if (isConnected && address) {
			if (isEnhancedMode) {
				fetchEnhancedPositions();
			} else {
				fetchPositions();
			}
		} else {
			setPositions([]);
			setEnhancedPositions([]);
			setTotalUnrealizedPnL(0);
			setTotalPortfolioValue(0);
			setCalculatedPnLMap(new Map());
			setError(null);
		}
	}, [
		isConnected,
		address,
		isEnhancedMode,
		fetchPositions,
		fetchEnhancedPositions
	]);

	// Calculate real-time PnL for basic mode positions
	useEffect(() => {
		if (!isEnhancedMode && positions.length > 0) {
			calculateRealTimePnL();
		}
	}, [isEnhancedMode, positions, calculateRealTimePnL]);

	const toggleEnhancedMode = useCallback(() => {
		setIsEnhancedMode((prev) => !prev);
	}, []);

	// Function to enrich positions with calculated PnL values
	const enrichPositionsWithCalculatedPnL = useCallback(
		(positionsToEnrich: Position[]): Position[] => {
			return positionsToEnrich.map((position) => {
				// In enhanced mode, the PnL is already calculated in the enhanced data
				if (isEnhancedMode && enhancedPositions) {
					const enhancedPosition = enhancedPositions.find(
						(ep) => ep.id === position.id
					);
					if (enhancedPosition?.unrealizedPnL !== undefined) {
						// Convert unrealizedPnL back to USDC wei format for consistency
						const pnlInWei = (
							enhancedPosition.unrealizedPnL * 1e6
						).toString();
						return {
							...position,
							pnlRaw: pnlInWei,
							pnl: `$${
								enhancedPosition.unrealizedPnL >= 0 ? "+" : ""
							}${enhancedPosition.unrealizedPnL.toFixed(2)}`
						};
					}
				}

				// In basic mode, use calculated PnL map
				if (!isEnhancedMode && calculatedPnLMap.has(position.id)) {
					const calculatedPnL =
						calculatedPnLMap.get(position.id) || 0;
					// Convert back to USDC wei format for consistency with existing code
					const pnlInWei = (calculatedPnL * 1e6).toString();
					return {
						...position,
						pnlRaw: pnlInWei,
						pnl: `$${
							calculatedPnL >= 0 ? "+" : ""
						}${calculatedPnL.toFixed(2)}`
					};
				}

				// For closed positions, keep the original subgraph PnL
				if (position.status === "CLOSED") {
					return position;
				}

				// For open positions without calculated data, set to 0
				return {
					...position,
					pnlRaw: "0",
					pnl: "$0.00"
				};
			});
		},
		[isEnhancedMode, enhancedPositions, calculatedPnLMap]
	);

	// Derived state with enriched positions
	const enrichedBasicPositions = enrichPositionsWithCalculatedPnL(positions);
	const isEmpty = enrichedBasicPositions.length === 0;
	const openPositions = enrichedBasicPositions.filter(
		(p) => p.status === "OPEN"
	);
	const closedPositions = enrichedBasicPositions.filter(
		(p) => p.status === "CLOSED"
	);

	// Calculate total PnL using enriched positions with real-time calculations
	const totalPnl = enrichedBasicPositions.reduce((sum, position) => {
		if (!position.pnlRaw) return sum;
		try {
			const pnl = parseFloat(position.pnlRaw) / 1e6; // Convert from USDC wei
			return sum + (isNaN(pnl) ? 0 : pnl);
		} catch {
			return sum;
		}
	}, 0);

	// Calculate total margin
	const totalMargin = enrichedBasicPositions.reduce((sum, position) => {
		try {
			const margin = parseFloat(position.margin.replace(/[$,]/g, ""));
			return sum + (isNaN(margin) ? 0 : margin);
		} catch {
			return sum;
		}
	}, 0);

	// Filter profitable and unprofitable positions using enriched data
	const profitablePositions = enrichedBasicPositions.filter((position) => {
		if (!position.pnlRaw) return false;
		try {
			const pnl = parseFloat(position.pnlRaw);
			return !isNaN(pnl) && pnl > 0;
		} catch {
			return false;
		}
	});

	const unprofitablePositions = enrichedBasicPositions.filter((position) => {
		if (!position.pnlRaw) return false;
		try {
			const pnl = parseFloat(position.pnlRaw);
			return !isNaN(pnl) && pnl < 0;
		} catch {
			return false;
		}
	});

	// Auto-refresh positions for real-time PnL updates
	useEffect(() => {
		let intervalId: NodeJS.Timeout;

		if (isConnected && address && openPositions.length > 0) {
			// Refresh every 10 seconds for micro price change detection
			intervalId = setInterval(() => {
				if (isEnhancedMode) {
					fetchEnhancedPositions();
				} else {
					// In basic mode, just recalculate PnL with current prices
					calculateRealTimePnL();
				}
			}, 10000);
		}

		return () => {
			if (intervalId) {
				clearInterval(intervalId);
			}
		};
	}, [
		isConnected,
		address,
		isEnhancedMode,
		openPositions.length,
		fetchEnhancedPositions,
		calculateRealTimePnL
	]);

	return {
		positions: enrichedBasicPositions,
		enhancedPositions: isEnhancedMode ? enhancedPositions : undefined,
		isLoading,
		error,
		refetch: fetchPositions,
		refetchEnhanced: fetchEnhancedPositions,
		isEmpty,
		openPositions,
		closedPositions,
		totalPnl,
		totalMargin,
		totalUnrealizedPnL,
		totalPortfolioValue,
		profitablePositions,
		unprofitablePositions,
		isEnhancedMode,
		toggleEnhancedMode
	};
}
