/**
 * Position API utilities for frontend integration
 */

import { betterFetch } from "@better-fetch/fetch";
import { getTokenPriceService } from "./token-price-service";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://api.degenoptions.xyz";

export interface CreatePositionRequest {
	tokenSymbol: string;
	isLong: boolean;
	margin: string; // margin amount in token units (e.g., "100.0") - see marginTokenAddress
	leverage: number;
	tokenAddress: string;
	marginTokenAddress?: string; // Optional (where margin comes from), default USDC on backend
	userAddress: string;
	pairAddress?: string; // optional pair address for accurate pricing
}

export interface LimitOrder {
	id: string;
	transactionHash: string;
	trader: string;
	tokenSymbol: string;
	timestamp: string;
	takeProfitPrice: string;
	stopLossPrice: string;
	positionId: string;
	margin: string;
	limitPrice: string;
	leverage: string;
	isLong: boolean;
	blockTimestamp: string;
	blockNumber: string;
}

export interface GetLimitOrdersResponse {
	success: boolean;
	data?: {
		limitOrders: LimitOrder[];
		count: number;
		metadata: {
			fetchedAt: string;
			source: string;
			limit: number;
			offset: number;
		};
	};
	error?: string;
}

export interface ModifyLimitOrderRequest {
	positionId: number;
	marketId: string;
	newLimitPrice: string;
	newTpPrice?: string;
	newSlPrice?: string;
	userAddress: string;
}

export interface CancelLimitOrderRequest {
	positionId: number;
	userAddress: string;
}

export type UpdatePositionAction = "MODIFY_POSITION" | "UPDATE_LEVERAGE" | "UPDATE_TPSL";

export interface UpdatePositionRequest {
	action: UpdatePositionAction;
	positionId: number;
	marketId: string;
	userAddress: string;
	newMargin?: string;
	newLeverage?: number;
	newTpPrice?: string;
	newSlPrice?: string;
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
	params: CreatePositionRequest,
): Promise<CreatePositionResponse> {
	const { data } = await betterFetch(`${BASE_URL}/positions/open`, {
		method: "POST",
		body: JSON.stringify(params),
		headers: { "Content-Type": "application/json" },
	});
	return data as CreatePositionResponse;
}

/**
 * Get API health check
 */
