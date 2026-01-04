import { config } from "@app/lib/wagmi";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WagmiProvider } from "wagmi";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: React.ReactNode }) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				{mounted ? (
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
				) : (
					children
				)}
			</QueryClientProvider>
		</WagmiProvider>
	);
}
