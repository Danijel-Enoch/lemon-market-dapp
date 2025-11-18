"use client";

import dynamic from "next/dynamic";
import { Toaster } from "sonner";

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
				toastOptions={{
					style: {
						background: "hsl(var(--background))",
						border: "1px solid hsl(var(--border))",
						color: "hsl(var(--foreground))",
					},
				}}
				theme="dark"
				richColors
				closeButton
				expand={false}
				visibleToasts={5}
				duration={4000}
			/>
		</WalletProvider>
	);
}
