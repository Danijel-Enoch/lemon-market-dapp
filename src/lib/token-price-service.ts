/**
 * Token Price Service
 *
 * A comprehensive service that integrates multiple price sources:
 * 1. DexScreener API for getting token addresses and basic price data
 * 2. CoinGecko Terminal API as fallback
 * 3. Lemon Oracle Client for real-time price aggregation across DEXes
 *
 * This service is used for:
 * - Loading user positions with real-time PnL calculations
 * - Modifying/closing trades with accurate price data
 * - Portfolio valuation
 */

import {
	LemonSpotPriceClient,
	type AggregatedPrice,
	type PriceRequest
} from "./lemonOracleClient";

// Configuration
const LEMON_ORACLE_BASE_URL =
	process.env.LEMON_ORACLE_API_URL ||
	"https://app-override-mobile-alarm-fb3c86.kubesmith.app/";
const DEXSCREENER_BASE_URL = "https://api.dexscreener.com/latest";
const COINGECKO_BASE_URL = "https://pro-api.coingecko.com/api/v3";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

// Supported Chain IDs
export const SUPPORTED_CHAINS = {
	BSC: 56,
	BASE: 8453,
	ETHEREUM: 1,
	SEPOLIA: 11155111
} as const;

export type SupportedChainId =
	(typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS];

export interface TokenMetadata {
	symbol: string;
	name: string;
	address: string;
	chain: string;
	decimals: number;
	logoUri?: string;
}

export interface TokenPriceData {
	tokenAddress: string;
	symbol: string;
	priceUSD: string;
	priceNative?: string;
	priceChange24h?: string; // 24h price change percentage
	timestamp: number;
	source: "lemon-oracle" | "dexscreener" | "coingecko";
	confidence: "high" | "medium" | "low";
	dexPrices?: Array<{
		dex: string;
		price: string;
		liquidity?: string;
	}>;
}

export interface PnLCalculation {
	currentPrice: string;
	entryPrice: string;
	isLong: boolean;
	margin: number;
	leverage: number;
	unrealizedPnL: number;
	unrealizedPnLPercentage: number;
	liquidationPrice: string;
	tokenAmount: number;
	currentValue: number;
}

export class TokenPriceService {
	private lemonClient: LemonSpotPriceClient;
	private priceCache: Map<
		string,
		{ data: TokenPriceData; timestamp: number }
	> = new Map();
	private cacheTTL = 5000; // Reduced to 5 seconds for micro price changes

	constructor() {
		this.lemonClient = new LemonSpotPriceClient({
			baseUrl: LEMON_ORACLE_BASE_URL,
			timeout: 15000,
			enableCaching: true,
			cacheTTL: 5000, // Reduced cache TTL for better price sensitivity
			maxRetries: 2,
			debug: process.env.NODE_ENV === "development"
		});
	}

	/**
	 * Get token address from symbol using external APIs
	 */
	async getTokenAddress(symbol: string): Promise<TokenMetadata | null> {
		// Try DexScreener search first
		console.log("Searching token address for symbol:", symbol);
		try {
			const dexScreenerData = await this.searchTokenOnDexScreener(symbol);
			console.log("DexScreener search result:", dexScreenerData);
			if (dexScreenerData) {
				return dexScreenerData;
			}
		} catch (error) {
			console.warn(`DexScreener search failed for ${symbol}:`, error);
		}

		// Try CoinGecko as fallback
		try {
			const coinGeckoData = await this.searchTokenOnCoinGecko(symbol);
			if (coinGeckoData) {
				return coinGeckoData;
			}
		} catch (error) {
			console.warn(`CoinGecko search failed for ${symbol}:`, error);
		}

		return null;
	}