export async function getApiHealth() {
	const { data } = await betterFetch(`${BASE_URL}/health`, {
		method: "GET",
	});
	return data;
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
export function formatTxHash(hash: string, startChars = 6, endChars = 4): string {
	if (hash.length <= startChars + endChars) {
		return hash;
	}
	return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

/**
 * Get Etherscan URL for transaction
 */
export function getEtherscanUrl(hash: string, network: "mainnet" | "sepolia" = "mainnet"): string {
	const baseUrl = network === "mainnet" ? "https://basescan.org" : "https://sepolia.basescan.org";
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

	if (Number.isNaN(amount)) {
		return { valid: false, error: "Invalid margin amount" };
	}

	if (amount <= 0) {
		return { valid: false, error: "Margin must be greater than 0" };
	}

	if (amount < 10) {
		return { valid: false, error: "Minimum margin is $10" };
	}

	if (amount > 100000) {
		return { valid: false, error: "Maximum margin is $100,000" };
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

export interface Position {
	id: string;
	positionId: string;
	pair: string;
	side: "Long" | "Short";
	tokenSymbol: string;
	isLong: boolean;
	entryPrice: string;
	exitPrice?: string | null;
	margin: string;
	leverage: string;
	leverageValue: number;
	liquidationPrice: string;
	status: string;
	pnl: string;
	pnlRaw: string | null;
	pnlPercentage?: string;
	openedAt: string;
	closedAt?: string | null;
	lastUpdatedAt: string;
	lastTransactionHash: string;
	trader: string;
	tokenaddress: string;
	takeProfitPrice?: string;
	stopLossPrice?: string;
	limitPrice?: string;
	marketId?: string;
	realtimeData: {
		realtimePnl: string;
		currentPrice: string;
		pnlPercentage: string;
		priceChange: string;
		priceChangePercentage: string;
		formatted: {
			realtimePnl: string;
			currentPrice: string;
			priceChange: string;
		};
	};
}

export interface EnhancedPosition extends Position {
	currentPrice?: string;
	unrealizedPnL?: number;
	unrealizedPnLPercentage?: number;
	tokenAmount?: number;
	currentValue?: number;
	priceSource?: "lemon-oracle" | "dexscreener" | "coingecko";
	priceConfidence?: "high" | "medium" | "low";
}

export interface GetPositionsResponse {
	success: boolean;
	positions: Position[];
	count: number;
	error?: string;
	details?: unknown;
}

export interface GetEnhancedPositionsResponse {
	success: boolean;
	positions: EnhancedPosition[];
	count: number;
	error?: string;
	details?: unknown;
	totalPortfolioValue?: number;
	totalUnrealizedPnL?: number;
}

/**
 * Fetch user positions from the API
 */
export async function getUserPositions(traderAddress: string): Promise<GetPositionsResponse> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/positions/query`, {
			method: "POST",
			body: JSON.stringify({ trader: traderAddress }),
			headers: { "Content-Type": "application/json" },
		});
		return {
			success: true,
			positions: data as Position[],
			count: (data as Position[]).length,
		};
	} catch (error) {
		return {
			success: false,
			positions: [],
			count: 0,
			error: error instanceof Error ? error.message : "Failed to fetch positions",
		};
	}
}

/**
 * Calculate PnL percentage
 */
export function calculatePnlPercentage(pnlRaw: string | null, margin: string): string {
	try {
		if (!pnlRaw || pnlRaw === "null") return "0.00%";

		const pnl = parseFloat(pnlRaw) / 1e6; // Assuming USDC with 6 decimals
		const marginAmount = parseFloat(margin.replace(/[$,]/g, ""));

		if (marginAmount === 0 || Number.isNaN(pnl) || !Number.isFinite(pnl)) return "0.00%";

		const percentage = (pnl / marginAmount) * 100;
		const sign = percentage >= 0 ? "+" : "";

		return `${sign}${percentage.toFixed(2)}%`;
	} catch {
		return "0.00%";
	}
}

/**
 * Determine if position is profitable
 */
export function isPositionProfitable(pnlRaw: string | null): boolean {
	try {
		if (!pnlRaw || pnlRaw === "null") return false;
		// Strip currency symbols and commas
		const cleanedPnl = pnlRaw.replace(/[$,]/g, "");
		const pnl = parseFloat(cleanedPnl);
		return !Number.isNaN(pnl) && Number.isFinite(pnl) && pnl > 0;
	} catch {
		return false;
	}
}

/**
 * Format position size for display - shows token amount and current worth
 */
export function formatPositionSize(
	margin: string,
	leverage: string,
	entryPrice: string,
	tokenSymbol: string,
	currentPrice?: string,
): string {
	try {
		const marginAmount = parseFloat(margin.replace(/[$,]/g, ""));
		const leverageValue = parseFloat(leverage.replace(/x/g, ""));
		const entryPriceValue = parseFloat(entryPrice.replace(/[$,]/g, ""));

		if (
			entryPriceValue === 0 ||
			Number.isNaN(entryPriceValue) ||
			Number.isNaN(marginAmount) ||
			Number.isNaN(leverageValue)
		) {
			return `0 ${tokenSymbol}`;
		}

		// Calculate the actual token amount based on total exposure / entry price
		const totalExposure = marginAmount * leverageValue;
		const tokenAmount = totalExposure / entryPriceValue;

		// If current price is provided, show current worth
		if (currentPrice) {
			const currentPriceValue = parseFloat(currentPrice.replace(/[$,]/g, ""));
			if (currentPriceValue > 0 && !Number.isNaN(currentPriceValue)) {
				const currentWorth = tokenAmount * currentPriceValue;
				return `${tokenAmount.toFixed(6)} ${tokenSymbol} ($${currentWorth.toFixed(2)})`;
			}
		}

		// Fallback to just token amount if no current price
		return `${tokenAmount.toFixed(6)} ${tokenSymbol.split("-")[0]}`;
	} catch {
		return `0 ${tokenSymbol}`;
	}
}

/**
 * Calculate current position value with current market price
 */
export function calculatePositionCurrentValue(
	margin: string,
	leverage: string,
	entryPrice: string,
	currentPrice: string,
	isLong: boolean,
): {
	tokenAmount: number;
	currentWorth: number;
	unrealizedPnl: number;
	unrealizedPnlPercentage: string;
} {
	try {
		const marginAmount = parseFloat(margin.replace(/[$,]/g, ""));
		const leverageValue = parseFloat(leverage.replace(/x/g, ""));
		const entryPriceValue = parseFloat(entryPrice.replace(/[$,]/g, ""));
		const currentPriceValue = parseFloat(currentPrice.replace(/[$,]/g, ""));

		if (entryPriceValue === 0 || currentPriceValue === 0) {
			return {
				tokenAmount: 0,
				currentWorth: 0,
				unrealizedPnl: 0,
				unrealizedPnlPercentage: "0.00%",
			};
		}

		// Calculate token amount based on total exposure / entry price
		const totalExposure = marginAmount * leverageValue;
		const tokenAmount = totalExposure / entryPriceValue;

		// Current worth of the position
		const currentWorth = tokenAmount * currentPriceValue;

		// Calculate unrealized PnL
		const priceChange = currentPriceValue - entryPriceValue;
		const pnlMultiplier = isLong ? 1 : -1; // Short positions profit when price goes down
		const unrealizedPnl = (priceChange / entryPriceValue) * totalExposure * pnlMultiplier;

		// PnL percentage based on margin
		const unrealizedPnlPercentage =
			marginAmount > 0
				? `${unrealizedPnl >= 0 ? "+" : ""}${((unrealizedPnl / marginAmount) * 100).toFixed(2)}%`
				: "0.00%";

		return {
			tokenAmount,
			currentWorth,
			unrealizedPnl,
			unrealizedPnlPercentage,
		};
	} catch {
		return {
			tokenAmount: 0,
			currentWorth: 0,
			unrealizedPnl: 0,
			unrealizedPnlPercentage: "0.00%",
		};
	}
}

export interface ClosePositionRequest {
	positionId: string;
	tokenSymbol: string;
	tokenAddress: string;
	userAddress: string;
	pairAddress?: string; // optional pair address for accurate pricing
}

export interface ClosePositionResponse {
	success: boolean;
	data?: {
		to: string;
		data: string;
		value: string;
		gasEstimate?: bigint;
	};
	error?: string;
}

export interface ModifyPositionRequest {
	positionId: string;
	tokenSymbol: string;
	newMargin: string; // in USDC
	newLeverage: number;
	userAddress: string;
	pairAddress?: string; // optional pair address for accurate pricing
}

export interface ModifyPositionResponse {
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
 * Call the position close API
 */
export async function closePosition(params: ClosePositionRequest): Promise<ClosePositionResponse> {
	const { data } = await betterFetch(`${BASE_URL}/positions/close`, {
		method: "POST",
		body: JSON.stringify(params),
		headers: { "Content-Type": "application/json" },
	});
	return data as ClosePositionResponse;
}

/**
 * Call the position modify API
 */
export async function modifyPosition(
	params: ModifyPositionRequest,
): Promise<ModifyPositionResponse> {
	const { data } = await betterFetch(`${BASE_URL}/positions/modify`, {
		method: "POST",
		body: JSON.stringify(params),
		headers: { "Content-Type": "application/json" },
	});
	return data as ModifyPositionResponse;
}

/**
 * Call the position update API
 */
export async function updatePosition(
	params: UpdatePositionRequest,
): Promise<ModifyPositionResponse> {
	const { data } = await betterFetch(`${BASE_URL}/positions/update`, {
		method: "POST",
		body: JSON.stringify(params),
		headers: { "Content-Type": "application/json" },
	});
	return data as ModifyPositionResponse;
}

/**
 * Fetch limit orders for a trader
 */
export async function getLimitOrders(
	trader: string,
	limit = 10,
	offset = 0,
): Promise<GetLimitOrdersResponse> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/positions/limit-orders`, {
			method: "POST",
			body: JSON.stringify({ trader, limit, offset }),
			headers: { "Content-Type": "application/json" },
		});
		return data as GetLimitOrdersResponse;
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to fetch limit orders",
		};
	}
}

