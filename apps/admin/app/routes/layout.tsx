import { createWalletConfig, LemonRainbowKitProvider } from "@lemon/wallet";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Outlet } from "react-router";
import { WagmiProvider } from "wagmi";

/**
 * The console's providers.
 *
 * A wallet is here for exactly two jobs: signing the factory transaction that
 * creates a vault, and sending ETH to an agent that is low on gas. Both are the
 * operator spending their own funds, and both should carry a human signature
 * rather than being something a leaked server key could do.
 *
 * This used to be the injected connector alone, on the reasoning that an
 * operator console is used from one machine with one extension. That held right
 * up until the console had to be pointed at a fork or a testnet: the injected
 * path offers no way to *add* the chain, so an operator whose wallet had never
 * seen it got a connect button that appeared to work and writes that silently
 * went nowhere. RainbowKit carries the add-chain flow, and it is the same modal
 * the public app already shows, so there is one connection experience rather
 * than two.
 */
const wagmiConfig = createWalletConfig({ appName: "Lemon Admin" });

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
				<LemonRainbowKitProvider>
					<Outlet />
				</LemonRainbowKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
}
