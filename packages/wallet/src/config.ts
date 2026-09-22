import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
	baseAccount,
	braveWallet,
	coinbaseWallet,
	metaMaskWallet,
	rainbowWallet,
	walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import type { Chain } from "viem";
import { createConfig, http } from "wagmi";
import { ENABLED_CHAINS } from "./chain";

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
 * `chains` used to be a single entry, on the argument that listing several would
 * turn chain switching into a user-facing choice rather than the "you are on the
 * wrong network, fix it" prompt it should be. That argument survives the move to
 * several chains, because the list here is not a menu — it is the set of chains
 * this deployment has a factory on, and the prompt is still "switch to the chain
 * *this vault* lives on" rather than "pick one".
 *
 * What the list buys is `wallet_addEthereumChain` for the chains a user's wallet
 * has never seen. X Layer in particular is absent from most wallets' defaults,
 * and wagmi can only offer to add a chain it was configured with.
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

	// `chains` is typed as a non-empty tuple, which `ENABLED_CHAINS.map` cannot
	// prove. The array is non-empty by construction — see the fallback in
	// `chain.ts` — so the assertion states what that guarantee already is.
	const chains = ENABLED_CHAINS.map((entry) => entry.chain) as [Chain, ...Chain[]];

	return createConfig({
		connectors,
		chains,
		ssr: true,
		transports: Object.fromEntries(
			ENABLED_CHAINS.map((entry) => [entry.chain.id, http(entry.rpcUrl)]),
		),
	});
}
