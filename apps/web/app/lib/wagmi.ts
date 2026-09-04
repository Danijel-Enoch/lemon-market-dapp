import { createWalletConfig } from "@lemon/wallet";
import { farcasterWallet } from "./farcaster-connector";

/**
 * One chain, chosen by configuration rather than pinned here.
 *
 * Every venue this app trades on lives on Base — the perps, the Coinbase
 * tokenized-stock pools, and KyberSwap routing — and funds from other chains
 * arrive through Relay deposit addresses rather than by switching networks. So
 * there is still deliberately no second chain offered to the user.
 *
 * What changed is that *which* Base this is comes from the environment, so the
 * same build runs against a local fork or a testnet. `@lemon/wallet` builds a
 * chain object complete enough for the wallet to add on demand, which is what
 * makes those deployments connectable without hand-adding a network.
 */
export const config = createWalletConfig({
	appName: "Lemon Markets",
	// Farcaster first, and only here: the mini-app frame is a context the admin
	// console never runs in.
	extraWallets: [farcasterWallet],
});

export { APP_CHAIN as CHAIN } from "@lemon/wallet";

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
