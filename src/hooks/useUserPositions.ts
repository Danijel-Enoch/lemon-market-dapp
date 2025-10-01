import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { getUserPositions, type Position } from "@/lib/position-api";

export interface UseUserPositionsResult {
	positions: Position[];
	isLoading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
	isEmpty: boolean;
	openPositions: Position[];
	closedPositions: Position[];
	totalPnl: number;
	totalMargin: number;
	profitablePositions: Position[];
	unprofitablePositions: Position[];
}

/**
 * Custom hook for managing user positions
 * Automatically fetches positions when wallet is connected and provides utility methods
 */
export function useUserPositions(): UseUserPositionsResult {
	const { address, isConnected } = useAccount();
	const [positions, setPositions] = useState<Position[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

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

	// Fetch positions when wallet connects/disconnects
	useEffect(() => {
		if (isConnected && address) {
			fetchPositions();
		} else {
			setPositions([]);
			setError(null);
		}
	}, [isConnected, address, fetchPositions]);

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
		isLoading,
		error,
		refetch: fetchPositions,
		isEmpty,
		openPositions,
		closedPositions,
		totalPnl,
		totalMargin,
		profitablePositions,
		unprofitablePositions
	};
}
