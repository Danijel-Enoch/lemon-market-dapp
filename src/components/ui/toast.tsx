"use client";

import { toast as sonnerToast } from "sonner";
import { CheckCircle, XCircle, AlertCircle, Clock, ExternalLink } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "loading" | "info";

interface ToastOptions {
	title?: string;
	description?: string;
	action?: {
		label: string;
		onClick: () => void;
	};
	duration?: number;
}

interface TransactionToastOptions extends ToastOptions {
	hash?: string;
	explorerUrl?: string;
}

class Toast {
	static show(type: ToastType, message: string, options?: ToastOptions) {
		const icon = this.getIcon(type);

		sonnerToast(message, {
			description: options?.description,
			duration: options?.duration || 4000,
			icon,
			action: options?.action
				? {
						label: options.action.label,
						onClick: options.action.onClick,
					}
				: undefined,
			style: {
				background: "var(--background)",
				border: "1px solid var(--border)",
				color: "var(--foreground)",
			},
		});
	}

	static success(message: string, options?: ToastOptions) {
		this.show("success", message, options);
	}

	static error(message: string, options?: ToastOptions) {
		this.show("error", message, options);
	}

	static warning(message: string, options?: ToastOptions) {
		this.show("warning", message, options);
	}

	static loading(message: string, options?: ToastOptions) {
		return sonnerToast.loading(message, {
			description: options?.description,
			duration: options?.duration || Infinity,
		});
	}

	static info(message: string, options?: ToastOptions) {
		this.show("info", message, options);
	}

	static dismiss(toastId?: string | number) {
		if (toastId) {
			sonnerToast.dismiss(toastId);
		} else {
			sonnerToast.dismiss();
		}
	}

	// Transaction-specific toasts
	static transaction = {
		pending: (message: string = "Transaction pending...", options?: TransactionToastOptions) => {
			return Toast.loading(message, {
				description: options?.hash
					? `Hash: ${options.hash.slice(0, 10)}...${options.hash.slice(-8)}`
					: options?.description,
				...options,
			});
		},

		success: (message: string = "Transaction successful!", options?: TransactionToastOptions) => {
			Toast.success(message, {
				description: options?.hash
					? `Hash: ${options.hash.slice(0, 10)}...${options.hash.slice(-8)}`
					: options?.description,
				action: options?.explorerUrl
					? {
							label: "View on Explorer",
							onClick: () => window.open(options.explorerUrl, "_blank"),
						}
					: options?.action,
				...options,
			});
		},

		failed: (message: string = "Transaction failed", options?: TransactionToastOptions) => {
			Toast.error(message, {
				description: options?.description || "Please try again or check your wallet",
				action:
					options?.explorerUrl && options?.hash
						? {
								label: "View on Explorer",
								onClick: () => window.open(options.explorerUrl, "_blank"),
							}
						: options?.action,
				...options,
			});
		},

		confirmed: (message: string = "Transaction confirmed!", options?: TransactionToastOptions) => {
			Toast.success(message, {
				description: options?.description,
				action: options?.explorerUrl
					? {
							label: "View on Explorer",
							onClick: () => window.open(options.explorerUrl, "_blank"),
						}
					: options?.action,
				duration: 6000,
				...options,
			});
		},
	};

	private static getIcon(type: ToastType) {
		switch (type) {
			case "success":
				return <CheckCircle className="w-4 h-4 text-green-500" />;
			case "error":
				return <XCircle className="w-4 h-4 text-red-500" />;
			case "warning":
				return <AlertCircle className="w-4 h-4 text-yellow-500" />;
			case "loading":
				return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
			case "info":
			default:
				return <AlertCircle className="w-4 h-4 text-blue-500" />;
		}
	}
}

export { Toast };
