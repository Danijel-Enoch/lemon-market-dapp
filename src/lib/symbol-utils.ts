/**
 * Symbol Utilities
 *
 * Utility functions for handling token symbols and market symbols with contract addresses.
 * Supports multiple formats:
 * - Legacy format: "ETH", "BTC"
 * - Market format: "ETH+0x123..."
 * - PERP format: "ENB_PERP_0x123..."
 */

/**
 * Create a market symbol combining token symbol and contract address
 * @param symbol - The token symbol (e.g., "ETH", "BTC")
 * @param contractAddress - The full contract address
 * @returns Market symbol in format "SYMBOL+0x1234567890abcdef..." (using full address)
 */
export function createMarketSymbol(
	symbol: string,
	contractAddress: string
): string {
	// Use full contract address for complete uniqueness
	return `${symbol.toUpperCase()}+${contractAddress}`;
}

/**
 * Extract the display symbol from a market symbol
 * @param marketSymbol - The market symbol (could be "ETH", "ETH+123456", or "ENB_PERP_0x123...")
 * @returns The display symbol (e.g., "ETH", "ENB")
 */
export function extractDisplaySymbol(marketSymbol: string): string {
	return extractBaseTokenSymbol(marketSymbol);
}

/**
 * Check if a symbol is in the new market format (includes contract address)
 * @param symbol - The symbol to check
 * @returns True if it includes contract address in any supported format
 */
export function isMarketSymbol(symbol: string): boolean {
	return hasEmbeddedAddress(symbol);
}

/**
 * Extract the contract address from a market symbol
 * @param marketSymbol - The market symbol in any supported format
 * @returns The full contract address or null if not in market format
 */
export function extractAddressSuffix(marketSymbol: string): string | null {
	return extractTokenAddress(marketSymbol);
}

/**
 * Format a token symbol for display in UI
 * @param tokenSymbol - The token symbol (legacy or market format)
 * @returns Formatted symbol for display
 */
export function formatTokenSymbolForDisplay(tokenSymbol: string): string {
	const displaySymbol = extractDisplaySymbol(tokenSymbol);

	// Add shortened address if it's a market symbol with CA
	if (isMarketSymbol(tokenSymbol)) {
		const fullAddress = extractAddressSuffix(tokenSymbol);
		if (fullAddress && fullAddress.length >= 10) {
			// Show first 6 and last 4 characters of address for UI display
			const shortAddress = `${fullAddress.slice(
				0,
				6
			)}...${fullAddress.slice(-4)}`;
			return `${displaySymbol} (${shortAddress})`;
		}
	}

	return displaySymbol;
}

/**
 * Get tooltip text for a token symbol
 * @param tokenSymbol - The token symbol
 * @returns Tooltip text explaining the symbol format
 */
export function getTokenSymbolTooltip(tokenSymbol: string): string {
	if (isMarketSymbol(tokenSymbol)) {
		const displaySymbol = extractDisplaySymbol(tokenSymbol);
		const fullAddress = extractAddressSuffix(tokenSymbol);
		return `${displaySymbol} token with contract address: ${fullAddress}`;
	}

	return `${tokenSymbol} token`;
}

/**
 * Extract token address from various symbol formats
 * @param tokenSymbol - The token symbol in any supported format
 * @returns The contract address or null if not found
 */
export function extractTokenAddress(tokenSymbol: string): string | null {
	// Check for PERP format: "ENB_PERP_0x123..."
	const perpMatch = tokenSymbol.match(/^(.+)_PERP_(0x[a-fA-F0-9]{40})$/i);
	if (perpMatch) {
		return perpMatch[2]; // Return the 0x address
	}

	// Check for market format: "ETH+0x123..."
	const plusIndex = tokenSymbol.indexOf("+");
	if (plusIndex !== -1) {
		const addressPart = tokenSymbol.substring(plusIndex + 1);
		if (addressPart.startsWith("0x") && addressPart.length === 42) {
			return addressPart;
		}
	}

	return null;
}

/**
 * Extract the base token symbol from various formats
 * @param tokenSymbol - The token symbol in any supported format
 * @returns The base symbol (e.g., "ENB", "ETH")
 */
export function extractBaseTokenSymbol(tokenSymbol: string): string {
	// Check for PERP format: "ENB_PERP_0x123..." -> "ENB"
	const perpMatch = tokenSymbol.match(/^(.+)_PERP_(0x[a-fA-F0-9]{40})$/i);
	if (perpMatch) {
		return perpMatch[1].toUpperCase();
	}

	// Check for market format: "ETH+0x123..." -> "ETH"
	const plusIndex = tokenSymbol.indexOf("+");
	if (plusIndex !== -1) {
		return tokenSymbol.substring(0, plusIndex).toUpperCase();
	}

	// Legacy format - return as is
	return tokenSymbol.toUpperCase();
}

/**
 * Check if a token symbol has an embedded contract address
 * @param tokenSymbol - The token symbol to check
 * @returns True if it contains a contract address
 */
export function hasEmbeddedAddress(tokenSymbol: string): boolean {
	return extractTokenAddress(tokenSymbol) !== null;
}