	/**
	 * Search token on DexScreener
	 */
	private async searchTokenOnDexScreener(
		symbol: string
	): Promise<TokenMetadata | null> {
		const response = await fetch(
			`${DEXSCREENER_BASE_URL}/dex/search/?q=${symbol}`,
			{
				headers: {
					Accept: "application/json"
				}
			}
		);

		if (!response.ok) {
			throw new Error(`DexScreener API error: ${response.status}`);
		}

		const data = await response.json();

		// Look for exact symbol match on BSC
		const match = data.pairs?.find(
			(pair: any) =>
				pair.baseToken?.symbol?.toUpperCase() ===
					symbol.toUpperCase() &&
				pair.chainId === "bsc" &&
				pair.baseToken?.address
		);

		if (match) {
			return {
				symbol: match.baseToken.symbol,
				name: match.baseToken.name || match.baseToken.symbol,
				address: match.baseToken.address,
				chain: "bsc",
				decimals: 18, // Default for BSC tokens
				logoUri: match.info?.imageUrl
			};
		}

		return null;
	}

	/**
	 * Search token on CoinGecko
	 */
	private async searchTokenOnCoinGecko(
		symbol: string
	): Promise<TokenMetadata | null> {
		if (!COINGECKO_API_KEY) {
			console.warn("CoinGecko API key not configured");
			return null;
		}

		const response = await fetch(
			`${COINGECKO_BASE_URL}/search?query=${symbol}`,
			{
				headers: {
					Accept: "application/json",
					"X-Cg-Pro-Api-Key": COINGECKO_API_KEY
				}
			}
		);

		if (!response.ok) {
			throw new Error(`CoinGecko API error: ${response.status}`);
		}

		const data = await response.json();

		// Look for exact symbol match
		const match = data.coins?.find(
			(coin: any) => coin.symbol?.toUpperCase() === symbol.toUpperCase()
		);

		if (match) {
			// Get token details to find BSC contract address
			const detailResponse = await fetch(
				`${COINGECKO_BASE_URL}/coins/${match.id}`,
				{
					headers: {
						Accept: "application/json",
						"X-Cg-Pro-Api-Key": COINGECKO_API_KEY
					}
				}
			);

			if (detailResponse.ok) {
				const details = await detailResponse.json();
				const bscAddress = details.platforms?.["binance-smart-chain"];

				if (bscAddress) {
					return {
						symbol: details.symbol?.toUpperCase(),
						name: details.name,
						address: bscAddress,
						chain: "bsc",
						decimals: 18,
						logoUri: details.image?.large
					};
				}
			}
		}

		return null;
	}

	async getTokenPriceWithAddress(address: string) {
		return await this.lemonClient.getPriceBase(address);
	}

	/**
	 * Get comprehensive price data for a token with chain support
	 */
	async getTokenPrice(
		symbol: string,
		pairAddress?: string,
		chainId?: number
	): Promise<TokenPriceData | null> {
		// Check cache first
		const cacheKey = `${symbol}-${pairAddress || "default"}-${
			chainId || "default"
		}`;
		const cached = this.priceCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
			return cached.data;
		}

		// Get token metadata
		const tokenMetadata = await this.getTokenAddress(symbol);
		if (!tokenMetadata) {
			console.warn(`Could not find token metadata for ${symbol}`);
			return null;
		}

		let priceData: TokenPriceData | null = null;

		// Try Lemon Oracle first (highest confidence) with chain support
		try {
			let oracleResponse;

			// Use chain-specific endpoints if available
			if (chainId === SUPPORTED_CHAINS.BASE) {
				// Base chain
				oracleResponse = await this.lemonClient.getPriceBase(
					tokenMetadata.address,
					pairAddress
				);
			} else if (chainId === SUPPORTED_CHAINS.BSC) {
				// BSC chain
				oracleResponse = await this.lemonClient.getPriceBSC(
					tokenMetadata.address,
					pairAddress
				);
			} else {
				// Use generic endpoint with chainId parameter
				oracleResponse = await this.lemonClient.getPrice(
					tokenMetadata.address,
					pairAddress,
					chainId
				);
			}

			if (oracleResponse.success && oracleResponse.data) {
				const aggregatedPrice = oracleResponse.data;
				const bestPrice =
					this.lemonClient.getBestPrice(aggregatedPrice);

				if (bestPrice) {
					priceData = {
						tokenAddress: tokenMetadata.address,
						symbol: symbol.toUpperCase(),
						priceUSD: bestPrice.priceUSD || bestPrice.price,
						priceNative: bestPrice.price,
						timestamp: Date.now(),
						source: "lemon-oracle",
						confidence: "high",
						dexPrices: aggregatedPrice.prices
							.filter((p) => p.success)
							.map((p) => ({
								dex: p.dex,
								price: p.priceUSD || p.price,
								liquidity: p.liquidity
							}))
					};
				}
			}
		} catch (error) {
			console.warn(`Lemon Oracle failed for ${symbol}:`, error);
		}

