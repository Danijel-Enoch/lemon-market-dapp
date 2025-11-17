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
			return false;
		}

		const positions = result.data?.positions || [];

		if (positions.length > 0) {
		}

		return true;
	} catch (_error) {
		return false;
	}
}

// Run the test
testSubgraph().then((success) => {
	process.exit(success ? 0 : 1);
});
