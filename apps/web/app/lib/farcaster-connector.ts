import sdk from "@farcaster/miniapp-sdk";
import type { Wallet } from "@rainbow-me/rainbowkit";
import { fromHex, getAddress, numberToHex, SwitchChainError } from "viem";
import { ChainNotConfiguredError, createConnector } from "wagmi";

export function farcasterMiniApp() {
	return createConnector((config) => ({
		id: "farcaster",
		name: "Farcaster",
		rdns: "xyz.farcaster.MiniAppWallet",
		icon: "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/055c25d6-7fe7-4a49-abf9-49772021cf00/original",
		type: "farcasterMiniApp",

		async connect({ chainId } = {}) {
			// biome-ignore lint/suspicious/noExplicitAny: provider type is loose
			const provider = (await this.getProvider()) as any;
			const accounts = await provider.request({
				method: "eth_requestAccounts",
			});

			let targetChainId = chainId;
			if (!targetChainId) {
				const state = (await config.storage?.getItem("state")) ?? {};

				const isChainSupported = config.chains.some((x) => x.id === state.chainId);
				if (isChainSupported) targetChainId = state.chainId;
				else targetChainId = config.chains[0]?.id;
			}
			if (!targetChainId) throw new Error("No chains found on connector.");

			const onAccountsChanged = (accounts: string[]) => {
				if (accounts.length === 0) {
					this.onDisconnect();
				} else {
					config.emitter.emit("change", {
						accounts: accounts.map((x: string) => getAddress(x)),
					});
				}
			};

			const onChainChanged = (chain: string) => {
				const chainId = Number(chain);

				config.emitter.emit("change", { chainId });
			};

			const onDisconnect = () => {
				config.emitter.emit("disconnect");
			};

			provider.on("accountsChanged", onAccountsChanged);
			provider.on("chainChanged", onChainChanged);
			provider.on("disconnect", onDisconnect);

			let currentChainId = await this.getChainId();
			if (targetChainId && currentChainId !== targetChainId) {
				const chain = await this.switchChain?.({ chainId: targetChainId });
				if (chain) {
					currentChainId = chain.id;
				}
			}

			return {
				accounts: accounts.map((x: string) => getAddress(x)),
				chainId: currentChainId,
			};
		},
		async disconnect() {
			// Cleanup if needed
		},
		async getAccounts() {
			// biome-ignore lint/suspicious/noExplicitAny: provider type is loose
			const provider = (await this.getProvider()) as any;
			const accounts = await provider.request({
				method: "eth_accounts",
			});
			return accounts.map((x: string) => getAddress(x));
		},
		async getChainId() {
			// biome-ignore lint/suspicious/noExplicitAny: provider type is loose
			const provider = (await this.getProvider()) as any;
			const hexChainId = await provider.request({ method: "eth_chainId" });
			return fromHex(hexChainId, "number");
		},
		async isAuthorized() {
			try {
				const accounts = await this.getAccounts();
				return !!accounts.length;
			} catch {
				return false;
			}
		},
		async switchChain({ chainId }) {
			// biome-ignore lint/suspicious/noExplicitAny: provider type is loose
			const provider = (await this.getProvider()) as any;
			const chain = config.chains.find((x) => x.id === chainId);
			if (!chain) {
				throw new SwitchChainError(new ChainNotConfiguredError());
			}

			await provider.request({
				method: "wallet_switchEthereumChain",
				params: [{ chainId: numberToHex(chainId) }],
			});

			config.emitter.emit("change", { chainId });

			return chain;
		},
		onAccountsChanged(accounts) {
			if (accounts.length === 0) config.emitter.emit("disconnect");
			else config.emitter.emit("change", { accounts: accounts.map((x: string) => getAddress(x)) });
		},
		onChainChanged(chain) {
			const chainId = Number(chain);

			config.emitter.emit("change", { chainId });
		},
		async onDisconnect() {
			config.emitter.emit("disconnect");
		},
		async getProvider() {
			// biome-ignore lint/suspicious/noExplicitAny: provider type is loose
			return sdk.wallet.ethProvider as any;
		},
	}));
}

// biome-ignore lint/suspicious/noExplicitAny: compatible with RainbowKit types
export const farcasterWallet = (_: any): Wallet => ({
	id: "farcaster-miniapp",
	name: "Farcaster",
	iconUrl:
		"https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/055c25d6-7fe7-4a49-abf9-49772021cf00/original",
	iconBackground: "#fff",
	createConnector: farcasterMiniApp,
});
