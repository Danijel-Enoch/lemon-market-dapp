import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
	metaMaskWallet,
	trustWallet,
	walletConnectWallet,
	braveWallet,
	baseAccount,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";

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
