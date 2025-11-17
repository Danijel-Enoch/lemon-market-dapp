#!/usr/bin/env node

/**
 * Test script for Virtual Markets GraphQL integration
 * This script tests the virtual markets service and API endpoints
 */

const SUBGRAPH_URL = "http://localhost:8000/subgraphs/name/lemon";
const API_BASE_URL = "http://localhost:3000";

// GraphQL queries
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

async function testDirectGraphQL() {
	try {
		const response = await fetch(SUBGRAPH_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer 7d3c97e52a57d84a7a12d456559b745b",
			},
			body: JSON.stringify({
				query: ALL_VIRTUAL_MARKETS_QUERY,
			}),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();

		if (result.errors) {
			return false;
		}

		const markets = result.data?.virtualMarkets || [];

		if (markets.length > 0) {
			const specificResponse = await fetch(SUBGRAPH_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer 7d3c97e52a57d84a7a12d456559b745b",
				},
				body: JSON.stringify({
					query: VIRTUAL_MARKET_BY_ID_QUERY,
					variables: {
						marketId: markets[0].marketId,
					},
				}),
			});

			if (specificResponse.ok) {
				const specificResult = await specificResponse.json();
				if (specificResult.errors) {
				} else {
				}
			}
		} else {
		}

		return true;
	} catch (_error) {
		return false;
	}
}

async function testVirtualMarketsAPI() {
	try {
		const response = await fetch(`${API_BASE_URL}/api/virtual-markets`);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();

		if (result.data.length > 0) {
			const marketId = result.data[0].marketId;
			const specificResponse = await fetch(
				`${API_BASE_URL}/api/virtual-markets?marketId=${marketId}`,
			);

			if (specificResponse.ok) {
				const _specificResult = await specificResponse.json();
			}
			const batchResponse = await fetch(`${API_BASE_URL}/api/virtual-markets`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					tokenSymbols: [marketId, "ETH", "BTC", "NONEXISTENT"],
				}),
			});

			if (batchResponse.ok) {
				const _batchResult = await batchResponse.json();
			}
		}

		return true;
	} catch (_error) {
		return false;
	}
}

async function testTrendingTokensWithVirtualMarkets() {
	try {
		const response = await fetch(`${API_BASE_URL}/api/trending/tokens`);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();

		if (result.data.length > 0) {
			const _sampleToken = result.data[0];

			// Check if virtual market fields are present
			const tokensWithMarkets = result.data.filter((token) => token.hasMarket);

			if (tokensWithMarkets.length > 0) {
			}

			// Show virtual market statistics
			const _totalLiquiditySum = result.data.reduce((sum, token) => {
				const liquidity = parseFloat(token.totalLiquidity?.replace(/[^0-9.-]/g, "") || "0");
				return sum + liquidity;
			}, 0);
		}

		return true;
	} catch (_error) {
		return false;
	}
}

async function runAllTests() {
	const tests = [
		{ name: "Direct GraphQL", fn: testDirectGraphQL },
		{ name: "Virtual Markets API", fn: testVirtualMarketsAPI },
		{ name: "Enhanced Trending Tokens", fn: testTrendingTokensWithVirtualMarkets },
	];

	const results = [];

	for (const test of tests) {
		try {
			const success = await test.fn();
			results.push({ name: test.name, success });
		} catch (_error) {
			results.push({ name: test.name, success: false });
		}
	}
	results.forEach((_result) => {});

	const passedTests = results.filter((r) => r.success).length;

	if (passedTests === results.length) {
	} else {
		process.exit(1);
	}
}

// Run the tests
runAllTests().catch((_error) => {
	process.exit(1);
});