		// Fallback to DexScreener
		if (!priceData) {
			try {
				const dexScreenerPrice = await this.getDexScreenerPrice(
					tokenMetadata.address
				);
				if (dexScreenerPrice) {
					priceData = {
						tokenAddress: tokenMetadata.address,
						symbol: symbol.toUpperCase(),
						priceUSD: dexScreenerPrice.toString(),
						timestamp: Date.now(),
						source: "dexscreener",
						confidence: "medium"
					};
				}
			} catch (error) {
				console.warn(
					`DexScreener fallback failed for ${symbol}:`,
					error
				);
			}
		}

		// Final fallback to CoinGecko
		if (!priceData && COINGECKO_API_KEY) {
			try {
				const coinGeckoPrice = await this.getCoinGeckoPrice(
					tokenMetadata.address
				);
				if (coinGeckoPrice) {
					priceData = {
						tokenAddress: tokenMetadata.address,
						symbol: symbol.toUpperCase(),
						priceUSD: coinGeckoPrice.toString(),
						timestamp: Date.now(),
						source: "coingecko",
						confidence: "low"
					};
				}
			} catch (error) {
				console.warn(`CoinGecko fallback failed for ${symbol}:`, error);
			}
		}

		// Cache the result
		if (priceData) {
			this.priceCache.set(cacheKey, {
				data: priceData,
				timestamp: Date.now()
			});
		}

