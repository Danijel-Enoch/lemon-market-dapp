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

// Token mapping for common symbols to contract addresses
const TOKEN_ADDRESS_MAP: Record<
	string,
	{ address: string; chain: string; decimals: number }
> = {
	BTC: {
		address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
		chain: "bsc",
		decimals: 18
	}, // BTCB on BSC
	ETH: {
		address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
		chain: "bsc",
		decimals: 18
	}, // ETH on BSC
	BNB: {
		address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
		chain: "bsc",
		decimals: 18
	}, // WBNB
	USDT: {
		address: "0x55d398326f99059fF775485246999027B3197955",
		chain: "bsc",
		decimals: 18
	}, // USDT on BSC
	USDC: {
		address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
		chain: "bsc",
		decimals: 18
	}, // USDC on BSC
	ADA: {
		address: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",
		chain: "bsc",
		decimals: 18
	}, // ADA on BSC
	DOT: {
		address: "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402",
		chain: "bsc",
		decimals: 18
	}, // DOT on BSC
	LINK: {
		address: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD",
		chain: "bsc",
		decimals: 18
	}, // LINK on BSC
	XRP: {
		address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
		chain: "bsc",
		decimals: 18
	}, // XRP on BSC
	SOL: {
		address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
		chain: "bsc",
		decimals: 18
	}, // SOL on BSC
	TST: {
		address: "0x86Bb94DdD16Efc8bc58e6b056e8df71D9e666429",
		chain: "bsc",
		decimals: 18
	},
	ALU: {
		address: "0x8263CD1601FE73C066bf49cc09841f35348e3be0",
		chain: "bsc",
		decimals: 18
	},
	GIGGLE: {
		address: "0x20d6015660b3fe52e6690a889b5C51F69902cE0e",
		chain: "bsc",
		decimals: 18
	},
	RWA: {
		address: "0x9C8B5CA345247396bDfAc0395638ca9045C6586E",
		chain: "bsc",
		decimals: 18
	},
	"0G": {
		address: "0x4B948d64dE1F71fCd12fB586f4c776421a35b3eE",
		chain: "bsc",
		decimals: 18
	},
	BROCCOLI: {
		address: "0x12B4356C65340Fb02cdff01293F95FEBb1512F3b",
		chain: "bsc",
		decimals: 18
	},
	priceless: {
		address: "0x7d03759E5B41E36899833cb2E008455d69A24444",
		chain: "bsc",
		decimals: 18
	}
};

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
	 * Get token address from symbol using built-in mapping or external APIs
	 */
	async getTokenAddress(symbol: string): Promise<TokenMetadata | null> {
		const upperSymbol = symbol.toUpperCase();

		// Check built-in mapping first
		if (TOKEN_ADDRESS_MAP[upperSymbol]) {
			const tokenInfo = TOKEN_ADDRESS_MAP[upperSymbol];
			return {
				symbol: upperSymbol,
				name: upperSymbol,
				address: tokenInfo.address,
				chain: tokenInfo.chain,
				decimals: tokenInfo.decimals
			};
		}

		// Try DexScreener search
		try {
			const dexScreenerData = await this.searchTokenOnDexScreener(symbol);
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

	/**
	 * Get comprehensive price data for a token
	 */
	async getTokenPrice(
		symbol: string,
		pairAddress?: string
	): Promise<TokenPriceData | null> {
		// Check cache first
		const cacheKey = `${symbol}-${pairAddress || "default"}`;
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

		// Try Lemon Oracle first (highest confidence)
		try {
			const oracleResponse = await this.lemonClient.getPrice(
				tokenMetadata.address
			);

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
	 * Get multiple token prices efficiently
	 */
	async getMultipleTokenPrices(
		symbols: string[]
	): Promise<Map<string, TokenPriceData>> {
		const results = new Map<string, TokenPriceData>();

		// Get token metadata for all symbols
		const tokenMetadataPromises = symbols.map(async (symbol) => {
			const metadata = await this.getTokenAddress(symbol);
			return { symbol, metadata };
		});

		const tokenMetadataResults = await Promise.allSettled(
			tokenMetadataPromises
		);
		const validTokens = tokenMetadataResults
			.filter(
				(
					result
				): result is PromiseFulfilledResult<{
					symbol: string;
					metadata: TokenMetadata | null;
				}> =>
					result.status === "fulfilled" &&
					result.value.metadata !== null
			)
			.map((result) => ({
				symbol: result.value.symbol,
				metadata: result.value.metadata!
			}));

		// Batch request to Lemon Oracle
		if (validTokens.length > 0) {
			try {
				const requests: PriceRequest[] = validTokens.map(
					({ metadata }) => ({
						tokenAddress: metadata.address
					})
				);

				const oracleResponse = await this.lemonClient.getMultiplePrices(
					requests
				);

				if (oracleResponse.success && oracleResponse.data) {
					oracleResponse.data.forEach((aggregatedPrice, index) => {
						const token = validTokens[index];
						if (token) {
							const bestPrice =
								this.lemonClient.getBestPrice(aggregatedPrice);
							if (bestPrice) {
								results.set(token.symbol.toUpperCase(), {
									tokenAddress: token.metadata.address,
									symbol: token.symbol.toUpperCase(),
									priceUSD:
										bestPrice.priceUSD || bestPrice.price,
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
								});
							}
						}
					});
				}
			} catch (error) {
				console.warn("Batch oracle request failed:", error);
			}
		}

		// Fallback for tokens that don't have oracle prices
		const missingSymbols = symbols.filter(
			(symbol) => !results.has(symbol.toUpperCase())
		);

		if (missingSymbols.length > 0) {
			const fallbackPromises = missingSymbols.map((symbol) =>
				this.getTokenPrice(symbol)
			);
			const fallbackResults = await Promise.allSettled(fallbackPromises);

			fallbackResults.forEach((result, index) => {
				if (result.status === "fulfilled" && result.value) {
					results.set(
						missingSymbols[index].toUpperCase(),
						result.value
					);
				}
			});
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
		const priceData = await this.getTokenPrice(tokenSymbol);

		if (!priceData) {
			console.warn(`Could not get price for ${tokenSymbol}`);
			return null;
		}

		const currentPrice = parseFloat(priceData.priceUSD);
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
