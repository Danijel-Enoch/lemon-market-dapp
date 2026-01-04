import { betterFetch } from "@better-fetch/fetch";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://api.degenoptions.xyz";

export interface AddLiquidityRequest {
	marketId: string; // Required by API
	amount: string; // Amount in USDC
	userAddress: string;
	chainId?: number;
}

export interface AddLiquidityResponse {
	success: boolean;
	data?: {
		transactionData: {
			to: string;
			data: string;
			value: string;
			gasEstimate?: string;
		};
		oracleData?: {
			marketId: string;
			amount: string;
			nonce: string;
			deadline: string;
			signature: string;
		};
	};
	simulationResult?: {
		success: boolean;
		gasUsed: string;
		reverted: boolean;
	};
	timestamp?: string;
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
	onChainData: {
		createdTimestamp: string;
		durationFeeRate: string;
		longPositionCount: string;
		marketId: string;
		realLiquidity: string;
		sharedCollateralPool: string;
		shortPositionCount: string;
		totalLiquidity: string;
		totalLongMargin: string;
		totalShares: string;
		totalShortMargin: string;
		virtualLiquidity: string;
	};
	exposure: {
		totalExposure: number;
		totalLong: number;
		totalShort: number;
	};
}

export interface LiquidityPosition {
	marketId: string;
	lpTokensReceived: string;
	lpTokensRedeemed: string | null;
	lp: string;
	feesCollected: string | null;
	amountReceived: string | null;
	amountProvided: string;
	holdingDurationSeconds: string | null;
	entryTimestamp: string;
	entryLPTokenPrice: string;
	marketAddress: string;
	lpTokenDetails?: {
		marketId: string;
		lpToken: string;
		symbol: string;
		name: string;
		balance: string;
	};
	onChainData: {
		realLiquidity: string;
		virtualLiquidity: string;
		totalLiquidity: string;
		totalLongMargin: string;
		totalShortMargin: string;
		longPositionCount: string;
		shortPositionCount: string;
		sharedCollateralPool: string;
		totalShares: string;
		marketId: string;
	};
}

export interface GetLiquidityPositionsResponse {
	success: boolean;
	data: LiquidityPosition[];
	timestamp?: string;
	error?: string;
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

export interface RemoveLiquidityRequest {
	marketId: string;
	lpTokenAmount: string; // Amount of LP tokens to burn
	userAddress: string;
	chainId?: number;
}

export interface RemoveLiquidityResponse {
	success: boolean;
	data?: {
		transactionData: {
			to: string;
			data: string;
			value: string;
			gasEstimate?: string;
		};
		oracleData?: {
			marketId: string;
			lpTokenAmount: string;
			nonce: string;
			deadline: string;
			signature: string;
		};
	};
	simulationResult?: {
		success: boolean;
		gasUsed: string;
		reverted: boolean;
	};
	timestamp?: string;
	error?: string;
}

/**
 * Call the remove liquidity API to get transaction data
 */
export async function removeLiquidity(
	params: RemoveLiquidityRequest,
): Promise<RemoveLiquidityResponse> {
	console.log({ params });
	const { data } = await betterFetch(`${BASE_URL}/liquidity/remove`, {
		method: "POST",
		body: JSON.stringify(params),
		headers: { "Content-Type": "application/json" },
	});
	console.log({ data });
	return data as RemoveLiquidityResponse;
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

/**
 * Fetch user's liquidity positions
 */
export async function getLiquidityPositions(
	userAddress: string,
): Promise<GetLiquidityPositionsResponse> {
	const { data } = await betterFetch(`${BASE_URL}/liquidity/positions`, {
		method: "GET",
		query: {
			userAddress,
		},
	});
	return data as GetLiquidityPositionsResponse;
}
