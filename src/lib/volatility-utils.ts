/**
 * Volatility Tier Utilities
 *
 * Utilities for handling volatility tiers in the synthetic contract
 */

export enum VolatilityTier {
	STABLE = 0,
	AVERAGE = 1,
	VOLATILE = 2,
	AGGRESSIVELY_VOLATILE = 3,
}

export const VOLATILITY_TIER_NAMES = {
	[VolatilityTier.STABLE]: "Stable",
	[VolatilityTier.AVERAGE]: "Average",
	[VolatilityTier.VOLATILE]: "Volatile",
	[VolatilityTier.AGGRESSIVELY_VOLATILE]: "Aggressively Volatile",
};

/**
 * Determines the volatility tier based on token symbol
 * This is a basic implementation - you may want to enhance this with
 * historical volatility data or other factors
 */
export function getVolatilityTierForToken(tokenSymbol: string): VolatilityTier {
	const symbol = tokenSymbol.toUpperCase();

	// Stable assets
	if (["USDT", "USDC", "DAI", "BUSD"].includes(symbol)) {
		return VolatilityTier.STABLE;
	}

	// Major cryptocurrencies - average volatility
	if (["BTC", "ETH", "BNB", "ADA", "SOL", "AVAX", "DOT"].includes(symbol)) {
		return VolatilityTier.AVERAGE;
	}

	// High volatility tokens
	if (["SHIB", "DOGE", "PEPE", "WIF", "BONK"].includes(symbol)) {
		return VolatilityTier.VOLATILE;
	}

	// Very high volatility / meme coins
	if (["FLOKI", "ELON", "BABYDOGE", "SAFEMOON"].includes(symbol)) {
		return VolatilityTier.AGGRESSIVELY_VOLATILE;
	}

	// Default to average for unknown tokens
	return VolatilityTier.AVERAGE;
}

/**
 * Gets the display name for a volatility tier
 */
export function getVolatilityTierName(tier: VolatilityTier): string {
	return VOLATILITY_TIER_NAMES[tier] || "Unknown";
}

/**
 * Generates a funding allocation array based on master fund amount
 * Each value after the first is divided by half until zero
 */
export function generateFundingAllocationArray(masterFundAmount: bigint): bigint[] {
	const allocations: bigint[] = [];
	let currentAmount = masterFundAmount;

	// Add the master fund amount as the first element
	allocations.push(currentAmount);

	// Keep dividing by 2 until we reach zero (or effectively zero for bigint)
	while (currentAmount > BigInt(0)) {
		currentAmount = currentAmount / BigInt(2);
		if (currentAmount > BigInt(0)) {
			allocations.push(currentAmount);
		}
	}

	// Add zero as a possible option
	allocations.push(BigInt(0));

	return allocations;
}

/**
 * Picks a random value from the funding allocation array
 */
export function pickRandomFundingAmount(allocations: bigint[]): bigint {
	if (allocations.length === 0) {
		return BigInt(0);
	}

	const randomIndex = Math.floor(Math.random() * allocations.length);
	return allocations[randomIndex];
}

/**
 * Calculates virtual funding based on market conditions and availability
 * This is a placeholder implementation - you should implement
 * your actual virtual funding calculation logic
 */
export function calculateVirtualFunding(
	tokenSymbol: string,
	positionSize: bigint,
	leverage: number,
): bigint {
	// This is a basic fallback implementation
	// In the API routes, this will be replaced with contract-based logic
	const baseFunding = BigInt(1000000); // 1 USDC in wei (6 decimals)
	const leverageMultiplier = BigInt(leverage);

	// Simple calculation: base funding * leverage / 10
	return (baseFunding * leverageMultiplier) / BigInt(10);
}

/**
 * Calculates virtual funding for a new market based on available liquidity
 * @param availableLiquidity - Total available liquidity from contract
 * @param marketExists - Whether the market already exists
 * @returns Virtual funding amount
 */
export function calculateVirtualFundingForMarket(
	availableLiquidity: bigint,
	marketExists: boolean,
): bigint {
	// If market already exists, virtual funding is zero
	// if (marketExists) {
	// 	return BigInt(0);
	// }

	// // If no available liquidity, virtual funding is zero
	// if (availableLiquidity <= BigInt(0)) {
	// 	return BigInt(0);
	// }

	// // Calculate 3% of available liquidity as master fund amount
	// const masterFundAmount = (availableLiquidity * BigInt(3)) / BigInt(100);

	// // Generate allocation array starting with masterFundAmount, each subsequent value divided by 2
	// const allocations = generateFundingAllocationArray(masterFundAmount);

	// // Pick a random value from the array (can be zero)
	// return pickRandomFundingAmount(allocations);
	return BigInt(0);
}

/**
 * Example function to demonstrate virtual funding allocation
 * This shows how the allocation array is generated and how random selection works
 */
export function demonstrateVirtualFundingAllocation(availableLiquidity: string): {
	masterFundAmount: string;
	allocationArray: string[];
	exampleSelections: string[];
} {
	const liquidity = BigInt(availableLiquidity);
	const masterFund = (liquidity * BigInt(3)) / BigInt(100);
	const allocations = generateFundingAllocationArray(masterFund);

	// Generate 5 example random selections
	const examples: string[] = [];
	for (let i = 0; i < 5; i++) {
		examples.push(pickRandomFundingAmount(allocations).toString());
	}

	return {
		masterFundAmount: masterFund.toString(),
		allocationArray: allocations.map((a) => a.toString()),
		exampleSelections: examples,
	};
}
