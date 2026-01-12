import {
	type EnhancedPosition,
	getEnhancedUserPositions,
	type Position,
} from "@app/lib/position-api";
import {
	type TraderPosition,
	type TraderPositionsResponse,
	useMarketApi,
} from "@app/lib/useMarketApi";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useConnection } from "wagmi";

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
	totalVolume?: number;
	activePositionWorth?: number;
	profitablePositions: Position[];
	unprofitablePositions: Position[];
	isEnhancedMode: boolean;
	toggleEnhancedMode: () => void;
	summary?: {
		totalPositions: number;
		activePositions: number;
		closedPositions: number;
		liquidatedPositions: number;
		totalPnlFormatted: string;
		totalVolumeFormatted: string;
		activePositionWorthFormatted: string;
	};
}

/**
 * Transform TraderPosition from API to Position for UI compatibility
 */
function transformTraderPosition(traderPos: TraderPosition): Position {
	const tokenSymbolParts = traderPos.tokenSymbol.split("-");
	const displaySymbol = tokenSymbolParts[0] || traderPos.tokenSymbol;

	// Determine if position is open or closed
	const isOpen = traderPos.status === "OPENED";

	// Use realtime PnL for open positions, exitPricePnl for closed
	const pnlValue =
		isOpen && traderPos.realtimeData
			? traderPos.realtimeData.realtimePnl
			: traderPos.currentPnl;

	const pnlNumber = parseFloat(pnlValue.replace(/[$,]/g, "")) || 0;

	// Use formatted PnL - for closed positions use exitPricePnl if available
	const pnlFormatted =
		isOpen && traderPos.realtimeData
			? traderPos.realtimeData.formatted.realtimePnl
			: traderPos.formatted.exitPricePnl ||
				traderPos.formatted.currentPnl;

	// Get PnL percentage
	const pnlPercentage =
		isOpen && traderPos.realtimeData
			? traderPos.realtimeData.pnlPercentage
			: traderPos.formatted.exitPricePnlPercentage || "0%";

	return {
		id: traderPos.id,
		positionId: traderPos.positionId,
		pair: `${displaySymbol}/USDC`,
		side: traderPos.isLong ? "Long" : "Short",
		tokenSymbol: traderPos.tokenSymbol,
		isLong: traderPos.isLong,
		entryPrice: traderPos.formatted.entryPrice,
		exitPrice: traderPos.exitPrice ? traderPos.formatted.exitPrice : null,
		margin: traderPos.formatted.margin,
		leverage: traderPos.formatted.leverage,
		leverageValue: parseInt(traderPos.leverage, 10) || 1,
		liquidationPrice: traderPos.formatted.liquidationPrice,
		status: isOpen ? "OPEN" : traderPos.status,
		pnl: pnlFormatted,
		pnlRaw: (pnlNumber * 1e6).toString(), // Convert to USDC wei for compatibility
		pnlPercentage,
		openedAt: traderPos.formatted.openedAt,
		closedAt: traderPos.formatted.closedAt || null,
		lastUpdatedAt: traderPos.lastModifiedAt,
		lastTransactionHash: traderPos.lastUpdateTransactionHash,
		trader: traderPos.trader,
		tokenaddress: tokenSymbolParts[1] || "",
		realtimeData: traderPos.realtimeData || {
			realtimePnl: traderPos.currentPnl,
			currentPrice: traderPos.entryPrice,
			pnlPercentage: pnlPercentage,
			priceChange: "0",
			priceChangePercentage: "0%",
			formatted: {
				realtimePnl: pnlFormatted,
				currentPrice: traderPos.formatted.entryPrice,
				priceChange: "$0.00",
			},
		},
	};
}

/**
 * Custom hook for managing user positions
 * Uses the /positions/trader/{traderAddress} endpoint for complete position data
 * with real-time PnL calculations
 */
