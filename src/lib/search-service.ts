/**
 * Search Service - Base Chain Only
 *
 * Integrates DexScreener and GeckoTerminal APIs to provide comprehensive search functionality
 * for Base chain tokens by address, pair address, or symbol.
 *
 * All search results are filtered to:
 * - Base chain only
 * - Supported DEXes only (BaseSwap, RocketSwap, SwapBased, DackieSwap, HorizonDex,
 *   SushiSwapV3, UniswapV2, UniswapV3, UniswapV4, VelocimeterV2, Aerodrome, Slipstream)
 */

// Types based on the provided API specifications
interface DexScreenerPair {
	chainId: string;
	dexId: string;
	url: string;
	pairAddress: string;
	labels?: string[];
	baseToken: {
		address: string;
		name: string;
		symbol: string;
	};
	quoteToken: {
		address: string;
		name: string;
		symbol: string;
	};
	priceNative: string;
	priceUsd: string;
	txns: {
		[key: string]: {
			buys: number;
			sells: number;
		};
	};
	volume: {
		[key: string]: number;
	};
	priceChange: {
		[key: string]: number;
	};
	liquidity: {
		usd: number;
		base: number;
		quote: number;
	};
	fdv: number;
	marketCap: number;
	pairCreatedAt: number;
	info?: {
		imageUrl?: string;
		websites?: Array<{ url: string }>;
		socials?: Array<{ platform: string; handle: string }>;
	};
	boosts?: {
		active: number;
	};
}

interface DexScreenerSearchResponse {
	schemaVersion: string;
	pairs: DexScreenerPair[];
}

interface GeckoTerminalPool {
	id: string;
	type: "pool";
	attributes: {
		base_token_price_usd: string;
		base_token_price_native_currency: string;
		quote_token_price_usd: string;
		quote_token_price_native_currency: string;
		base_token_price_quote_token: string;
		quote_token_price_base_token: string;
		address: string;
		name: string;
		pool_created_at: string;
		fdv_usd: string;
		market_cap_usd: string;
		price_change_percentage: {
			m5: string;
			m15: string;
			m30: string;
			h1: string;
			h6: string;
			h24: string;
		};
		transactions: {
			[timeframe: string]: {
				buys: number;
				sells: number;
				buyers: number;
				sellers: number;
			};
		};
		volume_usd: {
			[timeframe: string]: string;
		};
		reserve_in_usd: string;
	};
	relationships: {
		base_token: {
			data: {
				id: string;
				type: "token";
			};
		};
		quote_token: {
			data: {
				id: string;
				type: "token";
			};
		};
		dex: {
			data: {
				id: string;
				type: "dex";
			};
		};
	};
}

interface GeckoTerminalToken {
	id: string;
	type: "token";
	attributes: {
		address: string;
		name: string;
		symbol: string;
		decimals: number;
		image_url?: string;
		coingecko_coin_id?: string;
	};
}

interface GeckoTerminalSearchResponse {
	data: GeckoTerminalPool[];
	included?: GeckoTerminalToken[];
}

export interface SearchResult {
	id: string;
	symbol: string;
	name: string;
	tokenAddress: string;
	pairAddress: string;
	priceUsd: string;
	priceChange24h: string;
	volume24h: string;
	marketCap: string;
	liquidity: string;
	dex: string;
	chain: string;
	imageUrl?: string;
	source: "dexscreener" | "geckoterminal";
}

