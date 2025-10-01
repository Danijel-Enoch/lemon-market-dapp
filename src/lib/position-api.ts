/**
 * Position API utilities for frontend integration
 */

export interface CreatePositionRequest {
	tokenSymbol: string;
	isLong: boolean;
	margin: string; // in USDC
	leverage: number;
	userAddress: string;
	pairAddress?: string; // optional pair address for accurate pricing
}

export interface CreatePositionResponse {
	success: boolean;
	data?: {
		to: string;
		data: string;
		value: string;
		gasEstimate?: bigint;
	};
	error?: string;
}

/**
 * Call the position creation API
 */
export async function createPosition(
	params: CreatePositionRequest
): Promise<CreatePositionResponse> {
	const response = await fetch("/api/position/create", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify(params)
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	return response.json();
}

/**
 * Get API health check
 */
export async function getApiHealth() {
	const response = await fetch("/api/position/create", {
		method: "GET"
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	return response.json();
}

/**
 * Extract token symbol from trading pair string
 * e.g., "BTC/USDT" -> "BTC"
 */
export function extractTokenSymbol(pairString: string): string {
	return pairString.split("/")[0].toUpperCase();
}

/**
 * Format transaction hash for display
 */
export function formatTxHash(
	hash: string,
	startChars = 6,
	endChars = 4
): string {
	if (hash.length <= startChars + endChars) {
		return hash;
	}
	return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

/**
 * Get Etherscan URL for transaction
 */
export function getEtherscanUrl(
	hash: string,
	network: "mainnet" | "sepolia" = "mainnet"
): string {
	const baseUrl =
		network === "mainnet"
			? "https://etherscan.io"
			: "https://sepolia.etherscan.io";
	return `${baseUrl}/tx/${hash}`;
}

/**
 * Validate margin amount
 */
export function validateMargin(margin: string): {
	valid: boolean;
	error?: string;
} {
	const amount = parseFloat(margin);

	if (isNaN(amount)) {
		return { valid: false, error: "Invalid margin amount" };
	}

	if (amount <= 0) {
		return { valid: false, error: "Margin must be greater than 0" };
	}

	if (amount < 10) {
		return { valid: false, error: "Minimum margin is $10 USDC" };
	}

	if (amount > 100000) {
		return { valid: false, error: "Maximum margin is $100,000 USDC" };
	}

	return { valid: true };
}

/**
 * Validate leverage
 */
export function validateLeverage(leverage: number): {
	valid: boolean;
	error?: string;
} {
	if (leverage < 1) {
		return { valid: false, error: "Minimum leverage is 1x" };
	}

	if (leverage > 100) {
		return { valid: false, error: "Maximum leverage is 100x" };
	}

	return { valid: true };
}
