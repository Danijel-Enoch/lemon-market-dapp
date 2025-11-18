import { getDefaultConfig } from "@rainbow-me/rainbowkit";
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

export const config = getDefaultConfig({
	appName: "Lemon Markets",
	projectId: projectId,
	chains: [sepolia],
	ssr: true, // If your dApp uses server side rendering (SSR)
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
