/**
 * Transaction utilities for handling blockchain transactions
 */

export interface TransactionStatus {
	hash?: string;
	status: "idle" | "pending" | "success" | "error";
	error?: string;
}

export interface NetworkConfig {
	name: string;
	explorerUrl: string;
	chainId: number;
}

export const SUPPORTED_NETWORKS: Record<number, NetworkConfig> = {
	1: {
		name: "Ethereum Mainnet",
		explorerUrl: "https://etherscan.io",
		chainId: 1,
	},
	11155111: {
		name: "Sepolia Testnet",
		explorerUrl: "https://sepolia.etherscan.io",
		chainId: 11155111,
	},
	31337: {
		name: "Hardhat Local",
		explorerUrl: "https://etherscan.io", // fallback to mainnet
		chainId: 31337,
	},
};

/**
 * Get explorer URL for a transaction hash
 */
export function getExplorerUrl(hash: string, chainId: number = 1): string {
	const network = SUPPORTED_NETWORKS[chainId] || SUPPORTED_NETWORKS[1];
	return `${network.explorerUrl}/tx/${hash}`;
}

/**
 * Get explorer URL for an address
 */
export function getAddressExplorerUrl(address: string, chainId: number = 1): string {
	const network = SUPPORTED_NETWORKS[chainId] || SUPPORTED_NETWORKS[1];
	return `${network.explorerUrl}/address/${address}`;
}

/**
 * Format transaction hash for display
 */
export function formatTxHash(hash: string, startChars: number = 6, endChars: number = 4): string {
	if (hash.length <= startChars + endChars) {
		return hash;
	}
	return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

/**
 * Parse error message from transaction error
 */
export function parseTransactionError(error: unknown): string {
	if (typeof error === "string") {
		return error;
	}

	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message: string }).message;

		// Common error patterns
		if (message.includes("User rejected")) {
			return "Transaction rejected by user";
		}

		if (message.includes("insufficient funds")) {
			return "Insufficient funds for transaction";
		}

		if (message.includes("gas")) {
			return "Gas estimation failed or insufficient gas";
		}

		if (message.includes("nonce")) {
			return "Transaction nonce error - please try again";
		}

		return message;
	}

	return "Transaction failed - please try again";
}
