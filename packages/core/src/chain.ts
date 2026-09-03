/**
 * Base mainnet is the only chain this app trades on. Everything else reaches it
 * through Relay deposit addresses.
 */
export const BASE_CHAIN_ID = 8453 as const;
export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;

/** Circle-issued USDC on Base. The quote asset for spot, and what deposits bridge from. */
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const USDC_DECIMALS = 6 as const;

/** The address aggregators use to mean "native ETH" rather than an ERC-20. */
export const NATIVE_TOKEN_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function basescanTx(hash: string): string {
	return `https://basescan.org/tx/${hash}`;
}

export function basescanAddress(address: string): string {
	return `https://basescan.org/address/${address}`;
}