export function useUserPositions(): UseUserPositionsResult {
	const { address, isConnected } = useConnection();
	const [isEnhancedMode, setIsEnhancedMode] = useState(false);
	const marketApi = useMarketApi();

	const {
		data: fetchResult,
		isLoading: isBasicLoading,
		error: fetchError,
		refetch: refetchBasic,
	} = useQuery({
		queryKey: ["positions", "trader", address],
		queryFn: async () => {
			if (!address) return null;

			// Use the trader endpoint which includes all positions and summary data
			const result = await marketApi.positions.trader(address);

			if (!result || !(result as TraderPositionsResponse).success) {
				throw new Error("Failed to fetch positions");
			}

			const response = result as TraderPositionsResponse;
			const data = response.data;

			// Transform positions to UI format
			const transformedPositions = data.positions.map(
				transformTraderPosition
			);

			return {
				positions: transformedPositions,
				activePositions: data.activePositions.map(
					transformTraderPosition
				),
				inactivePositions: data.inactivePositions.map(
					transformTraderPosition
				),
				totalPnl: parseFloat(data.totalPnl.replace(/[$,]/g, "")) || 0,
				totalVolume:
					parseFloat(data.totalVolume.replace(/[$,]/g, "")) || 0,
				activePositionWorth:
					parseFloat(data.activePositionWorth.replace(/[$,]/g, "")) ||
					0,
				summary: data.summary,
			};
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
			throw new Error(
				response.error || "Failed to fetch enhanced positions"
			);
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
		return isEnhancedMode && enhancedResult
			? enhancedResult.enhancedPositions
			: undefined;
	}, [isEnhancedMode, enhancedResult]);

	const totalUnrealizedPnL = useMemo(() => {
		return enhancedResult?.totalUnrealizedPnL || 0;
	}, [enhancedResult]);

	const totalPortfolioValue = useMemo(() => {
		return enhancedResult?.totalPortfolioValue || 0;
	}, [enhancedResult]);

	// Convert error to string for compatibility
	const error = fetchError
		? fetchError.message
		: enhancedError
			? enhancedError.message
			: null;
	const isLoading = isEnhancedMode ? isEnhancedLoading : isBasicLoading;

	const toggleEnhancedMode = useCallback(() => {
		setIsEnhancedMode((prev) => !prev);
	}, []);

	// Derived state
	const isEmpty = positions.length === 0;
	const openPositions = useMemo(() => {
		if (!isEnhancedMode && fetchResult) {
			return fetchResult.activePositions;
		}
		return positions.filter((p) => p.status === "OPEN");
	}, [isEnhancedMode, fetchResult, positions]);

	const closedPositions = useMemo(() => {
		if (!isEnhancedMode && fetchResult) {
			return fetchResult.inactivePositions;
		}
		return positions.filter((p) => p.status !== "OPEN");
	}, [isEnhancedMode, fetchResult, positions]);

	// Use totals from API response directly
	const totalPnl = useMemo(() => {
		if (!isEnhancedMode && fetchResult) {
			return fetchResult.totalPnl;
		}
		return positions.reduce((sum, position) => {
			if (!position.pnlRaw) return sum;
			try {
				const pnl =
					parseFloat(position.pnlRaw.replace(/[$,]/g, "")) / 1e6;
				return sum + (Number.isNaN(pnl) ? 0 : pnl);
			} catch {
				return sum;
			}
		}, 0);
	}, [isEnhancedMode, fetchResult, positions]);

	// Calculate total margin
	const totalMargin = useMemo(() => {
		return positions.reduce((sum, position) => {
			try {
				const margin = parseFloat(position.margin.replace(/[$,]/g, ""));
				return sum + (Number.isNaN(margin) ? 0 : margin);
			} catch {
				return sum;
			}
		}, 0);
	}, [positions]);

	// Filter profitable and unprofitable positions
	const profitablePositions = useMemo(() => {
		return positions.filter((position) => {
			if (!position.pnlRaw) return false;
			try {
				const pnl = parseFloat(position.pnlRaw.replace(/[$,]/g, ""));
				return !Number.isNaN(pnl) && pnl > 0;
			} catch {
				return false;
			}
		});
	}, [positions]);

	const unprofitablePositions = useMemo(() => {
		return positions.filter((position) => {
			if (!position.pnlRaw) return false;
			try {
				const pnl = parseFloat(position.pnlRaw.replace(/[$,]/g, ""));
				return !Number.isNaN(pnl) && pnl < 0;
			} catch {
				return false;
			}
		});
	}, [positions]);

	return {
		positions,
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
		totalVolume: fetchResult?.totalVolume,
		activePositionWorth: fetchResult?.activePositionWorth,
		profitablePositions,
		unprofitablePositions,
		isEnhancedMode,
		toggleEnhancedMode,
		summary: fetchResult?.summary,
	};
}