export class SearchService {
	private static instance: SearchService;
	private static readonly SUPPORTED_BASE_DEXES = [
		"uniswap",
		"pancakeswap",
		"sushiswap",
		"aerodrome",
		"baseswap",
		"alienbase",
		"swapbased",
		"velocimeter",
		"scale",
		"dackieswap",
		"throne_exchange",
		"synthswap",
		"citadel",
		"rocketswap",
		"usdfi",
		"openocean",
		"clipper",
		"solidly",
		"ramses",
		"equalizer",
		"velodrome",
		"chronos",
		"smardex",
		"quickswap",
		"zyberswap",
		"camelot",
		"trisolaris",
		"wannaswap",
		"mm_finance",
		"apeswap",
		"babyswap",
		"biswap",
		"mdex",
		"nomiswap",
		"jetswap",
		"spookyswap",
		"spiritswap",
		"paint",
		"honeyswap",
		"dfyn",
		"swapr",
		"elixir",
		"arbidex",
		"crowfi",
		"integral",
		"rubicon",
		"bancor",
		"kyberswap",
		"1inch",
		"paraswap",
		"0x",
		"matcha",
		"tokenlon",
		"airswap",
		"uniswap_v3",
		"uniswap_v2",
		"sushiswap_v2",
		"sushiswap_v3",
		"pancakeswap_v2",
		"pancakeswap_v3",
		"aerodrome_v2",
		"aerodrome_v3",
		"baseswap_v2",
		"baseswap_v3",
		"alienbase_v2",
		"alienbase_v3",
		"swapbased_v2",
		"swapbased_v3",
		"velocimeter_v2",
		"velocimeter_v3",
		"scale_v2",
		"scale_v3",
		"dackieswap_v2",
		"dackieswap_v3",
		"throne_exchange_v2",
		"throne_exchange_v3",
		"synthswap_v2",
		"synthswap_v3",
		"citadel_v2",
		"citadel_v3",
		"rocketswap_v2",
		"rocketswap_v3",
		"usdfi_v2",
		"usdfi_v3",
		"openocean_v2",
		"openocean_v3",
		"clipper_v2",
		"clipper_v3",
		"solidly_v2",
		"solidly_v3",
		"ramses_v2",
		"ramses_v3",
		"equalizer_v2",
		"equalizer_v3",
		"velodrome_v2",
		"velodrome_v3",
		"chronos_v2",
		"chronos_v3",
		"smardex_v2",
		"smardex_v3",
		"quickswap_v2",
		"quickswap_v3",
		"zyberswap_v2",
		"zyberswap_v3",
		"camelot_v2",
		"camelot_v3",
		"trisolaris_v2",
		"trisolaris_v3",
		"wannaswap_v2",
		"wannaswap_v3",
		"mm_finance_v2",
		"mm_finance_v3",
		"apeswap_v2",
		"apeswap_v3",
		"babyswap_v2",
		"babyswap_v3",
		"biswap_v2",
		"biswap_v3",
		"mdex_v2",
		"mdex_v3",
		"nomiswap_v2",
		"nomiswap_v3",
		"jetswap_v2",
		"jetswap_v3",
		"spookyswap_v2",
		"spookyswap_v3",
		"spiritswap_v2",
		"spiritswap_v3",
		"paint_v2",
		"paint_v3",
		"honeyswap_v2",
		"honeyswap_v3",
		"dfyn_v2",
		"dfyn_v3",
		"swapr_v2",
		"swapr_v3",
		"elixir_v2",
		"elixir_v3",
		"arbidex_v2",
		"arbidex_v3",
		"crowfi_v2",
		"crowfi_v3",
		"integral_v2",
		"integral_v3",
		"rubicon_v2",
		"rubicon_v3",
		"bancor_v2",
		"bancor_v3",
		"kyberswap_v2",
		"kyberswap_v3",
		"1inch_v2",
		"1inch_v3",
		"paraswap_v2",
		"paraswap_v3",
		"0x_v2",
		"0x_v3",
		"matcha_v2",
		"matcha_v3",
		"tokenlon_v2",
		"tokenlon_v3",
		"airswap_v2",
		"airswap_v3",
	];

	public static getInstance(): SearchService {
		if (!SearchService.instance) {
			SearchService.instance = new SearchService();
		}
		return SearchService.instance;
	}

	/**
	 * Search using DexScreener API - supports general text search
	 * Results are filtered to Base chain and supported DEXes only
	 */
	private async searchDexScreener(query: string): Promise<SearchResult[]> {
		try {
			const response = await fetch(
				`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
				{
					method: "GET",
					headers: {
						Accept: "*/*",
					},
				},
			);

			if (!response.ok) {
				return [];
			}

			const data: DexScreenerSearchResponse = await response.json();

			return (
				data.pairs
					?.filter((pair) => pair.chainId === "base") // Only Base chain results
					?.filter((pair) => this.isSupportedDex(pair.dexId)) // Only supported DEXes
					?.map((pair) => ({
						id: pair.pairAddress,
						symbol: pair.baseToken.symbol,
						name: pair.baseToken.name,
						tokenAddress: pair.baseToken.address,
						pairAddress: pair.pairAddress,
						priceUsd: pair.priceUsd,
						priceChange24h: pair.priceChange?.h24?.toString() || "0",
						volume24h: pair.volume?.h24?.toString() || "0",
						marketCap: pair.marketCap?.toString() || "0",
						liquidity: pair.liquidity?.usd?.toString() || "0",
						dex: pair.dexId,
						chain: pair.chainId,
						imageUrl: pair.info?.imageUrl,
						source: "dexscreener" as const,
					})) || []
			);
		} catch (_error) {
			return [];
		}
	}

	/**
	 * Search by token address using DexScreener
	 * Results are filtered to supported DEXes only
	 */
	private async searchByTokenAddress(
		address: string,
		chainId: string = "base",
	): Promise<SearchResult[]> {
		try {
			const response = await fetch(
				`https://api.dexscreener.com/latest/dex/tokens/${chainId}/${address}`,
				{
					method: "GET",
					headers: {
						Accept: "*/*",
					},
				},
			);

			if (!response.ok) {
				return [];
			}

			const data: DexScreenerPair[] = await response.json();

			return (
				data
					?.filter((pair) => this.isSupportedDex(pair.dexId)) // Only supported DEXes
					?.map((pair) => ({
						id: pair.pairAddress,
						symbol: pair.baseToken.symbol,
						name: pair.baseToken.name,
						tokenAddress: pair.baseToken.address,
						pairAddress: pair.pairAddress,
						priceUsd: pair.priceUsd,
						priceChange24h: pair.priceChange?.h24?.toString() || "0",
						volume24h: pair.volume?.h24?.toString() || "0",
						marketCap: pair.marketCap?.toString() || "0",
						liquidity: pair.liquidity?.usd?.toString() || "0",
						dex: pair.dexId,
						chain: pair.chainId,
						imageUrl: pair.info?.imageUrl,
						source: "dexscreener" as const,
					})) || []
			);
		} catch (_error) {
			return [];
		}
	}

