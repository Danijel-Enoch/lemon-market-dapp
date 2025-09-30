import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrum, mainnet, polygon, sepolia } from "wagmi/chains";

const projectId =
	process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "your-project-id";

export const config = getDefaultConfig({
	appName: "Lemon Looper",
	projectId: projectId,
	chains: [mainnet, sepolia, arbitrum, polygon],
	ssr: true // If your dApp uses server side rendering (SSR)
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
