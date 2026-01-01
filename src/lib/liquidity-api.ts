import { betterFetch } from "@better-fetch/fetch";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://api.degenoptions.com";

export interface AddLiquidityRequest {
	marketId: string; // Required by API
	amount: string; // Amount in USDC
	userAddress: string;
	chainId?: number;
}

export interface AddLiquidityResponse {
	success: boolean;
	data?: {
		to: string;
		data: string;
		value: string;
		gasEstimate?: bigint;
	};
	error?: string;
}

export interface Market {
	marketId: string; // e.g., "BTC-0x...-base"
	symbol: string;
	name?: string;
	liquidityUsd?: number;
	priceUsd?: number;
	change24h?: number;
	volume24h?: number;
	// Add other fields as per /markets response if needed
}

export interface GetMarketsResponse {
	success: boolean;
	data: Market[];
	error?: string;
}

/**
 * Call the add liquidity API to get transaction data
 */
export async function addLiquidity(params: AddLiquidityRequest): Promise<AddLiquidityResponse> {
	const { data } = await betterFetch(`${BASE_URL}/liquidity/add`, {
		method: "POST",
		body: JSON.stringify(params),
		headers: { "Content-Type": "application/json" },
	});
	return data as AddLiquidityResponse;
}

/**
 * Fetch all markets (used for liquidity pools list)
 */
export async function getMarkets(): Promise<GetMarketsResponse> {
	const { data } = await betterFetch(`${BASE_URL}/markets`, {
		method: "GET",
	});
	return data as GetMarketsResponse;
}
