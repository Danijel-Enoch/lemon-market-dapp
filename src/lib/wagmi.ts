import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
	metaMaskWallet,
	walletConnectWallet,
	coinbaseWallet,
	trustWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "your-project-id";

// Define chains based on environment
const _isDevelopment = process.env.NODE_ENV === "development";

// Import Mini App connector (will be added to connectors automatically)
let _farcasterMiniAppConnector: unknown;
try {
	const { farcasterMiniApp } = require("@farcaster/miniapp-wagmi-connector");
	_farcasterMiniAppConnector = farcasterMiniApp;
} catch (_e) {}

const connectors = connectorsForWallets(
	[
		{
			groupName: "Popular",
			wallets: [metaMaskWallet, walletConnectWallet, coinbaseWallet, trustWallet],
		},
	],
	{
		appName: "Lemon Markets",
		projectId,
	},
);

export const config = createConfig({
	connectors,
	chains: [sepolia],
	ssr: true,
	transports: {
		[sepolia.id]: http(),
	},
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
