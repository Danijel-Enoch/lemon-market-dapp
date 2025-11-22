// GraphQL service for fetching virtual market data
import { parseLiquidityWith6Decimals } from "./virtual-markets-utils";
import fetchWithTimeout from "./fetch-with-timeout";
export interface VirtualMarket {
	id: string;
	marketId: string;
	realLiquidity: string;
	totalLiquidity: string;
	virtualLiquidity: string;
	lastTransactionHash: string;
	lastBlockTimestamp: string;
	lastBlockNumber: string;
	exists: boolean;
	durationFeeRate: string;
	createdTimestamp: string;
}

interface GraphQLResponse {
	data?: {
		virtualMarkets: VirtualMarket[];
	};
	errors?: Array<{
		message: string;
	}>;
}

// GraphQL query to fetch all virtual markets
const ALL_VIRTUAL_MARKETS_QUERY = `
  query AllVirtualMarkets {
    virtualMarkets {
      marketId
      realLiquidity
      totalLiquidity
      virtualLiquidity
      lastTransactionHash
      lastBlockTimestamp
      lastBlockNumber
      id
      exists
      durationFeeRate
      createdTimestamp
    }
  }
`;

// GraphQL query to fetch virtual market by marketId
const VIRTUAL_MARKET_BY_ID_QUERY = `
  query VirtualMarketById($marketId: String!) {
    virtualMarkets(where: {marketId: $marketId}) {
      marketId
      realLiquidity
      totalLiquidity
      virtualLiquidity
      lastTransactionHash
      lastBlockTimestamp
      lastBlockNumber
      id
      exists
      durationFeeRate
      createdTimestamp
    }
  }
`;

class VirtualMarketsService {
	private subgraphUrl: string;

	constructor() {
		this.subgraphUrl = process.env.SUBGRAPH_URL || "";
	}

	// Cache for markets to avoid repeated GraphQL requests in short time
	private marketCache: {
		map: Map<string, VirtualMarket>;
		fetchedAt: number;
	} | null = null;

	private marketCacheTTLMs = Number(process.env.VIRTUAL_MARKETS_CACHE_TTL_MS || 60000);

	private async makeGraphQLRequest(
		query: string,
		variables?: Record<string, unknown>,
	): Promise<GraphQLResponse> {
		const response = await fetchWithTimeout(this.subgraphUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer 7d3c97e52a57d84a7a12d456559b745b",
			},
			body: JSON.stringify({
				query,
				variables,
			}),
		}, Number(process.env.SUBGRAPH_FETCH_TIMEOUT_MS || 6000));

		if (!response.ok) {
			throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
		}

		return await response.json();
	}

	async getAllVirtualMarkets(): Promise<VirtualMarket[]> {
		try {
			const result = await this.makeGraphQLRequest(ALL_VIRTUAL_MARKETS_QUERY);

			if (result.errors && result.errors.length > 0) {
				throw new Error(`GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
			}

			return result.data?.virtualMarkets || [];
		} catch (_error) {
			return [];
		}
	}

	async getVirtualMarketById(marketId: string): Promise<VirtualMarket | null> {
		try {
			const result = await this.makeGraphQLRequest(VIRTUAL_MARKET_BY_ID_QUERY, { marketId });

			if (result.errors && result.errors.length > 0) {
				throw new Error(`GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
			}

			const markets = result.data?.virtualMarkets || [];
			return markets.length > 0 ? markets[0] : null;
		} catch (_error) {
			return null;
		}
	}

	/**
	 * Create a market lookup map for efficient token-to-market matching
	 * @param tokenSymbols Array of token symbols to create lookup for
	 * @returns Map of token symbol to virtual market data
	 */
	async createMarketLookupMap(_tokenSymbols: string[]): Promise<Map<string, VirtualMarket>> {
		// Return cached map if still valid
		const now = Date.now();
		if (this.marketCache && now - this.marketCache.fetchedAt < this.marketCacheTTLMs) {
			return new Map(this.marketCache.map);
		}

		const markets = await this.getAllVirtualMarkets();
		const marketMap = new Map<string, VirtualMarket>();
		// Create a lookup map - marketId corresponds to token symbol
		markets.forEach((market) => {
			// Normalize symbols to uppercase for consistent matching
			const normalizedMarketId = market.marketId.toUpperCase();
			marketMap.set(normalizedMarketId, market);
		});

		// Update cache
		this.marketCache = { map: new Map(marketMap), fetchedAt: Date.now() };

		return marketMap;
	}

	/**
	 * Get total liquidity for a token symbol (parsed with 6 decimal precision)
	 * Returns 0 if no market exists for the token
	 */
	async getTotalLiquidityForToken(tokenSymbol: string): Promise<number> {
		const market = await this.getVirtualMarketById(tokenSymbol.toUpperCase());
		return market ? parseLiquidityWith6Decimals(market.totalLiquidity) : 0;
	}

	/**
	 * Get real liquidity (total open interest) for a token symbol (parsed with 6 decimal precision)
	 * Returns 0 if no market exists for the token
	 */
	async getRealLiquidityForToken(tokenSymbol: string): Promise<number> {
		const market = await this.getVirtualMarketById(tokenSymbol.toUpperCase());
		return market ? parseLiquidityWith6Decimals(market.realLiquidity) : 0;
	}
}

// Export singleton instance
export const virtualMarketsService = new VirtualMarketsService();

// Export helper functions for convenience
export async function getAllVirtualMarkets(): Promise<VirtualMarket[]> {
	return virtualMarketsService.getAllVirtualMarkets();
}

export async function getVirtualMarketById(marketId: string): Promise<VirtualMarket | null> {
	return virtualMarketsService.getVirtualMarketById(marketId);
}

export async function createMarketLookupMap(
	tokenSymbols: string[],
): Promise<Map<string, VirtualMarket>> {
	return virtualMarketsService.createMarketLookupMap(tokenSymbols);
}

export async function getTotalLiquidityForToken(tokenSymbol: string): Promise<number> {
	return virtualMarketsService.getTotalLiquidityForToken(tokenSymbol);
}

export async function getRealLiquidityForToken(tokenSymbol: string): Promise<number> {
	return virtualMarketsService.getRealLiquidityForToken(tokenSymbol);
}
