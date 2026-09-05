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
import { APP_CHAIN, APP_CHAIN_RPC_URL } from "./chain";

/**
 * A shared WalletConnect id so the public app works out of the box.
 *
 * Override it per deployment with `VITE_WALLETCONNECT_PROJECT_ID`; the id only
 * scopes relay analytics, so a shared default is a convenience rather than a
 * shared secret.
 */
const FALLBACK_PROJECT_ID = "eea6d53be219bc80965a59a7d6f235b0";

/**
 * A wallet entry as RainbowKit's own group list accepts it.
 *
 * Derived from `connectorsForWallets` rather than named directly: RainbowKit
 * does not export the type, and the wallets are *factories* rather than wallet
 * objects — a distinction that only shows up as an error several frames deep
 * inside the connector list.
 */
type WalletFn = Parameters<typeof connectorsForWallets>[0][number]["wallets"][number];

export interface WalletConfigOptions {
	/** Shown in the wallet's connection prompt. */
	appName: string;
	/**
	 * Wallets to offer ahead of the defaults.
	 *
	 * The public app puts Farcaster first when it is running inside a mini-app
	 * frame; the admin console has no such context, so this stays empty there.
	 */
	extraWallets?: WalletFn[];
}

/**
 * One wagmi config, built the same way for both apps.
 *
 * `chains` is a single entry on purpose. Both apps trade on exactly one chain —
 * Base mainnet — and listing several would make wagmi's chain switching a
 * user-facing choice rather than the "you are on the wrong network, fix it"
 * prompt it should be.
 */
export function createWalletConfig({ appName, extraWallets = [] }: WalletConfigOptions) {
	const projectId =
		(import.meta.env as Record<string, string | undefined>).VITE_WALLETCONNECT_PROJECT_ID?.trim() ||
		FALLBACK_PROJECT_ID;

	const connectors = connectorsForWallets(
		[
			{
				groupName: "Popular",
				wallets: [
					...extraWallets,
					baseAccount,
					coinbaseWallet,
					metaMaskWallet,
					rainbowWallet,
					walletConnectWallet,
					braveWallet,
				],
			},
		],
		{ appName, projectId },
	);

	return createConfig({
		connectors,
		chains: [APP_CHAIN],
		ssr: true,
		transports: { [APP_CHAIN.id]: http(APP_CHAIN_RPC_URL) },
	});
}
