/**
 * Utility functions for virtual markets and token address mapping
 */

/**
 * Normalize address to lowercase for consistent matching
 */
export function normalizeAddress(address: string): string {
	return address.toLowerCase();
}

/**
 * Check if a string is a valid Ethereum address
 */
export function isValidAddress(address: string): boolean {
	return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Extract token address from various sources
 * This function handles different ways token addresses might be stored
 */
export function extractTokenAddress(item: any): string | null {
	// Try different possible fields where token address might be stored
	const possibleFields = [
		"tokenAddress",
		"baseToken.address",
		"baseToken?.address",
		"pairAddress",
		"address",
		"contractAddress",
	];

	for (const field of possibleFields) {
		const value = getNestedProperty(item, field);
		if (value && isValidAddress(value)) {
			return normalizeAddress(value);
		}
	}

	return null;
}

/**
 * Extract token symbol from DexScreener data
 */
export function extractTokenSymbol(item: any): string | null {
	// Try different possible fields where token symbol might be stored
	const possibleFields = ["baseToken.symbol", "baseToken?.symbol", "symbol", "tokenSymbol"];

	for (const field of possibleFields) {
		const value = getNestedProperty(item, field);
		if (value && typeof value === "string") {
			return value.toUpperCase();
		}
	}

	return null;
}

/**
 * Get nested property from object using dot notation
 */
function getNestedProperty(obj: any, path: string): any {
	return path.split(".").reduce((current, key) => {
		return current?.[key];
	}, obj);
}

/**
 * Format liquidity amount for display
 */
export function formatLiquidity(liquidity: string | number): string {
	const value = typeof liquidity === "string" ? parseFloat(liquidity) : liquidity;

	if (isNaN(value) || value === 0) return "$0.00";

	if (value >= 1000000000) {
		return `$${(value / 1000000000).toFixed(2)}B`;
	} else if (value >= 1000000) {
		return `$${(value / 1000000).toFixed(2)}M`;
	} else if (value >= 1000) {
		return `$${(value / 1000).toFixed(2)}K`;
	}

	return `$${value.toFixed(2)}`;
}

/**
 * Create a mapping strategy for token addresses to market IDs
 * This can be customized based on how your subgraph stores the relationship
 */
export interface AddressMappingStrategy {
	// Direct mapping - marketId is the token address
	direct: (tokenAddress: string) => string;
	// Prefixed mapping - marketId has a prefix
	prefixed: (tokenAddress: string, prefix: string) => string;
	// Custom mapping function
	custom: (tokenAddress: string) => string;
}

export const addressMappingStrategies: AddressMappingStrategy = {
	direct: (tokenAddress: string) => normalizeAddress(tokenAddress),
	prefixed: (tokenAddress: string, prefix: string) => `${prefix}${normalizeAddress(tokenAddress)}`,
	custom: (tokenAddress: string) => {
		// Implement custom logic here if needed
		// For example, if marketId is derived from token address in a specific way
		return normalizeAddress(tokenAddress);
	},
};

/**
 * Parse liquidity value from string format
 * Handles various formats like "$1.23M", "1230000", etc.
 */
export function parseLiquidityValue(liquidity: string): number {
	if (!liquidity) return 0;

	// Remove currency symbols and spaces
	let cleaned = liquidity.replace(/[$,\s]/g, "");

	// Handle M, K, B suffixes
	const multipliers: { [key: string]: number } = {
		B: 1000000000,
		M: 1000000,
		K: 1000,
	};

	const lastChar = cleaned.slice(-1).toUpperCase();
	if (multipliers[lastChar]) {
		const value = parseFloat(cleaned.slice(0, -1));
		return value * multipliers[lastChar];
	}

	return parseFloat(cleaned) || 0;
}

/**
 * Parse liquidity value with 6 decimal precision
 * Handles both string and number inputs
 */
export function parseLiquidityWith6Decimals(liquidity: string | number): number {
	const value = typeof liquidity === "string" ? parseFloat(liquidity) : liquidity;
	return isNaN(value) ? 0 : value / 1e6;
}

/**
 * Validate virtual market data structure
 */
export function validateVirtualMarket(market: any): boolean {
	const requiredFields = ["id", "marketId", "totalLiquidity", "realLiquidity", "virtualLiquidity"];

	return requiredFields.every(
		(field) => market.hasOwnProperty(field) && market[field] !== undefined,
	);
}

/**
 * Get market summary statistics
 */
export interface MarketStats {
	totalMarkets: number;
	totalLiquidity: number;
	totalOpenInterest: number;
	averageLiquidity: number;
	marketsWithLiquidity: number;
}

export function calculateMarketStats(markets: any[]): MarketStats {
	const validMarkets = markets.filter(validateVirtualMarket);

	const totalLiquidity = validMarkets.reduce(
		(sum, market) => sum + parseLiquidityWith6Decimals(market.totalLiquidity || "0"),
		0,
	);

	const totalOpenInterest = validMarkets.reduce(
		(sum, market) => sum + parseLiquidityWith6Decimals(market.realLiquidity || "0"),
		0,
	);

	const marketsWithLiquidity = validMarkets.filter(
		(market) => parseLiquidityWith6Decimals(market.totalLiquidity || "0") > 0,
	).length;

	return {
		totalMarkets: validMarkets.length,
		totalLiquidity,
		totalOpenInterest,
		averageLiquidity: validMarkets.length > 0 ? totalLiquidity / validMarkets.length : 0,
		marketsWithLiquidity,
	};
}

/**
 * Debug helper to log market lookup results
 */
export function debugMarketLookup(tokenAddresses: string[], marketMap: Map<string, any>): void {
	console.log("🔍 Market Lookup Debug:");
	console.log(`Total token addresses: ${tokenAddresses.length}`);
	console.log(`Markets found: ${marketMap.size}`);

	tokenAddresses.forEach((address) => {
		const normalizedAddress = normalizeAddress(address);
		const market = marketMap.get(normalizedAddress);
		console.log(`${address}: ${market ? "✓ Found" : "✗ Not found"}`);
	});

	if (marketMap.size > 0) {
		console.log("Sample market data:");
		const firstMarket = Array.from(marketMap.values())[0];
		console.log(JSON.stringify(firstMarket, null, 2));
	}
}

/**
 * Debug helper to log market lookup results for symbols
 */
export function debugSymbolMarketLookup(tokenSymbols: string[], marketMap: Map<string, any>): void {
	console.log("🔍 Symbol Market Lookup Debug:");
	console.log(`Total token symbols: ${tokenSymbols.length}`);
	console.log(`Markets found: ${marketMap.size}`);

	tokenSymbols.forEach((symbol) => {
		const normalizedSymbol = normalizeSymbol(symbol);
		const market = marketMap.get(normalizedSymbol);
		console.log(`${symbol}: ${market ? "✓ Found" : "✗ Not found"}`);
	});

	if (marketMap.size > 0) {
		console.log("Sample market data:");
		const firstMarket = Array.from(marketMap.values())[0];
		console.log(JSON.stringify(firstMarket, null, 2));
	}
}

/**
 * Normalize token symbol to uppercase for consistent matching
 */
export function normalizeSymbol(symbol: string): string {
	return symbol.toUpperCase();
}