/**
 * Call the modify limit order API
 */
export async function modifyLimitOrder(
	params: ModifyLimitOrderRequest,
): Promise<ModifyPositionResponse> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/positions/modify-limit-order`, {
			method: "POST",
			body: JSON.stringify(params),
			headers: { "Content-Type": "application/json" },
		});
		return data as ModifyPositionResponse;
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to modify limit order",
		};
	}
}

/**
 * Call the cancel limit order API
 */
export async function cancelLimitOrder(
	params: CancelLimitOrderRequest,
): Promise<ModifyPositionResponse> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/positions/cancel-limit-order`, {
			method: "POST",
			body: JSON.stringify(params),
			headers: { "Content-Type": "application/json" },
		});
		return data as ModifyPositionResponse;
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to cancel limit order",
		};
	}
}

/**
 * Enrich position data with real-time PnL calculations using the token price service
 */
export async function enrichPositionsWithPrices(
	positions: Position[],
): Promise<EnhancedPosition[]> {
	if (!positions.length) return [];

	const tokenPriceService = getTokenPriceService();

	// Get unique token symbols
	const uniqueSymbols = [...new Set(positions.map((pos) => pos.tokenSymbol))];

	// Fetch current prices for all tokens
	const priceMap = await tokenPriceService.getMultipleTokenPrices(uniqueSymbols);

	// Enrich each position with real-time data
	const enrichedPositions = positions.map((position) => {
		const priceData = priceMap.get(position.tokenSymbol.toUpperCase());

		if (!priceData) {
			// Return position without enhancement if no price data
			return {
				...position,
				currentPrice: undefined,
				unrealizedPnL: undefined,
				unrealizedPnLPercentage: undefined,
				tokenAmount: undefined,
				currentValue: undefined,
			} as EnhancedPosition;
		}

		// Calculate PnL based on the price data we already have
		// Avoid calling calculatePositionPnL which triggers extra fetches
		const currentPriceValue = parseFloat(priceData.priceUSD);
		const entryPriceValue = parseFloat(position.entryPrice.replace(/[$,]/g, ""));
		const marginValue = parseFloat(position.margin.replace(/[$,]/g, ""));
		const leverageValue = parseInt(position.leverage, 10) || 1;

		const totalExposure = marginValue * leverageValue;
		const tokenAmount = totalExposure / entryPriceValue;
		const currentValue = tokenAmount * currentPriceValue;

		const priceChange = currentPriceValue - entryPriceValue;
		const pnlMultiplier = position.isLong ? 1 : -1;
		const unrealizedPnL = (priceChange / entryPriceValue) * totalExposure * pnlMultiplier;
		const unrealizedPnLPercentage = (unrealizedPnL / marginValue) * 100;

		return {
			...position,
			currentPrice: priceData.priceUSD,
			unrealizedPnL: unrealizedPnL || 0,
			unrealizedPnLPercentage: unrealizedPnLPercentage || 0,
			tokenAmount: tokenAmount || 0,
			currentValue: currentValue || 0,
			priceSource: priceData.source,
			priceConfidence: priceData.confidence,
		} as EnhancedPosition;
	});

	return enrichedPositions;
}

