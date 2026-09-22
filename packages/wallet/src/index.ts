/**
 * The wallet layer, shared by the public app and the admin console.
 *
 * Separate from `@lemon/client` on purpose: that package is transport and
 * formatting with no components and no wallet, so the API and any server-side
 * caller can import it without dragging wagmi and a connector UI along. This is
 * the half that genuinely needs a browser.
 */
export {
	APP_CHAIN,
	APP_CHAIN_RPC_URL,
	buildChain,
	type ChainEnv,
	ENABLED_CHAINS,
	type EnabledChain,
	enabledChain,
	factoryFor,
	isEnabledChain,
	resolveEnabledChains,
} from "./chain";
export { createWalletConfig, type WalletConfigOptions } from "./config";
export { useAppChain, useAutoSwitchAppChain, WrongNetworkBanner } from "./network";
export { LemonRainbowKitProvider, lemonWalletTheme } from "./provider";
