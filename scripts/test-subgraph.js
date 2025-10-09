#!/usr/bin/env node

/**
 * Simple script to test subgraph connectivity
 */

const SUBGRAPH_URL = "http://localhost:8000/subgraphs/name/lemon";
const TEST_ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

const POSITIONS_QUERY = `
  query GetPositions($trader: String!) {
    positions(where: {trader: $trader}) {
      entryPrice
      exitPrice
      finalPnl
      id
      isLong
      lastBlockNumber
      lastBlockTimestamp
      lastTransactionHash
      lastUpdatedAt
      leverage
      liquidationPrice
      trader
      tokenSymbol
      positionId
      openedAt
      margin
      status
    }
  }
`;

async function testSubgraph() {
	console.log("Testing subgraph connectivity...");
	console.log("Subgraph URL:", SUBGRAPH_URL);
	console.log("Test Address:", TEST_ADDRESS);
	console.log("");

	try {
		const response = await fetch(SUBGRAPH_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: POSITIONS_QUERY,
				variables: {
					trader: TEST_ADDRESS.toLowerCase(),
				},
			}),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
		}

		const result = await response.json();

		if (result.errors && result.errors.length > 0) {
			console.error("GraphQL errors:", result.errors);
			return false;
		}

		const positions = result.data?.positions || [];
		console.log(`✅ Subgraph connection successful!`);
		console.log(`📊 Found ${positions.length} positions for address ${TEST_ADDRESS}`);

		if (positions.length > 0) {
			console.log("\nFirst position:");
			console.log(JSON.stringify(positions[0], null, 2));
		}

		return true;
	} catch (error) {
		console.error("❌ Subgraph connection failed:", error.message);
		return false;
	}
}

// Run the test
testSubgraph().then((success) => {
	process.exit(success ? 0 : 1);
});
