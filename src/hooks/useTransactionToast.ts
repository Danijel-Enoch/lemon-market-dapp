"use client";

import { useState, useCallback } from "react";
import { useChainId } from "wagmi";
import { Toast } from "@/components/ui/toast";
import {
	getExplorerUrl,
	parseTransactionError,
	type TransactionStatus,
} from "@/lib/transaction-utils";

interface UseTransactionOptions {
	onSuccess?: (hash: string) => void;
	onError?: (error: string) => void;
	successMessage?: string;
	errorMessage?: string;
	pendingMessage?: string;
}

export function useTransactionToast(options: UseTransactionOptions = {}) {
	const [status, setStatus] = useState<TransactionStatus>({ status: "idle" });
	const chainId = useChainId();

	const reset = useCallback(() => {
		setStatus({ status: "idle" });
	}, []);

	const handleTransaction = useCallback(
		async (
			transactionFn: () => Promise<string>, // Function that returns transaction hash
			customOptions?: Partial<UseTransactionOptions>,
		) => {
			const opts = { ...options, ...customOptions };

			try {
				setStatus({ status: "pending" });

				// Show loading toast
				const loadingToastId = Toast.transaction.pending(
					opts.pendingMessage || "Transaction pending...",
					{
						description: "Please confirm the transaction in your wallet",
					},
				);

				// Execute the transaction
				const hash = await transactionFn();

				// Dismiss loading toast
				Toast.dismiss(loadingToastId);

				// Update status
				setStatus({ status: "success", hash });

				// Show success toast
				Toast.transaction.success(opts.successMessage || "Transaction submitted successfully!", {
					hash,
					explorerUrl: getExplorerUrl(hash, chainId),
					description: "Your transaction is being processed",
				});

				// Call success callback
				if (opts.onSuccess) {
					opts.onSuccess(hash);
				}

				return hash;
			} catch (error) {
				const errorMessage = parseTransactionError(error);

				setStatus({
					status: "error",
					error: errorMessage,
				});

				// Show error toast
				Toast.transaction.failed(opts.errorMessage || "Transaction failed", {
					description: errorMessage,
				});

				// Call error callback
				if (opts.onError) {
					opts.onError(errorMessage);
				}

				throw error;
			}
		},
		[options, chainId],
	);

	const showConfirmation = useCallback(
		(hash: string, message?: string) => {
			Toast.transaction.confirmed(message || "Transaction confirmed!", {
				hash,
				explorerUrl: getExplorerUrl(hash, chainId),
				description: "Your transaction has been confirmed on the blockchain",
			});
		},
		[chainId],
	);

	return {
		status,
		handleTransaction,
		showConfirmation,
		reset,
		isLoading: status.status === "pending",
		isSuccess: status.status === "success",
		isError: status.status === "error",
		hash: status.hash,
		error: status.error,
	};
}
