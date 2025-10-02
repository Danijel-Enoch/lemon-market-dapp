import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import {
	getUserPositions,
	getEnhancedUserPositions,
	type Position,
	type EnhancedPosition,
	type GetEnhancedPositionsResponse
} from "@/lib/position-api";

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
			setError(null);
		}
	}, [
		isConnected,
		address,
		isEnhancedMode,
		fetchPositions,
		fetchEnhancedPositions
	]);

	const toggleEnhancedMode = useCallback(() => {
		setIsEnhancedMode((prev) => !prev);
	}, []);

	// Derived state
	const isEmpty = positions.length === 0;
	const openPositions = positions.filter((p) => p.status === "OPEN");
	const closedPositions = positions.filter((p) => p.status === "CLOSED");

	// Calculate total PnL (sum of raw PnL values)
	const totalPnl = positions.reduce((sum, position) => {
		if (!position.pnlRaw) return sum;
		try {
			const pnl = parseFloat(position.pnlRaw) / 1e6; // Convert from USDC wei
			return sum + (isNaN(pnl) ? 0 : pnl);
		} catch {
			return sum;
		}
	}, 0);

	// Calculate total margin
	const totalMargin = positions.reduce((sum, position) => {
		try {
			const margin = parseFloat(position.margin.replace(/[$,]/g, ""));
			return sum + (isNaN(margin) ? 0 : margin);
		} catch {
			return sum;
		}
	}, 0);

	// Filter profitable and unprofitable positions
	const profitablePositions = positions.filter((position) => {
		if (!position.pnlRaw) return false;
		try {
			const pnl = parseFloat(position.pnlRaw);
			return !isNaN(pnl) && pnl > 0;
		} catch {
			return false;
		}
	});

	const unprofitablePositions = positions.filter((position) => {
		if (!position.pnlRaw) return false;
		try {
			const pnl = parseFloat(position.pnlRaw);
			return !isNaN(pnl) && pnl < 0;
		} catch {
			return false;
		}
	});

	return {
		positions,
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
