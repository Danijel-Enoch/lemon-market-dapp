import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
	baseAccount,
	braveWallet,
	coinbaseWallet,
	metaMaskWallet,
	rainbowWallet,
	walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { farcasterWallet } from "./farcaster-connector";

const projectId =
	import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "eea6d53be219bc80965a59a7d6f235b0";

const connectors = connectorsForWallets(
	[
		{
			groupName: "Popular",
			wallets: [
				farcasterWallet,
				baseAccount,
				coinbaseWallet,
				metaMaskWallet,
				rainbowWallet,
				walletConnectWallet,
				braveWallet,
			],
		},
	],
	{ appName: "Lemon Markets", projectId },
);

/**
 * Base mainnet only.
 *
 * Every venue this app trades on lives here — Avantis perps, the Coinbase
 * tokenized-stock pools, and KyberSwap routing. Funds from other chains arrive
 * through Relay deposit addresses rather than by switching networks, so there
 * is deliberately no second chain configured.
 */
export const config = createConfig({
	connectors,
	chains: [base],
	ssr: true,
	transports: {
		[base.id]: http(import.meta.env.VITE_BASE_RPC_URL || undefined),
	},
});

export const CHAIN = base;

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