		return priceData;
	}

	/**
	 * Get price from DexScreener
	 */
	private async getDexScreenerPrice(
		tokenAddress: string
	): Promise<number | null> {
		const response = await fetch(
			`${DEXSCREENER_BASE_URL}/dex/tokens/${tokenAddress}`,
			{
				headers: {
					Accept: "application/json"
				}
			}
		);

		if (!response.ok) {
			throw new Error(`DexScreener API error: ${response.status}`);
		}

		const data = await response.json();

		// Find the best pair (highest liquidity)
		const pairs = data.pairs || [];
		const bestPair = pairs
			.filter(
				(pair: any) => pair.priceUsd && parseFloat(pair.priceUsd) > 0
			)
			.sort(
				(a: any, b: any) =>
					parseFloat(b.liquidity?.usd || "0") -
					parseFloat(a.liquidity?.usd || "0")
			)[0];

		return bestPair ? parseFloat(bestPair.priceUsd) : null;
	}

	/**
	 * Get price from CoinGecko
	 */
	private async getCoinGeckoPrice(
		tokenAddress: string
	): Promise<number | null> {
		if (!COINGECKO_API_KEY) return null;

		const response = await fetch(
			`${COINGECKO_BASE_URL}/simple/token_price/binance-smart-chain?contract_addresses=${tokenAddress}&vs_currencies=usd`,
			{
				headers: {
					Accept: "application/json",
					"X-Cg-Pro-Api-Key": COINGECKO_API_KEY
				}
			}
		);

		if (!response.ok) {
			throw new Error(`CoinGecko API error: ${response.status}`);
		}

		const data = await response.json();
		const priceData = data[tokenAddress.toLowerCase()];

		return priceData?.usd || null;
	}

	/**
	 * Get comprehensive price data for a token by address (more efficient when address is known)
	 * This is the primary method used by the backend API for fetching prices with token addresses
	 */
	async getTokenPriceByAddress(
		tokenAddress: string,
		symbol: string,
		pairAddress?: string,
		chainId?: number
	): Promise<TokenPriceData | null> {
		console.log(
			`[TokenPriceService] Fetching price for token address: ${tokenAddress}, symbol: ${symbol}, chainId: ${
				chainId || "default"
			}, pairAddress: ${pairAddress || "none"}`
		);

		// Validate input
		if (!tokenAddress || !symbol) {
			console.error(
				`[TokenPriceService] Invalid input: tokenAddress=${tokenAddress}, symbol=${symbol}`
			);
			return null;
		}

		// Check cache first
		const cacheKey = `${tokenAddress}-${pairAddress || "default"}-${
			chainId || "default"
		}`;
		const cached = this.priceCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
			console.log(
				`[TokenPriceService] Cache hit for ${tokenAddress}, returning cached price: $${cached.data.priceUSD}`
			);
			return cached.data;
		}

		let priceData: TokenPriceData | null = null;
		let tokenSymbol = "UNKNOWN"; // Fallback symbol

		// Try to get token metadata from DexScreener first to get symbol
		try {
			const dexScreenerData = await this.getDexScreenerTokenMetadata(
				tokenAddress
			);
			if (dexScreenerData?.symbol) {
				tokenSymbol = dexScreenerData.symbol;
				console.log(
					`[TokenPriceService] Found token symbol from DexScreener: ${tokenSymbol}`
				);
			}
		} catch (error) {
			console.warn(
				`[TokenPriceService] Could not get token metadata from DexScreener for ${tokenAddress}:`,
				error
			);
		}

		// Fallback to CoinGecko to get symbol if not found on DexScreener
		if (tokenSymbol === "UNKNOWN" && COINGECKO_API_KEY) {
			try {
				const coinGeckoData = await this.searchTokenOnCoinGecko(symbol);
				if (coinGeckoData) {
					tokenSymbol = coinGeckoData.symbol;
					console.log(
						`[TokenPriceService] Found token symbol from CoinGecko: ${tokenSymbol}`
					);
				}
			} catch (error) {
				console.warn(
					`[TokenPriceService] CoinGecko fallback failed for ${symbol}:`,
					error
				);
			}
		}

		// Use the discovered or fallback symbol to fetch price
		try {
			priceData = await this.getTokenPriceByAddress(
				tokenAddress,
				tokenSymbol,
				pairAddress,
				chainId
			);
		} catch (error) {
			console.error(
				`[TokenPriceService] Failed to get price data for ${tokenAddress} (${tokenSymbol}):`,
				error
			);
		}

		// Cache the result if we have data
		if (priceData) {
			this.priceCache.set(cacheKey, {
				data: priceData,
				timestamp: Date.now()
			});
			console.log(
				`[TokenPriceService] Cached price data for ${tokenAddress}: $${priceData.priceUSD} from ${priceData.source}`
			);
		} else {
			console.error(
				`[TokenPriceService] Failed to get price data from all sources for token ${tokenAddress} (${symbol})`
			);
		}

		return priceData;
	}

	/**
	 * Get price data using only the token address (no symbol required)
	 * This method is useful when the frontend has token address but no symbol
	 */
	async getTokenPriceByAddressOnly(
		tokenAddress: string,
		pairAddress?: string,
		chainId?: number
	): Promise<TokenPriceData | null> {
		console.log(
			`[TokenPriceService] Fetching price for token address only: ${tokenAddress}`
		);

		// Try to get token symbol from DexScreener first
		let tokenSymbol = "UNKNOWN";
		try {
			const metadata = await this.getDexScreenerTokenMetadata(
				tokenAddress
			);
			if (metadata?.symbol) {
				tokenSymbol = metadata.symbol;
			}
		} catch (error) {
			console.warn(
				`Could not get token metadata for ${tokenAddress}:`,
				error
			);
		}

		// Use the existing method with the discovered or fallback symbol
		return this.getTokenPriceByAddress(
			tokenAddress,
			tokenSymbol,
			pairAddress,
			chainId
		);
	}

	/**
	 * Helper method to get token metadata from DexScreener
	 */
	private async getDexScreenerTokenMetadata(
		tokenAddress: string
	): Promise<{ symbol: string; name: string } | null> {
		const response = await fetch(
			`${DEXSCREENER_BASE_URL}/dex/tokens/${tokenAddress}`
		);
		if (!response.ok)
			throw new Error(`DexScreener API error: ${response.status}`);

		const data = await response.json();
		const validPair = data.pairs?.find(
			(pair: any) => pair.baseToken?.symbol
		);

		return validPair?.baseToken
			? {
					symbol: validPair.baseToken.symbol,
					name: validPair.baseToken.name || validPair.baseToken.symbol
			  }
			: null;
	}

	/**
	 * Get multiple token prices efficiently with chain support
	 */
	async getMultipleTokenPrices(
		tokenAddresses: string[]
	): Promise<Map<string, TokenPriceData>> {
		const results = new Map<string, TokenPriceData>();

		// Fetch prices for each token address
		for (const address of tokenAddresses) {
			const priceData = await this.getTokenPriceWithAddress(address);
			if (priceData) {
				results.set(address, {
					tokenAddress: address,
					symbol: address,
					priceUSD: priceData.data?.averagePriceUSD!,
					priceNative: priceData.data?.averagePrice,
					priceChange24h: "",
					timestamp: Date.now(),
					source: "lemon-oracle",
					confidence: "low",
					dexPrices: []
				});
			}
		}

		return results;
	}

	/**
	 * Calculate PnL for a position using current market price
	 */
	async calculatePositionPnL(
		tokenSymbol: string,
		entryPrice: string,
		margin: string,
		leverage: string,
		isLong: boolean,
		liquidationPrice: string
	): Promise<PnLCalculation | null> {
		// console.log(
		// 	"===============================================================>"
		// );
		// Extract the actual token symbol (first part before underscore, or the whole string if no underscore)
		const tokenAddress = tokenSymbol;

		// Get price data using the symbol (which will internally get token metadata and address)
		const priceData = await this.getTokenPriceWithAddress(tokenAddress);

		if (!priceData) {
			return null;
		}

		console.log(
			`PnL calculation for ${tokenSymbol}: price data =`,
			priceData
		);

		const currentPrice = parseFloat(priceData.data?.averagePriceUSD!);
		const entryPriceValue = parseFloat(entryPrice.replace(/[\$,]/g, ""));
		const marginValue = parseFloat(margin.replace(/[\$,]/g, ""));
		const leverageValue = parseFloat(leverage.replace(/x/g, ""));

		if (
			currentPrice === 0 ||
			entryPriceValue === 0 ||
			marginValue === 0 ||
			leverageValue === 0
		) {
			return null;
		}

		// Calculate position size
		const totalExposure = marginValue * leverageValue;
		const tokenAmount = totalExposure / entryPriceValue;

		// Calculate current value
		const currentValue = tokenAmount * currentPrice;

		// Calculate PnL
		const priceChange = currentPrice - entryPriceValue;
		const pnlMultiplier = isLong ? 1 : -1;
		const unrealizedPnL =
			(priceChange / entryPriceValue) * totalExposure * pnlMultiplier;
		const unrealizedPnLPercentage = (unrealizedPnL / marginValue) * 100;

		// console.log(`PnL calculation results for ${tokenSymbol}:`, {
		// 	currentPrice,
		// 	entryPriceValue,
		// 	priceChange,
		// 	totalExposure,
		// 	tokenAmount,
		// 	unrealizedPnL,
		// 	unrealizedPnLPercentage
		// });

		return {
			currentPrice: currentPrice.toString(),
			entryPrice: entryPriceValue.toString(),
			isLong,
			margin: marginValue,
			leverage: leverageValue,
			unrealizedPnL,
			unrealizedPnLPercentage,
			liquidationPrice,
			tokenAmount,
			currentValue
		};
	}

	/**
	 * Get portfolio value for multiple positions
	 */
	async calculatePortfolioValue(
		positions: Array<{
			tokenSymbol: string;
			margin: string;
			leverage: string;
			entryPrice: string;
			isLong: boolean;
		}>
	): Promise<{
		totalValue: number;
		totalPnL: number;
		positions: Array<{
			tokenSymbol: string;
			currentPrice: string;
			unrealizedPnL: number;
			currentValue: number;
		}>;
	}> {
		const uniqueSymbols = [...new Set(positions.map((p) => p.tokenSymbol))];
		const priceMap = await this.getMultipleTokenPrices(uniqueSymbols);

		let totalValue = 0;
		let totalPnL = 0;
		const positionResults = [];

		for (const position of positions) {
			const priceData = priceMap.get(position.tokenSymbol.toUpperCase());

			if (priceData) {
				const pnlCalc = await this.calculatePositionPnL(
					position.tokenSymbol,
					position.entryPrice,
					position.margin,
					position.leverage,
					position.isLong,
					"0" // liquidationPrice not needed for this calculation
				);

				if (pnlCalc) {
					totalValue += pnlCalc.currentValue;
					totalPnL += pnlCalc.unrealizedPnL;

					positionResults.push({
						tokenSymbol: position.tokenSymbol,
						currentPrice: pnlCalc.currentPrice,
						unrealizedPnL: pnlCalc.unrealizedPnL,
						currentValue: pnlCalc.currentValue
					});
				}
			}
		}

		return {
			totalValue,
			totalPnL,
			positions: positionResults
		};
	}

	/**
	 * Get real-time price updates for trading interface
	 */
	startPriceStream(
		symbols: string[],
		onUpdate: (updates: Map<string, TokenPriceData>) => void,
		onError?: (error: Error) => void
	): string {
		return this.lemonClient.startPriceStream(
			{
				tokenAddresses: [], // Will be populated after getting token addresses
				interval: 5000,
				includeUSD: true
			},
			(update) => {
				// Convert stream update to our format
				// This would need the symbol mapping
			},
			onError
		);
	}

	/**
	 * Stop price streaming
	 */
	stopPriceStream(streamId: string): boolean {
		return this.lemonClient.stopPriceStream(streamId);
	}

	/**
	 * Clear all caches
	 */
	clearCache(): void {
		this.priceCache.clear();
		this.lemonClient.clearClientCache();
	}

	/**
	 * Destroy the service and clean up resources
	 */
	destroy(): void {
		this.lemonClient.destroy();
		this.priceCache.clear();
	}
}

