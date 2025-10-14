/**
 * Lemon Spot Price API Client
 *
 * A comprehensive TypeScript client for interacting with the Lemon Spot Price API.
 * Features:
 * - Type-safe methods for fetching token prices from multiple DEXes
 * - Multi-chain support (BSC, Base)
 * - USD pricing with Chainlink/CoinGecko oracle integration
 * - Price streaming and real-time updates
 * - Token information and metadata fetching
 * - Chain-specific price endpoints
 * - Built-in caching and retry logic
 * - Comprehensive error handling
 * - Backwards compatibility with legacy endpoints
 *
 * @version 2.1.0
 * @author Lemon Team
 */

// Type definitions
export interface DEXConfig {
	name: string;
	contractAddress: string;
	abi: any[];
	type:
		| "uniswap-v2"
		| "uniswap-v2-bnb"
		| "uniswap-v3"
		| "pancakeswap-v2"
		| "pancakeswap-v3"
		| "gra-fun"
		| "thena"
		| "four-meme"
		| "custom";
}

export interface PriceData {
	dex: string;
	price: string;
	priceUSD?: string;
	token0: string;
	token1: string;
	pairAddress: string;
	timestamp: number;
	success: boolean;
	error?: string;
	liquidity?: string;
	volume24h?: string;
}

export interface AggregatedPrice {
	tokenAddress: string;
	pairAddress?: string;
	prices: PriceData[];
	averagePrice?: string;
	averagePriceUSD?: string;
	bestPrice?: PriceData;
	bestPriceUSD?: PriceData;
	wbnbUSDPrice?: number;
	timestamp: number;
}

export interface HealthResponse {
	status: string;
	timestamp: string;
	multiChain: boolean;
	dexes: string[];
	cache: any;
	supportedChains: number[];
	features: {
		usdPricing: boolean;
		priceOracle: string;
	};
}

export interface DexesResponse {
	dexes: DEXConfig[];
}

export interface PriceRequest {
	tokenAddress: string;
	pairAddress?: string;
	chainId?: number;
}

export interface ClientOptions {
	/** Base URL of the API (without trailing slash) */
	baseUrl: string;
	/** Request timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Custom headers to include with requests */
	headers?: Record<string, string>;
	/** Whether to throw errors or return them in response (default: true) */
	throwOnError?: boolean;
	/** Enable request/response logging (default: false) */
	debug?: boolean;
	/** API key for authenticated requests (if required) */
	apiKey?: string;
	/** Maximum number of retries for failed requests (default: 3) */
	maxRetries?: number;
	/** Base delay between retries in milliseconds (default: 1000) */
	retryDelay?: number;
	/** Enable caching for GET requests (default: true) */
	enableCaching?: boolean;
	/** Cache TTL in milliseconds (default: 30000) */
	cacheTTL?: number;
	/** Default chain ID to use for requests (default: 56 for BSC) */
	defaultChainId?: number;
}

export interface ApiError {
	error: string;
	message: string;
	timestamp?: string;
}

export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: ApiError;
	status: number;
}

export interface TokenMetadata {
	address: string;
	name?: string;
	symbol?: string;
	decimals?: number;
	totalSupply?: string;
	pricing?: AggregatedPrice;
}

export interface OracleResponse {
	wbnbUSDPrice: number;
	source: string;
	timestamp: string;
	note: string;
}

export interface ChainsResponse {
	multiChain: boolean;
	supportedChains: Record<number, { chainId: number; name: string }>;
}

export interface PriceHistory {
	tokenAddress: string;
	prices: PriceHistoryEntry[];
	interval: string; // '1m', '5m', '1h', '1d', etc.
	from: number;
	to: number;
}

export interface PriceHistoryEntry {
	timestamp: number;
	price: string;
	priceUSD?: string;
	volume?: string;
	high?: string;
	low?: string;
	open?: string;
	close?: string;
}

export interface PriceAlert {
	id: string;
	tokenAddress: string;
	targetPrice: string;
	condition: "above" | "below";
	active: boolean;
	createdAt: number;
	triggeredAt?: number;
}

export interface StreamOptions {
	tokenAddresses: string[];
	interval?: number; // milliseconds
	includeUSD?: boolean;
}

