import { parseTransactionError, type TransactionStatus } from "@app/lib/transaction-utils";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";

interface UseTransactionOptions {
	onSuccess?: (hash: string) => void;
	onError?: (error: string) => void;
	successMessage?: string;
	errorMessage?: string;
	pendingMessage?: string;
}

export function useTransactionToast(options: UseTransactionOptions = {}) {
	const [status, setStatus] = useState<TransactionStatus>({ status: "idle" });
	// const chainId = useChainId();

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
				const loadingToastId = toast.loading(opts.pendingMessage || "Transaction pending...");

				// Execute the transaction
				const hash = await transactionFn();

				// Dismiss loading toast
				toast.dismiss(loadingToastId);

				// Update status
				setStatus({ status: "success", hash });

				// Show success toast
				toast.success(opts.successMessage || "Transaction submitted successfully!");

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
				toast.error(opts.errorMessage || "Transaction failed");

				// Call error callback
				if (opts.onError) {
					opts.onError(errorMessage);
				}

				throw error;
			}
		},
		[options],
	);

	const showConfirmation = useCallback((_hash: string, message?: string) => {
		toast.success(message || "Transaction confirmed!");
	}, []);

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