// Singleton instance
let tokenPriceServiceInstance: TokenPriceService | null = null;

export function getTokenPriceService(): TokenPriceService {
	if (!tokenPriceServiceInstance) {
		tokenPriceServiceInstance = new TokenPriceService();
	}
	return tokenPriceServiceInstance;
}

// Convenience functions
export async function getTokenPrice(
	symbol: string
): Promise<TokenPriceData | null> {
	return getTokenPriceService().getTokenPrice(symbol);
}

export async function getTokenPriceByAddress(
	tokenAddress: string,
	symbol: string,
	pairAddress?: string,
	chainId?: number
): Promise<TokenPriceData | null> {
	return getTokenPriceService().getTokenPriceByAddress(
		tokenAddress,
		symbol,
		pairAddress,
		chainId
	);
}

export async function getTokenPriceByAddressOnly(
	tokenAddress: string,
	pairAddress?: string,
	chainId?: number
): Promise<TokenPriceData | null> {
	return getTokenPriceService().getTokenPriceByAddressOnly(
		tokenAddress,
		pairAddress,
		chainId
	);
}

export async function calculatePositionPnL(
	tokenSymbol: string,
	entryPrice: string,
	margin: string,
	leverage: string,
	isLong: boolean,
	liquidationPrice: string = "0"
): Promise<PnLCalculation | null> {
	return getTokenPriceService().calculatePositionPnL(
		tokenSymbol,
		entryPrice,
		margin,
		leverage,
		isLong,
		liquidationPrice
	);
}

/**
 * Get chain name from chain ID
 */
export function getChainName(chainId: number): string {
	switch (chainId) {
		case SUPPORTED_CHAINS.BSC:
			return "BSC";
		case SUPPORTED_CHAINS.BASE:
			return "Base";
		case SUPPORTED_CHAINS.ETHEREUM:
			return "Ethereum";
		case SUPPORTED_CHAINS.SEPOLIA:
			return "Sepolia";
		default:
			return "Unknown";
	}
}

/**
 * Check if chain ID is supported
 */
export function isSupportedChain(chainId: number): chainId is SupportedChainId {
	return Object.values(SUPPORTED_CHAINS).includes(chainId as any);
}