	/**
	 * Search using GeckoTerminal API
	 * Results are filtered to supported DEXes only
	 */
	private async searchGeckoTerminal(
		query: string,
		network: string = "base",
	): Promise<SearchResult[]> {
		try {
			const response = await fetch(
				`https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(
					query,
				)}&network=${network}&include=base_token,quote_token,dex`,
				{
					method: "GET",
					headers: {
						Accept: "application/json",
					},
				},
			);

			if (!response.ok) {
				return [];
			}

			const data: GeckoTerminalSearchResponse = await response.json();

			// Create a map of included tokens for easy lookup
			const tokensMap = new Map<string, GeckoTerminalToken>();
			data.included?.forEach((item) => {
				if (item.type === "token") {
					tokensMap.set(item.id, item);
				}
			});

			return (
				data.data
					?.filter((pool) => this.isSupportedDex(pool.relationships.dex.data.id)) // Only supported DEXes
					?.map((pool) => {
						const baseToken = tokensMap.get(pool.relationships.base_token.data.id);

						return {
							id: pool.id,
							symbol: baseToken?.attributes.symbol || "Unknown",
							name: baseToken?.attributes.name || "Unknown Token",
							tokenAddress: baseToken?.attributes.address || "",
							pairAddress: pool.attributes.address,
							priceUsd: pool.attributes.base_token_price_usd,
							priceChange24h: pool.attributes.price_change_percentage.h24 || "0",
							volume24h: pool.attributes.volume_usd.h24 || "0",
							marketCap: pool.attributes.market_cap_usd,
							liquidity: pool.attributes.reserve_in_usd,
							dex: pool.relationships.dex.data.id,
							chain: network,
							imageUrl: baseToken?.attributes.image_url,
							source: "geckoterminal" as const,
						};
					}) || []
			);
		} catch (_error) {
			return [];
		}
	}

	/**
	 * Determine if query looks like an address (starts with 0x and is 40-42 chars)
	 */
	private isAddress(query: string): boolean {
		return query.startsWith("0x") && query.length >= 40 && query.length <= 42;
	}

	/**
	 * Check if a DEX is supported on Base chain
	 */
	private isSupportedDex(dexId: string): boolean {
		const normalizedDexId = dexId.toLowerCase().replace(/[-_\s]/g, "_");
		return SearchService.SUPPORTED_BASE_DEXES.some((supportedDex) => {
			const normalizedSupportedDex = supportedDex.toLowerCase().replace(/[-_\s]/g, "_");
			return (
				normalizedDexId === normalizedSupportedDex ||
				normalizedDexId.includes(normalizedSupportedDex) ||
				normalizedSupportedDex.includes(normalizedDexId)
			);
		});
	}

	/**
	 * Main search function that combines results from multiple sources
	 * All results are filtered to Base chain and supported DEXes only
	 */
	async search(query: string, chains: string[] = ["base"]): Promise<SearchResult[]> {
		if (!query || query.trim().length < 2) {
			return [];
		}

		const trimmedQuery = query.trim();
		const allResults: SearchResult[] = [];

		try {
			// If it looks like an address, search by address on multiple chains
			if (this.isAddress(trimmedQuery)) {
				const addressSearchPromises = chains.map((chain) =>
					this.searchByTokenAddress(trimmedQuery, chain),
				);

				const addressResults = await Promise.all(addressSearchPromises);
				allResults.push(...addressResults.flat());
			}

			// Always do general search with DexScreener (handles symbols and general text)
			// Results are filtered to Base chain only in searchDexScreener method
			const dexScreenerResults = await this.searchDexScreener(trimmedQuery);
			allResults.push(...dexScreenerResults);

			// Search with GeckoTerminal on Base network
			const geckoTerminalPromises = ["base"].map((network) =>
				this.searchGeckoTerminal(trimmedQuery, network),
			);

			const geckoResults = await Promise.all(geckoTerminalPromises);
			allResults.push(...geckoResults.flat());

			// Remove duplicates based on pair address and sort by liquidity
			const uniqueResults = this.removeDuplicates(allResults);

			// Filter to ensure all results are Base chain and supported DEXes only
			const baseOnlyResults = uniqueResults.filter(
				(result) => result.chain.toLowerCase() === "base" && this.isSupportedDex(result.dex),
			);

			// Sort by liquidity (highest first) and limit results
			return baseOnlyResults
				.sort((a, b) => parseFloat(b.liquidity) - parseFloat(a.liquidity))
				.slice(0, 20); // Limit to top 20 results
		} catch (_error) {
			return [];
		}
	}

	/**
	 * Remove duplicate results based on pair address
	 */
	private removeDuplicates(results: SearchResult[]): SearchResult[] {
		const seen = new Set<string>();
		return results.filter((result) => {
			const key = `${result.pairAddress}-${result.chain}`;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
	}
}

export const searchService = SearchService.getInstance();