export interface PriceStream {
	tokenAddress: string;
	price: string;
	priceUSD?: string;
	change24h?: number;
	timestamp: number;
}

export interface PriceComparison {
	tokenAddress: string;
	prices: {
		dex: string;
		price: string;
		priceUSD?: string;
		spread?: string;
	}[];
	bestBuy: { dex: string; price: string };
	bestSell: { dex: string; price: string };
	arbitrageOpportunity?: {
		buyFrom: string;
		sellTo: string;
		profit: string;
		profitPercent: number;
	};
}

/**
 * Client for the Lemon Spot Price API
 */
export class LemonSpotPriceClient {
	private readonly baseUrl: string;
	private readonly timeout: number;
	private readonly headers: Record<string, string>;
	private readonly throwOnError: boolean;
	private readonly debug: boolean;
	private readonly apiKey?: string;
	private readonly maxRetries: number;
	private readonly retryDelay: number;
	private readonly enableCaching: boolean;
	private readonly cacheTTL: number;
	private readonly defaultChainId: number;
	private readonly cache: Map<string, { data: any; timestamp: number }>;
	private activeStreams: Map<string, NodeJS.Timeout>;

	constructor(options: ClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, ""); // Remove trailing slash
		this.timeout = options.timeout ?? 30000;
		this.headers = {
			"Content-Type": "application/json",
			...options.headers
		};
		this.throwOnError = options.throwOnError ?? true;
		this.debug = options.debug ?? false;
		this.apiKey = options.apiKey;
		this.maxRetries = options.maxRetries ?? 3;
		this.retryDelay = options.retryDelay ?? 1000;
		this.enableCaching = options.enableCaching ?? true;
		this.cacheTTL = options.cacheTTL ?? 30000;
		this.defaultChainId = options.defaultChainId ?? 56; // Default to BSC
		this.cache = new Map();
		this.activeStreams = new Map();

