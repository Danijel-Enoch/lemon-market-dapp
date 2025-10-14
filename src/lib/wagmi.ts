import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
	arbitrum,
	mainnet,
	polygon,
	sepolia,
	localhost,
	hardhat
} from "wagmi/chains";

const projectId =
	process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "your-project-id";

// Define chains based on environment
const isDevelopment = process.env.NODE_ENV === "development";

// Import Mini App connector (will be added to connectors automatically)
let farcasterMiniAppConnector: any;
try {
	const { farcasterMiniApp } = require("@farcaster/miniapp-wagmi-connector");
	farcasterMiniAppConnector = farcasterMiniApp;
} catch (e) {
	// Connector not available, continue without it
	console.log("Mini App connector not available");
}

export const config = getDefaultConfig({
	appName: "Lemon Markets",
	projectId: projectId,
	chains: [sepolia],
	ssr: true // If your dApp uses server side rendering (SSR)
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
