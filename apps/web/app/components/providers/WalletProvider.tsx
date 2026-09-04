import { config } from "@app/lib/wagmi";
import { LemonRainbowKitProvider } from "@lemon/wallet";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: React.ReactNode }) {
	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				<LemonRainbowKitProvider>{children}</LemonRainbowKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
}
