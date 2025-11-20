"use client";

import dynamic from "next/dynamic";
import { Toaster } from "react-hot-toast";

// Dynamically import WalletProvider with SSR disabled to avoid localStorage issues
const WalletProvider = dynamic(
	() => import("@/components/providers/WalletProvider").then((mod) => mod.WalletProvider),
	{ ssr: false },
);

interface ToastProviderProps {
	children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
	return (
		<WalletProvider>
			{children}
			<Toaster
				position="top-right"
				reverseOrder={false}
				toastOptions={{
					// Default options for all toasts
					style: {
						background: "hsl(var(--background))",
						border: "1px solid hsl(var(--border))",
						color: "hsl(var(--foreground))",
					},
					// Don't show emoji icons by default
					theme: "dark",
					duration: 4000,
					className: "rounded-md border",
					error: {
						// Custom styles for error
						style: {
							background: "hsl(var(--card))",
							border: "1px solid hsl(var(--red-600))",
							color: "hsl(var(--error))",
						},
					},
					success: {
						style: {
							background: "hsl(var(--card))",
							border: "1px solid hsl(var(--green-600))",
							color: "hsl(var(--green-400))",
						},
					},
					loading: {
						style: {
							background: "hsl(var(--card))",
							border: "1px solid hsl(var(--border))",
							color: "hsl(var(--foreground))",
						},
					},
				}}
			/>
		</WalletProvider>
	);
}
