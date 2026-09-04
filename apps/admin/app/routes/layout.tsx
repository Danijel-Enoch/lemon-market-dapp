import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Outlet } from "react-router";
import { createConfig, http, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * The console's providers.
 *
 * A wallet is here for exactly two jobs: signing the factory transaction that
 * creates a vault, and sending ETH to an agent that is low on gas. Both are the
 * operator spending their own funds, and both should carry a human signature
 * rather than being something a leaked server key could do.
 *
 * Injected connector only — no WalletConnect, no RainbowKit. An operator console
 * is used from one machine with one wallet extension, and the alternative is
 * shipping a megabyte of connector UI for a button pressed twice a month.
 */
const wagmiConfig = createConfig({
	chains: [base],
	connectors: [injected()],
	transports: { [base.id]: http(import.meta.env.VITE_BASE_RPC_URL || undefined) },
	ssr: true,
});

export default function RootLayout() {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						// An operator refreshing a dashboard wants the current answer,
						// not one cached from before they went to fix something.
						refetchOnWindowFocus: true,
						retry: 1,
					},
				},
			}),
	);

	return (
		<WagmiProvider config={wagmiConfig}>
			<QueryClientProvider client={queryClient}>
				<Outlet />
			</QueryClientProvider>
		</WagmiProvider>
	);
}
