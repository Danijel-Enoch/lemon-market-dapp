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
	console.log("=== Testing Direct GraphQL Query ===");
	console.log("Subgraph URL:", SUBGRAPH_URL);

	try {
		// Test all virtual markets query
		console.log("\n1. Testing getAllVirtualMarkets query...");
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
			console.error("GraphQL errors:", result.errors);
			return false;
		}

		const markets = result.data?.virtualMarkets || [];
		console.log(`Found ${markets.length} virtual markets`);

		if (markets.length > 0) {
			console.log("Sample market:", JSON.stringify(markets[0], null, 2));

			// Test specific market query with the first market ID
			console.log("\n2. Testing getVirtualMarketById query...");
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
					console.error("GraphQL errors for specific query:", specificResult.errors);
				} else {
					console.log("Specific market query successful");
					console.log("Result:", JSON.stringify(specificResult.data, null, 2));
				}
			}
		} else {
			console.log("No virtual markets found in subgraph");
		}

		return true;
	} catch (error) {
		console.error("Direct GraphQL test failed:", error);
		return false;
	}
}

async function testVirtualMarketsAPI() {
	console.log("\n=== Testing Virtual Markets API ===");

	try {
		// Test GET all virtual markets
		console.log("\n1. Testing GET /api/virtual-markets...");
		const response = await fetch(`${API_BASE_URL}/api/virtual-markets`);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();
		console.log(`API returned ${result.data.length} virtual markets`);

		if (result.data.length > 0) {
			console.log("Sample market from API:", JSON.stringify(result.data[0], null, 2));

			// Test GET specific virtual market
			console.log("\n2. Testing GET /api/virtual-markets with marketId...");
			const marketId = result.data[0].marketId;
			const specificResponse = await fetch(
				`${API_BASE_URL}/api/virtual-markets?marketId=${marketId}`,
			);

			if (specificResponse.ok) {
				const specificResult = await specificResponse.json();
				console.log("Specific market API query successful");
				console.log("Result:", JSON.stringify(specificResult.data, null, 2));
			}

			// Test POST batch lookup
			console.log("\n3. Testing POST /api/virtual-markets batch lookup...");
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
				const batchResult = await batchResponse.json();
				console.log("Batch lookup successful");
				console.log("Result:", JSON.stringify(batchResult.data, null, 2));
			}
		}

		return true;
	} catch (error) {
		console.error("Virtual Markets API test failed:", error);
		return false;
	}
}

async function testTrendingTokensWithVirtualMarkets() {
	console.log("\n=== Testing Enhanced Trending Tokens API ===");

	try {
		console.log("\nTesting GET /api/trending/tokens with virtual market data...");
		const response = await fetch(`${API_BASE_URL}/api/trending/tokens`);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();
		console.log(`Trending tokens API returned ${result.data.length} tokens`);

		if (result.data.length > 0) {
			const sampleToken = result.data[0];
			console.log("Sample token with virtual market data:");
			console.log(JSON.stringify(sampleToken, null, 2));

			// Check if virtual market fields are present
			const tokensWithMarkets = result.data.filter((token) => token.hasMarket);
			console.log(
				`\nTokens with virtual markets: ${tokensWithMarkets.length}/${result.data.length}`,
			);

			if (tokensWithMarkets.length > 0) {
				console.log("Sample token with virtual market:");
				console.log(JSON.stringify(tokensWithMarkets[0], null, 2));
			}

			// Show virtual market statistics
			const totalLiquiditySum = result.data.reduce((sum, token) => {
				const liquidity = parseFloat(token.totalLiquidity?.replace(/[^0-9.-]/g, "") || "0");
				return sum + liquidity;
			}, 0);

			console.log(`\nTotal liquidity across all tokens: $${totalLiquiditySum.toFixed(2)}M`);
		}

		return true;
	} catch (error) {
		console.error("Enhanced trending tokens test failed:", error);
		return false;
	}
}

async function runAllTests() {
	console.log("🧪 Starting Virtual Markets Integration Tests");
	console.log("=".repeat(50));

	const tests = [
		{ name: "Direct GraphQL", fn: testDirectGraphQL },
		{ name: "Virtual Markets API", fn: testVirtualMarketsAPI },
		{ name: "Enhanced Trending Tokens", fn: testTrendingTokensWithVirtualMarkets },
	];

	const results = [];

	for (const test of tests) {
		try {
			console.log(`\n🚀 Running ${test.name} test...`);
			const success = await test.fn();
			results.push({ name: test.name, success });
			console.log(`${success ? "✅" : "❌"} ${test.name} test ${success ? "passed" : "failed"}`);
		} catch (error) {
			console.error(`❌ ${test.name} test failed with error:`, error);
			results.push({ name: test.name, success: false });
		}
	}

	console.log("\n" + "=".repeat(50));
	console.log("📊 Test Results Summary:");
	results.forEach((result) => {
		console.log(`${result.success ? "✅" : "❌"} ${result.name}`);
	});

	const passedTests = results.filter((r) => r.success).length;
	console.log(`\n${passedTests}/${results.length} tests passed`);

	if (passedTests === results.length) {
		console.log("🎉 All tests passed! Virtual markets integration is working correctly.");
	} else {
		console.log("⚠️  Some tests failed. Check the errors above.");
		process.exit(1);
	}
}

// Run the tests
runAllTests().catch((error) => {
	console.error("Test runner failed:", error);
	process.exit(1);
});
