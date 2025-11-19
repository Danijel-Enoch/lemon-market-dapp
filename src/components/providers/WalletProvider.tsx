"use client";

import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: React.ReactNode }) {
	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				<RainbowKitProvider
					modalSize="compact"
					theme={{
						...darkTheme({
							accentColor: "#65a30d",
							accentColorForeground: "white",
							borderRadius: "large",
							fontStack: "system",
							overlayBlur: "small",
						}),
						colors: {
							...darkTheme().colors,
							accentColor: "#65a30d",
							accentColorForeground: "white",
							modalBackground: "#0f1419",
							modalBorder: "#1f2937",
						},
					}}
				>
					{children}
				</RainbowKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
}
