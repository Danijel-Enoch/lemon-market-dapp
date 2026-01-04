import { type ClosePositionRequest, useMarketApi } from "@app/lib/useMarketApi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";

interface ClosePositionResult {
	to?: string;
	data?: string | object;
	gasEstimate?: number;
	error?: string | object;
	success?: boolean;
}

export interface UseClosePositionOptions {
	onSuccess?: () => void;
	onError?: (error: Error) => void;
}

export function useClosePosition(options: UseClosePositionOptions = {}) {
	const { address } = useAccount();
	const marketApi = useMarketApi();
	const queryClient = useQueryClient();
	const { sendTransaction, data: hash, isPending: isSendingTx } = useSendTransaction();
	const { isSuccess: isConfirmed, isLoading: isConfirming } = useWaitForTransactionReceipt({
		hash,
	});

	const mutation = useMutation({
		mutationKey: ["closePosition"],
		mutationFn: async (params: Omit<ClosePositionRequest, "userAddress">) => {
			if (!address) {
				throw new Error("Please connect your wallet first");
			}

			const result = (await marketApi.positions.close({
				...params,
				userAddress: address,
			})) as ClosePositionResult;

			if (!result) {
				throw new Error("Failed to close position");
			}

			// Check for API error response
			if (typeof result === "object" && "error" in result && result.error) {
				throw new Error(
					typeof result.error === "string" ? result.error : "Failed to close position",
				);
			}

			if (typeof result === "object" && "success" in result && result.success === false) {
				throw new Error("Failed to close position");
			}

			let txResult = result as {
				to?: string;
				data?: string;
				gasEstimate?: number;
			};

			// Handle case where tx data is nested in 'data' property
			if ("data" in result && typeof result.data === "object" && result.data !== null) {
				const nestedData = result.data as {
					to?: string;
					data?: string;
					gasEstimate?: number;
				};
				if (nestedData.to && nestedData.data) {
					txResult = nestedData;
				}
			}

			if (!txResult.to || !txResult.data) {
				console.error("Invalid transaction data received:", result);
				throw new Error("Market unavailable at the moment");
			}

			// Send the transaction
			sendTransaction({
				to: txResult.to as `0x${string}`,
				data: txResult.data as `0x${string}`,
				value: BigInt(0),
				gas: txResult.gasEstimate ? BigInt(String(txResult.gasEstimate)) : undefined,
			});

			return txResult;
		},
		onSuccess: () => {
			// Invalidate positions query to refetch after close
			queryClient.invalidateQueries({ queryKey: ["positions"] });
			options.onSuccess?.();
		},
		onError: (error: Error) => {
			options.onError?.(error);
		},
	});

	return {
		closePosition: mutation.mutate,
		closePositionAsync: mutation.mutateAsync,
		isClosing: mutation.isPending || isSendingTx,
		isConfirming,
		isConfirmed,
		error: mutation.error,
		hash,
		reset: mutation.reset,
	};
}
