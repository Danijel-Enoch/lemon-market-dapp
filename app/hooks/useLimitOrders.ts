import { getLimitOrders, type LimitOrder } from "@app/lib/position-api";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";

export interface UseLimitOrdersResult {
	limitOrders: LimitOrder[];
	isLoading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
	count: number;
}

/**
 * Custom hook for fetching user limit orders
 */
export function useLimitOrders(): UseLimitOrdersResult {
	const { address, isConnected } = useConnection();

	const {
		data: fetchResult,
		isLoading,
		error: fetchError,
		refetch,
	} = useQuery({
		queryKey: ["limit-orders", address],
		queryFn: async () => {
			if (!address) return null;

			const response = await getLimitOrders(address);

			if (!response.success || !response.data) {
				throw new Error(response.error || "Failed to fetch limit orders");
			}

			return response.data;
		},
		enabled: !!address && isConnected,
		refetchInterval: 15000,
	});

	return {
		limitOrders: fetchResult?.limitOrders || [],
		isLoading,
		error: fetchError ? (fetchError as Error).message : null,
		refetch: async () => {
			await refetch();
		},
		count: fetchResult?.count || 0,
	};
}
