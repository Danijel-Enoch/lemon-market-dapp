// GraphQL service for fetching virtual market data
import {
	normalizeAddress,
	extractTokenAddress,
	formatLiquidity,
	validateVirtualMarket,
	debugMarketLookup,
	parseLiquidityWith6Decimals,
} from "./virtual-markets-utils";
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
		this.subgraphUrl = process.env.SUBGRAPH_URL!!;
	}

	private async makeGraphQLRequest(query: string, variables?: any): Promise<GraphQLResponse> {
		try {
			const response = await fetch(this.subgraphUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer 7d3c97e52a57d84a7a12d456559b745b",
				},
				body: JSON.stringify({
					query,
					variables,
				}),
			});

			if (!response.ok) {
				throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
			}

			return await response.json();
		} catch (error) {
			console.error("Virtual markets GraphQL request failed:", error);
			throw error;
		}
	}

	async getAllVirtualMarkets(): Promise<VirtualMarket[]> {
		try {
			const result = await this.makeGraphQLRequest(ALL_VIRTUAL_MARKETS_QUERY);

			if (result.errors && result.errors.length > 0) {
				console.error("GraphQL errors:", result.errors);
				throw new Error(`GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
			}

			return result.data?.virtualMarkets || [];
		} catch (error) {
			console.error("Failed to fetch virtual markets:", error);
			return [];
		}
	}

	async getVirtualMarketById(marketId: string): Promise<VirtualMarket | null> {
		try {
			const result = await this.makeGraphQLRequest(VIRTUAL_MARKET_BY_ID_QUERY, { marketId });

			if (result.errors && result.errors.length > 0) {
				console.error("GraphQL errors:", result.errors);
				throw new Error(`GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
			}

			const markets = result.data?.virtualMarkets || [];
			return markets.length > 0 ? markets[0] : null;
		} catch (error) {
			console.error(`Failed to fetch virtual market for ID ${marketId}:`, error);
			return null;
		}
	}

	/**
	 * Create a market lookup map for efficient token-to-market matching
	 * @param tokenSymbols Array of token symbols to create lookup for
	 * @returns Map of token symbol to virtual market data
	 */
	async createMarketLookupMap(tokenSymbols: string[]): Promise<Map<string, VirtualMarket>> {
		const markets = await this.getAllVirtualMarkets();
		const marketMap = new Map<string, VirtualMarket>();

		console.log({ markets });
		// Create a lookup map - marketId corresponds to token symbol
		markets.forEach((market) => {
			// Normalize symbols to uppercase for consistent matching
			const normalizedMarketId = market.marketId.toUpperCase();
			marketMap.set(normalizedMarketId, market);
		});

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
