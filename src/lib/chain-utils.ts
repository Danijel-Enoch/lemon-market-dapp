/**
 * Chain Utilities
 *
 * Utilities for handling multi-chain support in the Lemon Markets application
 */

import { base, bsc, mainnet, sepolia } from "wagmi/chains";
import type { Chain } from "wagmi/chains";

export interface ChainInfo {
	id: number;
	name: string;
	shortName: string;
	symbol: string;
	icon: string;
	explorerUrl: string;
	rpcUrl?: string;
	isTestnet: boolean;
}

// Supported chains configuration
export const SUPPORTED_CHAIN_INFO: Record<number, ChainInfo> = {
	1: {
		id: 1,
		name: "Ethereum",
		shortName: "ETH",
		symbol: "ETH",
		icon: "https://cryptologos.cc/logos/ethereum-eth-logo.svg",
		explorerUrl: "https://etherscan.io",
		isTestnet: false
	},
	8453: {
		id: 8453,
		name: "Base",
		shortName: "BASE",
		symbol: "ETH",
		icon: "https://avatars.githubusercontent.com/u/108554348?s=280&v=4",
		explorerUrl: "https://basescan.org",
		isTestnet: false
	},
	56: {
		id: 56,
		name: "BNB Smart Chain",
		shortName: "BSC",
		symbol: "BNB",
		icon: "https://cryptologos.cc/logos/bnb-bnb-logo.svg",
		explorerUrl: "https://bscscan.com",
		isTestnet: false
	},
	11155111: {
		id: 11155111,
		name: "Sepolia Testnet",
		shortName: "SEP",
		symbol: "ETH",
		icon: "https://cryptologos.cc/logos/ethereum-eth-logo.svg",
		explorerUrl: "https://sepolia.etherscan.io",
		isTestnet: true
	}
};

// Map of wagmi chains to our chain info
export const WAGMI_CHAIN_MAP: Record<number, Chain> = {
	1: mainnet,
	8453: base,
	56: bsc,
	11155111: sepolia
};

/**
 * Get chain information by chain ID
 */
export function getChainInfo(chainId: number): ChainInfo | null {
	return SUPPORTED_CHAIN_INFO[chainId] || null;
}

/**
 * Get all supported chains
 */
export function getAllSupportedChains(): ChainInfo[] {
	return Object.values(SUPPORTED_CHAIN_INFO);
}

/**
 * Get production chains only (excluding testnets)
 */
export function getProductionChains(): ChainInfo[] {
	return Object.values(SUPPORTED_CHAIN_INFO).filter(
		(chain) => !chain.isTestnet
	);
}

/**
 * Get testnet chains only
 */
export function getTestnetChains(): ChainInfo[] {
	return Object.values(SUPPORTED_CHAIN_INFO).filter(
		(chain) => chain.isTestnet
	);
}

/**
 * Check if a chain ID is supported
 */
export function isSupportedChainId(chainId: number): boolean {
	return chainId in SUPPORTED_CHAIN_INFO;
}

/**
 * Get the wagmi chain config for a chain ID
 */
export function getWagmiChain(chainId: number): Chain | null {
	return WAGMI_CHAIN_MAP[chainId] || null;
}

/**
 * Format chain name for display
 */
export function formatChainName(chainId: number): string {
	const chainInfo = getChainInfo(chainId);
	return chainInfo ? chainInfo.name : `Unknown Chain (${chainId})`;
}

/**
 * Get explorer URL for a transaction
 */
export function getChainExplorerUrl(hash: string, chainId: number): string {
	const chainInfo = getChainInfo(chainId);
	const explorerUrl = chainInfo?.explorerUrl || "https://etherscan.io";
	return `${explorerUrl}/tx/${hash}`;
}

/**
 * Get explorer URL for an address
 */
export function getChainAddressExplorerUrl(
	address: string,
	chainId: number
): string {
	const chainInfo = getChainInfo(chainId);
	const explorerUrl = chainInfo?.explorerUrl || "https://etherscan.io";
	return `${explorerUrl}/address/${address}`;
}

/**
 * Get the default chain ID based on environment
 */
export function getDefaultChainId(): number {
	const isDevelopment = process.env.NODE_ENV === "development";
	return isDevelopment ? 11155111 : 8453; // Sepolia for dev, Base for prod
}

/**
 * Check if current environment supports a chain
 */
export function isChainSupportedInEnvironment(chainId: number): boolean {
	const isDevelopment = process.env.NODE_ENV === "development";
	const chainInfo = getChainInfo(chainId);

	if (!chainInfo) return false;

	// In development, allow all chains
	if (isDevelopment) return true;

	// In production, only allow production chains
	return !chainInfo.isTestnet;
}