		// Add API key to headers if provided
		if (this.apiKey) {
			this.headers["X-API-Key"] = this.apiKey;
		}
	}

	/**
	 * Make a request to the API with caching and retry logic
	 */
	private async request<T>(
		endpoint: string,
		options: RequestInit = {}
	): Promise<ApiResponse<T>> {
		const method = options.method || "GET";
		const cacheKey =
			method === "GET" ? `${endpoint}:${JSON.stringify(options)}` : null;

		// Check cache for GET requests
		if (this.enableCaching && cacheKey && method === "GET") {
			const cached = this.getCached<T>(cacheKey);
			if (cached) {
				if (this.debug) {
					console.log(`[LemonClient] Cache hit for ${endpoint}`);
				}
				return { success: true, data: cached, status: 200 };
			}
		}

		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				const result = await this.makeRequest<T>(endpoint, options);

				// Cache successful GET responses
				if (
					this.enableCaching &&
					cacheKey &&
					method === "GET" &&
					result.success
				) {
					this.setCached(cacheKey, result.data!);
				}

				return result;
			} catch (error) {
				lastError = error as Error;

				if (attempt < this.maxRetries) {
					const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff
					if (this.debug) {
						console.log(
							`[LemonClient] Retry ${attempt + 1}/${
								this.maxRetries
							} after ${delay}ms`
						);
					}
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		// All retries failed
		if (this.throwOnError && lastError) throw lastError;
		return {
			success: false,
			status: 0,
			error: {
				error: "NetworkError",
				message: lastError?.message || "Unknown error after retries"
			}
		};
	}

	/**
	 * Make a single HTTP request
	 */
	private async makeRequest<T>(
		endpoint: string,
		options: RequestInit = {}
	): Promise<ApiResponse<T>> {
		const url = `${this.baseUrl}${endpoint}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			if (this.debug) {
				console.log(`[LemonClient] ${options.method || "GET"} ${url}`);
				if (options.body) {
					console.log("[LemonClient] Request body:", options.body);
				}
			}

			const response = await fetch(url, {
				...options,
				headers: { ...this.headers, ...options.headers },
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			const data: any = await response.json();

			if (this.debug) {
				console.log(`[LemonClient] Response ${response.status}:`, data);
			}

			const result: ApiResponse<T> = {
				success: response.ok,
				status: response.status
			};

			if (response.ok) {
				result.data = data as T;
			} else {
				result.error = data as ApiError;
				if (this.throwOnError) {
					throw new Error(`API Error: ${data.message || data.error}`);
				}
			}

			return result;
		} catch (error) {
			clearTimeout(timeoutId);

			if (error instanceof Error && error.name === "AbortError") {
				const timeoutError = new Error(
					`Request timeout after ${this.timeout}ms`
				);
				throw timeoutError;
			}

			throw error;
		}
	}

	/**
	 * Get data from cache
	 */
	private getCached<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		if (Date.now() - entry.timestamp > this.cacheTTL) {
			this.cache.delete(key);
			return null;
		}

		return entry.data as T;
	}

	/**
	 * Set data in cache
	 */
	private setCached<T>(key: string, data: T): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now()
		});
	}

	/**
	 * Clear the client cache
	 */
	clearClientCache(): void {
		this.cache.clear();
	}

	/**
	 * Check API health status
	 */
	async getHealth(): Promise<ApiResponse<HealthResponse>> {
		return this.request<HealthResponse>("/health");
	}

	/**
	 * Get price for a single token
	 */
	async getPrice(
		tokenAddress: string,
		pairAddress?: string,
		chainId?: number
	): Promise<ApiResponse<AggregatedPrice>> {
		if (!this.isValidAddress(tokenAddress)) {
			const error = new Error("Invalid token address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		if (pairAddress && !this.isValidAddress(pairAddress)) {
			const error = new Error("Invalid pair address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		const params = new URLSearchParams({ token: tokenAddress });
		if (pairAddress) {
			params.append("pair", pairAddress);
		}
		if (chainId || this.defaultChainId !== 56) {
			params.append(
				"chainId",
				(chainId || this.defaultChainId).toString()
			);
		}

		return this.request<AggregatedPrice>(`/price?${params.toString()}`);
	}

	/**
	 * Get prices for multiple tokens
	 */
	async getMultiplePrices(
		requests: PriceRequest[]
	): Promise<ApiResponse<AggregatedPrice[]>> {
		if (!Array.isArray(requests) || requests.length === 0) {
			const error = new Error("Requests must be a non-empty array");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		// Validate all requests
		for (const request of requests) {
			if (
				!request.tokenAddress ||
				!this.isValidAddress(request.tokenAddress)
			) {
				const error = new Error(
					"Each request must have a valid tokenAddress"
				);
				if (this.throwOnError) throw error;
				return {
					success: false,
					status: 400,
					error: {
						error: "ValidationError",
						message: error.message
					}
				};
			}

			if (
				request.pairAddress &&
				!this.isValidAddress(request.pairAddress)
			) {
				const error = new Error(
					"Invalid pair address format in request"
				);
				if (this.throwOnError) throw error;
				return {
					success: false,
					status: 400,
					error: {
						error: "ValidationError",
						message: error.message
					}
				};
			}
		}

		return this.request<AggregatedPrice[]>("/prices", {
			method: "POST",
			body: JSON.stringify(requests)
		});
	}

	/**
	 * Get list of configured DEXes
	 */
	async getDexes(): Promise<ApiResponse<DexesResponse>> {
		return this.request<DexesResponse>("/dexes");
	}

	/**
	 * Clear the API cache
	 */
	async clearCache(): Promise<ApiResponse<{ message: string }>> {
		return this.request<{ message: string }>("/cache/clear", {
			method: "POST"
		});
	}

	/**
	 * Get token information including metadata and pricing
	 */
	async getTokenInfo(
		tokenAddress: string
	): Promise<ApiResponse<TokenMetadata>> {
		if (!this.isValidAddress(tokenAddress)) {
			const error = new Error("Invalid token address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		const params = new URLSearchParams({ ca: tokenAddress });
		return this.request<TokenMetadata>(`/token-info?${params.toString()}`);
	}

	/**
	 * Get token metadata (alias for getTokenInfo for backward compatibility)
	 */
	async getTokenMetadata(
		tokenAddress: string
	): Promise<ApiResponse<TokenMetadata>> {
		return this.getTokenInfo(tokenAddress);
	}

	/**
	 * Get oracle information (wBNB/USD price)
	 */
	async getOracle(): Promise<ApiResponse<OracleResponse>> {
		return this.request<OracleResponse>("/oracle");
	}

	/**
	 * Get supported chains information
	 */
	async getChains(): Promise<ApiResponse<ChainsResponse>> {
		return this.request<ChainsResponse>("/chains");
	}

	/**
	 * Get price for a token on Base chain (convenience method)
	 */
	async getPriceBase(
		tokenAddress: string,
		pairAddress?: string
	): Promise<ApiResponse<AggregatedPrice>> {
		if (!this.isValidAddress(tokenAddress)) {
			const error = new Error("Invalid token address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		if (pairAddress && !this.isValidAddress(pairAddress)) {
			const error = new Error("Invalid pair address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		const params = new URLSearchParams({ token: tokenAddress });
		if (pairAddress) {
			params.append("pair", pairAddress);
		}

		return this.request<AggregatedPrice>(
			`/price/base?${params.toString()}`
		);
	}

	/**
	 * Get price for a token on BSC chain (convenience method)
	 */
	async getPriceBSC(
		tokenAddress: string,
		pairAddress?: string
	): Promise<ApiResponse<AggregatedPrice>> {
		if (!this.isValidAddress(tokenAddress)) {
			const error = new Error("Invalid token address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		if (pairAddress && !this.isValidAddress(pairAddress)) {
			const error = new Error("Invalid pair address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		const params = new URLSearchParams({ token: tokenAddress });
		if (pairAddress) {
			params.append("pair", pairAddress);
		}

		return this.request<AggregatedPrice>(`/price/bsc?${params.toString()}`);
	}

	/**
	 * Get price history for a token (Note: This endpoint is not currently implemented in the API)
	 */
	async getPriceHistory(
		tokenAddress: string,
		interval: string = "1h",
		from?: number,
		to?: number
	): Promise<ApiResponse<PriceHistory>> {
		if (!this.isValidAddress(tokenAddress)) {
			const error = new Error("Invalid token address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		// Note: This endpoint is not implemented in the current API
		// Keeping for future compatibility
		const params = new URLSearchParams({ interval });
		if (from) params.append("from", from.toString());
		if (to) params.append("to", to.toString());

		return this.request<PriceHistory>(
			`/token/${tokenAddress}/history?${params.toString()}`
		);
	}

	/**
	 * Get price comparison across different DEXes (Note: This endpoint is not currently implemented in the API)
	 */
	async getPriceComparison(
		tokenAddress: string
	): Promise<ApiResponse<PriceComparison>> {
		if (!this.isValidAddress(tokenAddress)) {
			const error = new Error("Invalid token address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		// Note: This endpoint is not implemented in the current API
		// Keeping for future compatibility
		return this.request<PriceComparison>(
			`/token/${tokenAddress}/comparison`
		);
	}

	/**
	 * Create a price alert (Note: This endpoint is not currently implemented in the API)
	 */
	async createPriceAlert(
		tokenAddress: string,
		targetPrice: string,
		condition: "above" | "below"
	): Promise<ApiResponse<PriceAlert>> {
		if (!this.isValidAddress(tokenAddress)) {
			const error = new Error("Invalid token address format");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		// Note: This endpoint is not implemented in the current API
		// Keeping for future compatibility
		return this.request<PriceAlert>("/alerts", {
			method: "POST",
			body: JSON.stringify({
				tokenAddress,
				targetPrice,
				condition
			})
		});
	}

	/**
	 * Get active price alerts (Note: This endpoint is not currently implemented in the API)
	 */
	async getPriceAlerts(): Promise<ApiResponse<PriceAlert[]>> {
		// Note: This endpoint is not implemented in the current API
		// Keeping for future compatibility
		return this.request<PriceAlert[]>("/alerts");
	}

	/**
	 * Delete a price alert (Note: This endpoint is not currently implemented in the API)
	 */
	async deletePriceAlert(
		alertId: string
	): Promise<ApiResponse<{ message: string }>> {
		// Note: This endpoint is not implemented in the current API
		// Keeping for future compatibility
		return this.request<{ message: string }>(`/alerts/${alertId}`, {
			method: "DELETE"
		});
	}

	/**
	 * Start streaming price updates for tokens
	 */
	startPriceStream(
		options: StreamOptions,
		onUpdate: (update: PriceStream) => void,
		onError?: (error: Error) => void
	): string {
		const streamId = `stream_${Date.now()}_${Math.random()
			.toString(36)
			.substr(2, 9)}`;
		const interval = options.interval || 5000; // Default 5 seconds

		const poll = async () => {
			try {
				const requests = options.tokenAddresses.map((address) => ({
					tokenAddress: address
				}));
				const response = await this.getMultiplePrices(requests);

				if (response.success && response.data) {
					response.data.forEach((aggregatedPrice) => {
						const bestPrice = this.getBestPrice(aggregatedPrice);
						if (bestPrice) {
							const update: PriceStream = {
								tokenAddress: aggregatedPrice.tokenAddress,
								price: bestPrice.price,
								priceUSD: bestPrice.priceUSD,
								timestamp: Date.now()
							};
							onUpdate(update);
						}
					});
				}
			} catch (error) {
				if (onError) {
					onError(error as Error);
				}
			}
		};

		// Start polling
		const intervalId = setInterval(poll, interval);
		this.activeStreams.set(streamId, intervalId);

		// Do initial poll
		poll();

		return streamId;
	}

	/**
	 * Stop a price stream
	 */
	stopPriceStream(streamId: string): boolean {
		const intervalId = this.activeStreams.get(streamId);
		if (intervalId) {
			clearInterval(intervalId);
			this.activeStreams.delete(streamId);
			return true;
		}
		return false;
	}

	/**
	 * Stop all active price streams
	 */
	stopAllPriceStreams(): void {
		this.activeStreams.forEach((intervalId) => {
			clearInterval(intervalId);
		});
		this.activeStreams.clear();
	}

	/**
	 * Get portfolio value for multiple tokens (Note: This endpoint is not currently implemented in the API)
	 */
	async getPortfolioValue(
		holdings: Array<{ tokenAddress: string; amount: string }>
	): Promise<
		ApiResponse<{
			totalValueUSD: string;
			positions: Array<{
				tokenAddress: string;
				amount: string;
				valueUSD: string;
				price: string;
			}>;
		}>
	> {
		if (!Array.isArray(holdings) || holdings.length === 0) {
			const error = new Error("Holdings must be a non-empty array");
			if (this.throwOnError) throw error;
			return {
				success: false,
				status: 400,
				error: {
					error: "ValidationError",
					message: error.message
				}
			};
		}

		// Validate all holdings
		for (const holding of holdings) {
			if (
				!holding.tokenAddress ||
				!this.isValidAddress(holding.tokenAddress)
			) {
				const error = new Error(
					"Each holding must have a valid tokenAddress"
				);
				if (this.throwOnError) throw error;
				return {
					success: false,
					status: 400,
					error: {
						error: "ValidationError",
						message: error.message
					}
				};
			}
		}

		// Note: This endpoint is not implemented in the current API
		// Keeping for future compatibility
		return this.request<{
			totalValueUSD: string;
			positions: Array<{
				tokenAddress: string;
				amount: string;
				valueUSD: string;
				price: string;
			}>;
		}>("/portfolio/value", {
			method: "POST",
			body: JSON.stringify({ holdings })
		});
	}

	/**
	 * Validate Ethereum address format
	 */
	private isValidAddress(address: string): boolean {
		return /^0x[a-fA-F0-9]{40}$/.test(address);
	}

	/**
	 * Utility method to get just the data from a response, throwing on error
	 */
	async getPriceData(
		tokenAddress: string,
		pairAddress?: string,
		chainId?: number
	): Promise<AggregatedPrice> {
		const response = await this.getPrice(
			tokenAddress,
			pairAddress,
			chainId
		);
		if (!response.success) {
			throw new Error(response.error?.message || "Unknown error");
		}
		return response.data!;
	}

	/**
	 * Utility method to get oracle data
	 */
	async getOracleData(): Promise<OracleResponse> {
		const response = await this.getOracle();
		if (!response.success) {
			throw new Error(response.error?.message || "Unknown error");
		}
		return response.data!;
	}

	/**
	 * Utility method to get chains data
	 */
	async getChainsData(): Promise<ChainsResponse> {
		const response = await this.getChains();
		if (!response.success) {
			throw new Error(response.error?.message || "Unknown error");
		}
		return response.data!;
	}

	/**
	 * Utility method to get token info data
	 */
	async getTokenInfoData(tokenAddress: string): Promise<TokenMetadata> {
		const response = await this.getTokenInfo(tokenAddress);
		if (!response.success) {
			throw new Error(response.error?.message || "Unknown error");
		}
		return response.data!;
	}

	/**
	 * Utility method to get Base chain price data
	 */
	async getPriceBaseData(
		tokenAddress: string,
		pairAddress?: string
	): Promise<AggregatedPrice> {
		const response = await this.getPriceBase(tokenAddress, pairAddress);
		if (!response.success) {
			throw new Error(response.error?.message || "Unknown error");
		}
		return response.data!;
	}

	/**
	 * Utility method to get BSC chain price data
	 */
	async getPriceBSCData(
		tokenAddress: string,
		pairAddress?: string
	): Promise<AggregatedPrice> {
		const response = await this.getPriceBSC(tokenAddress, pairAddress);
		if (!response.success) {
			throw new Error(response.error?.message || "Unknown error");
		}
		return response.data!;
	}

	/**
	 * Utility method to get just the data from multiple prices request
	 */
	async getMultiplePricesData(
		requests: PriceRequest[]
	): Promise<AggregatedPrice[]> {
		const response = await this.getMultiplePrices(requests);
		if (!response.success) {
			throw new Error(response.error?.message || "Unknown error");
		}
		return response.data!;
	}

	/**
	 * Utility method to get health data
	 */
	async getHealthData(): Promise<HealthResponse> {
		const response = await this.getHealth();
		if (!response.success) {
			throw new Error(response.error?.message || "Unknown error");
		}
		return response.data!;
	}

	/**
	 * Utility method to get DEXes data
	 */
	async getDexesData(): Promise<DexesResponse> {
		const response = await this.getDexes();
		if (!response.success) {
			throw new Error(response.error?.message || "Unknown error");
		}
		return response.data!;
	}

	/**
	 * Batch price fetching with concurrent processing
	 */
	async getPricesBatch(
		tokenAddresses: string[],
		batchSize: number = 10
	): Promise<Map<string, AggregatedPrice>> {
		const results = new Map<string, AggregatedPrice>();
		const batches: string[][] = [];

		// Split into batches
		for (let i = 0; i < tokenAddresses.length; i += batchSize) {
			batches.push(tokenAddresses.slice(i, i + batchSize));
		}

		// Process batches concurrently
		for (const batch of batches) {
			const requests = batch.map((address) => ({
				tokenAddress: address
			}));

			try {
				const batchResults = await this.getMultiplePricesData(requests);
				batchResults.forEach((result) => {
					results.set(result.tokenAddress, result);
				});
			} catch (error) {
				console.warn("Batch processing failed:", error);
				// Fallback to individual requests for this batch
				await Promise.allSettled(
					batch.map(async (address) => {
						try {
							const result = await this.getPriceData(address);
							results.set(address, result);
						} catch (err) {
							console.warn(
								`Failed to fetch price for ${address}:`,
								err
							);
						}
					})
				);
			}

			// Small delay between batches to avoid overwhelming the API
			if (batches.indexOf(batch) < batches.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		return results;
	}

	/**
	 * Get the best price from aggregated data
	 */
	getBestPrice(aggregatedPrice: AggregatedPrice): PriceData | null {
		return aggregatedPrice.bestPrice || null;
	}

	/**
	 * Get successful prices only
	 */
	getSuccessfulPrices(aggregatedPrice: AggregatedPrice): PriceData[] {
		return aggregatedPrice.prices.filter(
			(price) => price.success && parseFloat(price.price) > 0
		);
	}

	/**
	 * Calculate weighted average price based on DEX reliability
	 */
	calculateWeightedAverage(
		prices: PriceData[],
		weights?: Record<string, number>
	): string {
		const successfulPrices = prices.filter(
			(p) => p.success && parseFloat(p.price) > 0
		);

		if (successfulPrices.length === 0) return "0";

		const defaultWeights: Record<string, number> = {
			"PancakeSwap V2": 1.0,
			"PancakeSwap V3": 1.0,
			"Uniswap V2": 0.9,
			"Uniswap V3": 0.9,
			Thena: 0.8,
			"Four Meme": 0.6
		};

		const combinedWeights = { ...defaultWeights, ...weights };

		let weightedSum = 0;
		let totalWeight = 0;

		successfulPrices.forEach((price) => {
			const weight = combinedWeights[price.dex] || 0.5;
			weightedSum += parseFloat(price.price) * weight;
			totalWeight += weight;
		});

		return totalWeight > 0 ? (weightedSum / totalWeight).toString() : "0";
	}

	/**
	 * Calculate price statistics for aggregated data
	 */
	calculatePriceStatistics(aggregatedPrice: AggregatedPrice): {
		min: string;
		max: string;
		median: string;
		standardDeviation: string;
		variance: string;
	} {
		const successfulPrices = this.getSuccessfulPrices(aggregatedPrice);
		const prices = successfulPrices.map((p) => parseFloat(p.price));

		if (prices.length === 0) {
			return {
				min: "0",
				max: "0",
				median: "0",
				standardDeviation: "0",
				variance: "0"
			};
		}

		const sorted = [...prices].sort((a, b) => a - b);
		const min = sorted[0] ?? 0;
		const max = sorted[sorted.length - 1] ?? 0;

		let median: number;
		if (sorted.length % 2 === 0) {
			const mid1 = sorted[sorted.length / 2 - 1] ?? 0;
			const mid2 = sorted[sorted.length / 2] ?? 0;
			median = (mid1 + mid2) / 2;
		} else {
			median = sorted[Math.floor(sorted.length / 2)] ?? 0;
		}

		const mean =
			prices.reduce((sum, price) => sum + price, 0) / prices.length;
		const variance =
			prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) /
			prices.length;
		const standardDeviation = Math.sqrt(variance);

		return {
			min: min.toString(),
			max: max.toString(),
			median: median.toString(),
			standardDeviation: standardDeviation.toString(),
			variance: variance.toString()
		};
	}

	/**
	 * Find arbitrage opportunities between DEXes
	 */
	findArbitrageOpportunities(aggregatedPrice: AggregatedPrice): Array<{
		buyFrom: string;
		sellTo: string;
		profit: string;
		profitPercent: number;
	}> {
		const successfulPrices = this.getSuccessfulPrices(aggregatedPrice);
		const opportunities: Array<{
			buyFrom: string;
			sellTo: string;
			profit: string;
			profitPercent: number;
		}> = [];

		for (let i = 0; i < successfulPrices.length; i++) {
			for (let j = i + 1; j < successfulPrices.length; j++) {
				const priceData1 = successfulPrices[i];
				const priceData2 = successfulPrices[j];

				if (!priceData1 || !priceData2) continue;

				const price1 = parseFloat(priceData1.price);
				const price2 = parseFloat(priceData2.price);

				if (price1 !== price2) {
					const buyPrice = Math.min(price1, price2);
					const sellPrice = Math.max(price1, price2);
					const profit = sellPrice - buyPrice;
					const profitPercent = (profit / buyPrice) * 100;

					// Only include opportunities with > 0.1% profit to account for fees
					if (profitPercent > 0.1) {
						const buyDex =
							price1 < price2 ? priceData1.dex : priceData2.dex;
						const sellDex =
							price1 > price2 ? priceData1.dex : priceData2.dex;

						opportunities.push({
							buyFrom: buyDex,
							sellTo: sellDex,
							profit: profit.toString(),
							profitPercent
						});
					}
				}
			}
		}

		return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
	}

	/**
	 * Get cache statistics
	 */
	getCacheStatistics(): {
		size: number;
		entries: Array<{ key: string; timestamp: number; age: number }>;
	} {
		const entries: Array<{ key: string; timestamp: number; age: number }> =
			[];
		const now = Date.now();

		this.cache.forEach((value, key) => {
			entries.push({
				key,
				timestamp: value.timestamp,
				age: now - value.timestamp
			});
		});

		return {
			size: this.cache.size,
			entries: entries.sort((a, b) => b.timestamp - a.timestamp)
		};
	}

	/**
	 * Validate multiple addresses at once
	 */
	validateAddresses(addresses: string[]): {
		valid: string[];
		invalid: string[];
	} {
		const valid: string[] = [];
		const invalid: string[] = [];

		addresses.forEach((address) => {
			if (this.isValidAddress(address)) {
				valid.push(address);
			} else {
				invalid.push(address);
			}
		});

		return { valid, invalid };
	}

	/**
	 * Format price with appropriate decimal places
	 */
	formatPrice(price: string, decimals: number = 6): string {
		const num = parseFloat(price);
		if (isNaN(num)) return "0";

		if (num === 0) return "0";
		if (num < 0.000001) return num.toExponential(2);
		if (num < 1) return num.toFixed(decimals);
		if (num < 1000) return num.toFixed(4);

		return num.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	/**
	 * Calculate percentage change between two prices
	 */
	calculatePriceChange(
		oldPrice: string,
		newPrice: string
	): {
		absolute: string;
		percentage: number;
	} {
		const old = parseFloat(oldPrice);
		const current = parseFloat(newPrice);

		if (isNaN(old) || isNaN(current) || old === 0) {
			return { absolute: "0", percentage: 0 };
		}

		const absolute = current - old;
		const percentage = (absolute / old) * 100;

		return {
			absolute: absolute.toString(),
			percentage
		};
	}

	/**
	 * Clean up resources and stop all active streams
	 */
	destroy(): void {
		this.stopAllPriceStreams();
		this.clearClientCache();
	}
}

/**
 * Factory function to create a client instance
 */
export function createLemonSpotPriceClient(
	options: ClientOptions
): LemonSpotPriceClient {
	return new LemonSpotPriceClient(options);
}

/**
 * Convenience function for quick price lookups
 */
export async function getTokenPrice(
	baseUrl: string,
	tokenAddress: string,
	pairAddress?: string,
	chainId?: number
): Promise<AggregatedPrice> {
	const client = new LemonSpotPriceClient({ baseUrl });
	return client.getPriceData(tokenAddress, pairAddress, chainId);
}

/**
 * Convenience function for getting multiple token prices
 */
export async function getMultipleTokenPrices(
	baseUrl: string,
	tokenAddresses: string[],
	chainId?: number
): Promise<AggregatedPrice[]> {
	const client = new LemonSpotPriceClient({ baseUrl });
	const requests = tokenAddresses.map((address) => ({
		tokenAddress: address,
		chainId
	}));
	return client.getMultiplePricesData(requests);
}

/**
 * Convenience function for price comparison (Note: Not currently implemented in API)
 */
export async function compareTokenPrices(
	baseUrl: string,
	tokenAddress: string
): Promise<PriceComparison> {
	const client = new LemonSpotPriceClient({ baseUrl });
	const response = await client.getPriceComparison(tokenAddress);
	if (!response.success) {
		throw new Error(
			response.error?.message || "Failed to get price comparison"
		);
	}
	return response.data!;
}

/**
 * Convenience function for getting token information
 */
export async function getTokenInfo(
	baseUrl: string,
	tokenAddress: string
): Promise<TokenMetadata> {
	const client = new LemonSpotPriceClient({ baseUrl });
	return client.getTokenInfoData(tokenAddress);
}

/**
 * Convenience function for getting token metadata (alias for getTokenInfo)
 */
export async function getTokenMetadata(
	baseUrl: string,
	tokenAddress: string
): Promise<TokenMetadata> {
	return getTokenInfo(baseUrl, tokenAddress);
}

/**
 * Convenience function for getting oracle data
 */
export async function getOracle(baseUrl: string): Promise<OracleResponse> {
	const client = new LemonSpotPriceClient({ baseUrl });
	return client.getOracleData();
}

/**
 * Convenience function for getting supported chains
 */
export async function getSupportedChains(
	baseUrl: string
): Promise<ChainsResponse> {
	const client = new LemonSpotPriceClient({ baseUrl });
	return client.getChainsData();
}

/**
 * Convenience function for getting Base chain price
 */
export async function getTokenPriceBase(
	baseUrl: string,
	tokenAddress: string,
	pairAddress?: string
): Promise<AggregatedPrice> {
	const client = new LemonSpotPriceClient({ baseUrl });
	return client.getPriceBaseData(tokenAddress, pairAddress);
}

/**
 * Convenience function for getting BSC chain price
 */
export async function getTokenPriceBSC(
	baseUrl: string,
	tokenAddress: string,
	pairAddress?: string
): Promise<AggregatedPrice> {
	const client = new LemonSpotPriceClient({ baseUrl });
	return client.getPriceBSCData(tokenAddress, pairAddress);
}

// Default export
export default LemonSpotPriceClient;
