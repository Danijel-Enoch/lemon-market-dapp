import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { type EnhancedPosition, getEnhancedUserPositions, type Position } from "@/lib/position-api";
import { getTokenPriceService } from "@/lib/token-price-service";
import { useMarketApi } from "@/lib/useMarketApi";

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
async function calculatePositionRealTimePnL(position: Position): Promise<number> {
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
			position.liquidationPrice,
		);

		return pnlCalculation?.unrealizedPnL || 0;
	} catch (_error) {
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
	const [isEnhancedMode, setIsEnhancedMode] = useState(false);
	const marketApi = useMarketApi();

	const {
		data: fetchResult,
		isLoading: isBasicLoading,
		error: fetchError,
		refetch: refetchBasic,
	} = useQuery({
		queryKey: ["positions", "basic", address],
		queryFn: async () => {
			if (!address) return null;
			const result = await marketApi.positions.query({ trader: address });
			// Handle both array response and object response with positions property
			const positions = (Array.isArray(result) ? result : result?.positions || []) as Position[];
			return { positions };
		},
		enabled: !!address && isConnected && !isEnhancedMode,
		refetchInterval: 10000,
	});

	const {
		data: enhancedResult,
		isLoading: isEnhancedLoading,
		error: enhancedError,
		refetch: refetchEnhanced,
	} = useQuery({
		queryKey: ["positions", "enhanced", address],
		queryFn: async () => {
			if (!address) return null;
			const response = await getEnhancedUserPositions(address);
			if (response.success) {
				return {
					positions: response.positions as Position[],
					enhancedPositions: response.positions,
					totalUnrealizedPnL: response.totalUnrealizedPnL || 0,
					totalPortfolioValue: response.totalPortfolioValue || 0,
				};
			}
			throw new Error(response.error || "Failed to fetch enhanced positions");
		},
		enabled: !!address && isConnected && isEnhancedMode,
		refetchInterval: 10000,
	});

	// Derive positions and enhanced data from fetch results using useMemo
	const positions = useMemo(() => {
		if (isEnhancedMode && enhancedResult) {
			return enhancedResult.positions;
		}
		if (!isEnhancedMode && fetchResult) {
			return fetchResult.positions;
		}
		return [];
	}, [isEnhancedMode, enhancedResult, fetchResult]);

	const enhancedPositions = useMemo(() => {
		return isEnhancedMode && enhancedResult ? enhancedResult.enhancedPositions : undefined;
	}, [isEnhancedMode, enhancedResult]);

	const totalUnrealizedPnL = useMemo(() => {
		return enhancedResult?.totalUnrealizedPnL || 0;
	}, [enhancedResult]);

	const totalPortfolioValue = useMemo(() => {
		return enhancedResult?.totalPortfolioValue || 0;
	}, [enhancedResult]);

	// Convert error to string for compatibility
	const error = fetchError ? fetchError.message : enhancedError ? enhancedError.message : null;
	const isLoading = isEnhancedMode ? isEnhancedLoading : isBasicLoading;

	const { data: pnlMapResult } = useQuery({
		queryKey: ["positions", "pnl", positions],
		queryFn: async () => {
			if (positions.length === 0) {
				return new Map<string, number>();
			}

			const pnlMap = new Map<string, number>();

			// Calculate PnL for each position
			await Promise.all(
				positions.map(async (position) => {
					const pnl = await calculatePositionRealTimePnL(position);
					pnlMap.set(position.id, pnl);
				}),
			);

			return pnlMap;
		},
		enabled: !isEnhancedMode && positions.length > 0,
		refetchInterval: 10000,
	});

	// Derive calculatedPnLMap from the async result using useMemo
	const calculatedPnLMap = useMemo(() => {
		return pnlMapResult || new Map<string, number>();
	}, [pnlMapResult]);

	const toggleEnhancedMode = useCallback(() => {
		setIsEnhancedMode((prev) => !prev);
	}, []);

	// Function to enrich positions with calculated PnL values
	const enrichPositionsWithCalculatedPnL = useCallback(
		(positionsToEnrich: Position[]): Position[] => {
			return positionsToEnrich.map((position) => {
				// In enhanced mode, the PnL is already calculated in the enhanced data
				if (isEnhancedMode && enhancedPositions) {
					const enhancedPosition = enhancedPositions.find((ep) => ep.id === position.id);
					if (enhancedPosition?.unrealizedPnL !== undefined) {
						// Convert unrealizedPnL back to USDC wei format for consistency
						const pnlInWei = (enhancedPosition.unrealizedPnL * 1e6).toString();
						return {
							...position,
							pnlRaw: pnlInWei,
							pnl: `$${
								enhancedPosition.unrealizedPnL >= 0 ? "+" : ""
							}${enhancedPosition.unrealizedPnL.toFixed(2)}`,
						};
					}
				}

				// In basic mode, use calculated PnL map
				if (!isEnhancedMode && calculatedPnLMap.has(position.id)) {
					const calculatedPnL = calculatedPnLMap.get(position.id) || 0;
					// Convert back to USDC wei format for consistency with existing code
					const pnlInWei = (calculatedPnL * 1e6).toString();
					return {
						...position,
						pnlRaw: pnlInWei,
						pnl: `$${calculatedPnL >= 0 ? "+" : ""}${calculatedPnL.toFixed(2)}`,
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
					pnl: "$0.00",
				};
			});
		},
		[isEnhancedMode, enhancedPositions, calculatedPnLMap],
	);

	// Derived state with enriched positions
	const enrichedBasicPositions = enrichPositionsWithCalculatedPnL(positions);
	const isEmpty = enrichedBasicPositions.length === 0;
	const openPositions = enrichedBasicPositions.filter((p) => p.status === "OPEN");
	const closedPositions = enrichedBasicPositions.filter((p) => p.status === "CLOSED");

	// Calculate total PnL using enriched positions with real-time calculations
	const totalPnl = enrichedBasicPositions.reduce((sum, position) => {
		if (!position.pnlRaw) return sum;
		try {
			const pnl = parseFloat(position.pnlRaw) / 1e6; // Convert from USDC wei
			return sum + (Number.isNaN(pnl) ? 0 : pnl);
		} catch {
			return sum;
		}
	}, 0);

	// Calculate total margin
	const totalMargin = enrichedBasicPositions.reduce((sum, position) => {
		try {
			const margin = parseFloat(position.margin.replace(/[$,]/g, ""));
			return sum + (Number.isNaN(margin) ? 0 : margin);
		} catch {
			return sum;
		}
	}, 0);

	// Filter profitable and unprofitable positions using enriched data
	const profitablePositions = enrichedBasicPositions.filter((position) => {
		if (!position.pnlRaw) return false;
		try {
			const pnl = parseFloat(position.pnlRaw);
			return !Number.isNaN(pnl) && pnl > 0;
		} catch {
			return false;
		}
	});

	const unprofitablePositions = enrichedBasicPositions.filter((position) => {
		if (!position.pnlRaw) return false;
		try {
			const pnl = parseFloat(position.pnlRaw);
			return !Number.isNaN(pnl) && pnl < 0;
		} catch {
			return false;
		}
	});

	return {
		positions: enrichedBasicPositions,
		enhancedPositions: isEnhancedMode ? enhancedPositions : undefined,
		isLoading,
		error,
		refetch: async () => {
			await refetchBasic();
		},
		refetchEnhanced: async () => {
			await refetchEnhanced();
		},
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
		toggleEnhancedMode,
	};
}
