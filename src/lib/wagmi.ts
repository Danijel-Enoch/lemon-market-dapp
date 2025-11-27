import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
	baseAccount,
	braveWallet,
	metaMaskWallet,
	trustWallet,
	walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "your-project-id";

// Define chains based on environment
const _isDevelopment = import.meta.env.MODE === "development";

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
			wallets: [metaMaskWallet, braveWallet, walletConnectWallet, baseAccount, trustWallet],
		},
	],
	{
		appName: "Lemon Markets",
		projectId,
	},
);

export const config = createConfig({
	connectors,
	chains: [base],
	ssr: true,
	transports: {
		[base.id]: http(),
	},
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