/**
 * Fetch user positions with enhanced real-time PnL calculations using the enhanced API
 */
export async function getEnhancedUserPositions(
	traderAddress: string,
): Promise<GetEnhancedPositionsResponse> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/positions/query`, {
			method: "POST",
			body: JSON.stringify({ trader: traderAddress }),
			headers: { "Content-Type": "application/json" },
		});
		// Handle both array response and object response with positions property
		const positions = (
			Array.isArray(data) ? data : (data as { positions?: Position[] } | null)?.positions || []
		) as Position[];
		const enhancedPositions = await enrichPositionsWithPrices(positions);
		const totalUnrealizedPnL = enhancedPositions.reduce(
			(sum, pos) => sum + (pos.unrealizedPnL || 0),
			0,
		);
		const totalPortfolioValue = enhancedPositions.reduce(
			(sum, pos) => sum + (pos.currentValue || 0),
			0,
		);
		return {
			success: true,
			positions: enhancedPositions,
			count: enhancedPositions.length,
			totalPortfolioValue,
			totalUnrealizedPnL,
		};
	} catch (error) {
		return {
			success: false,
			positions: [],
			count: 0,
			error: error instanceof Error ? error.message : "Failed to fetch enhanced positions",
		};
	}
}

/**
 * Calculate unrealized PnL based on current price
 */
function _calculateUnrealizedPnl(position: Position, currentPrice: number | null): number | null {
	if (!currentPrice) return null;

	const entryPrice = parseFloat(position.entryPrice);
	const marginAmount = parseFloat(position.margin);
	const leverageValue = parseFloat(position.leverage);
	const tokenAmount = (marginAmount * leverageValue) / entryPrice;

	// PnL calculation: (Current Price - Entry Price) * Token Amount
	return (currentPrice - entryPrice) * tokenAmount;
}
