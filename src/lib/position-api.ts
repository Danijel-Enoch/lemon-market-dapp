/**
 * Position API utilities for frontend integration
 */

import {
	getTokenPriceService,
	type TokenPriceData,
	type PnLCalculation
} from "./token-price-service";

export interface CreatePositionRequest {
	tokenSymbol: string;
	isLong: boolean;
	margin: string; // in USDC
	leverage: number;
	tokenAddress: string;
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
	openedAt: string;
	lastUpdatedAt: string;
	lastTransactionHash: string;
	trader: string;
	tokenaddress: string;
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
export async function getUserPositions(
	traderAddress: string
): Promise<GetPositionsResponse> {
	try {
		const response = await fetch(
			`/api/positions?trader=${encodeURIComponent(
				traderAddress
			)}&enhanced=true`,
			{
				method: "GET",
				headers: {
					"Content-Type": "application/json"
				}
			}
		);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				errorData.error || `HTTP error! status: ${response.status}`
			);
		}

		return await response.json();
	} catch (error) {
		console.error("Error fetching user positions:", error);
		return {
			success: false,
			positions: [],
			count: 0,
			error:
				error instanceof Error
					? error.message
					: "Failed to fetch positions"
		};
	}
}

/**
 * Calculate PnL percentage
 */
export function calculatePnlPercentage(
	pnlRaw: string | null,
	margin: string
): string {
	try {
		if (!pnlRaw || pnlRaw === "null") return "0.00%";

		const pnl = parseFloat(pnlRaw) / 1e6; // Assuming USDC with 6 decimals
		const marginAmount = parseFloat(margin.replace(/[$,]/g, ""));

		if (marginAmount === 0 || isNaN(pnl) || !isFinite(pnl)) return "0.00%";

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
		const pnl = parseFloat(pnlRaw);
		return !isNaN(pnl) && isFinite(pnl) && pnl > 0;
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
	currentPrice?: string
): string {
	try {
		const marginAmount = parseFloat(margin.replace(/[\$,]/g, ""));
		const leverageValue = parseFloat(leverage.replace(/x/g, ""));
		const entryPriceValue = parseFloat(entryPrice.replace(/[\$,]/g, ""));

		if (
			entryPriceValue === 0 ||
			isNaN(entryPriceValue) ||
			isNaN(marginAmount) ||
			isNaN(leverageValue)
		) {
			return `0 ${tokenSymbol}`;
		}

		// Calculate the actual token amount based on total exposure / entry price
		const totalExposure = marginAmount * leverageValue;
		const tokenAmount = totalExposure / entryPriceValue;

		// If current price is provided, show current worth
		if (currentPrice) {
			const currentPriceValue = parseFloat(
				currentPrice.replace(/[\$,]/g, "")
			);
			if (currentPriceValue > 0 && !isNaN(currentPriceValue)) {
				const currentWorth = tokenAmount * currentPriceValue;
				return `${tokenAmount.toFixed(
					6
				)} ${tokenSymbol} ($${currentWorth.toFixed(2)})`;
			}
		}

		// Fallback to just token amount if no current price
		return `${tokenAmount.toFixed(6)} ${tokenSymbol}`;
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
	isLong: boolean
): {
	tokenAmount: number;
	currentWorth: number;
	unrealizedPnl: number;
	unrealizedPnlPercentage: string;
} {
	try {
		const marginAmount = parseFloat(margin.replace(/[\$,]/g, ""));
		const leverageValue = parseFloat(leverage.replace(/x/g, ""));
		const entryPriceValue = parseFloat(entryPrice.replace(/[\$,]/g, ""));
		const currentPriceValue = parseFloat(
			currentPrice.replace(/[\$,]/g, "")
		);

		if (entryPriceValue === 0 || currentPriceValue === 0) {
			return {
				tokenAmount: 0,
				currentWorth: 0,
				unrealizedPnl: 0,
				unrealizedPnlPercentage: "0.00%"
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
		const unrealizedPnl =
			(priceChange / entryPriceValue) * totalExposure * pnlMultiplier;

		// PnL percentage based on margin
		const unrealizedPnlPercentage =
			marginAmount > 0
				? `${unrealizedPnl >= 0 ? "+" : ""}${(
						(unrealizedPnl / marginAmount) *
						100
				  ).toFixed(2)}%`
				: "0.00%";

		return {
			tokenAmount,
			currentWorth,
			unrealizedPnl,
			unrealizedPnlPercentage
		};
	} catch {
		return {
			tokenAmount: 0,
			currentWorth: 0,
			unrealizedPnl: 0,
			unrealizedPnlPercentage: "0.00%"
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
export async function closePosition(
	params: ClosePositionRequest
): Promise<ClosePositionResponse> {
	const response = await fetch("/api/position/close", {
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
 * Call the position modify API
 */
export async function modifyPosition(
	params: ModifyPositionRequest
): Promise<ModifyPositionResponse> {
	const response = await fetch("/api/position/modify", {
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
 * Enrich position data with real-time PnL calculations using the token price service
 */
export async function enrichPositionsWithPrices(
	positions: Position[]
): Promise<EnhancedPosition[]> {
	if (!positions.length) return [];

	const tokenPriceService = getTokenPriceService();

	// Get unique token symbols
	const uniqueSymbols = [...new Set(positions.map((pos) => pos.tokenSymbol))];

	// Fetch current prices for all tokens
	const priceMap = await tokenPriceService.getMultipleTokenPrices(
		uniqueSymbols
	);

	// Enrich each position with real-time data
	const enrichedPositions = await Promise.all(
		positions.map(async (position) => {
			const priceData = priceMap.get(position.tokenSymbol.toUpperCase());

			if (!priceData) {
				// Return position without enhancement if no price data
				return {
					...position,
					currentPrice: undefined,
					unrealizedPnL: undefined,
					unrealizedPnLPercentage: undefined,
					tokenAmount: undefined,
					currentValue: undefined
				} as EnhancedPosition;
			}

			// Calculate PnL using the token price service
			const pnlCalculation = await tokenPriceService.calculatePositionPnL(
				position.tokenSymbol,
				position.entryPrice,
				position.margin,
				position.leverage,
				position.isLong,
				position.liquidationPrice
			);

			return {
				...position,
				currentPrice: priceData.priceUSD,
				unrealizedPnL: pnlCalculation?.unrealizedPnL || 0,
				unrealizedPnLPercentage:
					pnlCalculation?.unrealizedPnLPercentage || 0,
				tokenAmount: pnlCalculation?.tokenAmount || 0,
				currentValue: pnlCalculation?.currentValue || 0,
				priceSource: priceData.source,
				priceConfidence: priceData.confidence
			} as EnhancedPosition;
		})
	);

	return enrichedPositions;
}

/**
 * Fetch user positions with enhanced real-time PnL calculations using the enhanced API
 */
export async function getEnhancedUserPositions(
	traderAddress: string
): Promise<GetEnhancedPositionsResponse> {
	try {
		const response = await fetch(
			`/api/positions/enhanced?trader=${encodeURIComponent(
				traderAddress
			)}`,
			{
				method: "GET",
				headers: {
					"Content-Type": "application/json"
				}
			}
		);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				errorData.error || `HTTP error! status: ${response.status}`
			);
		}

		const data = await response.json();

		return {
			success: data.success,
			positions: data.positions || [],
			count: data.count || 0,
			totalPortfolioValue: data.totalPortfolioValue,
			totalUnrealizedPnL: data.totalUnrealizedPnL,
			error: data.error
		};
	} catch (error) {
		console.error("Error fetching enhanced user positions:", error);
		return {
			success: false,
			positions: [],
			count: 0,
			error:
				error instanceof Error
					? error.message
					: "Failed to fetch enhanced positions"
		};
	}
}

/**
 * Calculate unrealized PnL based on current price
 */
function calculateUnrealizedPnl(
	position: Position,
	currentPrice: number | null
): number | null {
	if (!currentPrice) return null;

	const entryPrice = parseFloat(position.entryPrice);
	const marginAmount = parseFloat(position.margin);
	const leverageValue = parseFloat(position.leverage);
	const tokenAmount = (marginAmount * leverageValue) / entryPrice;

	// PnL calculation: (Current Price - Entry Price) * Token Amount
	return (currentPrice - entryPrice) * tokenAmount;
}
