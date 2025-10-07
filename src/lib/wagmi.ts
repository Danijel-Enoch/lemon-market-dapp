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

export const config = getDefaultConfig({
	appName: "Lemon Markets",
	projectId: projectId,
	chains: isDevelopment
		? [hardhat, localhost, sepolia, mainnet, polygon]
		: [sepolia],
	ssr: true // If your dApp uses server side rendering (SSR)
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
