/**
 * Test script for Base chain search functionality
 * Run with: npm run test-search
 */

import { searchService } from "../src/lib/search-service";

async function testBaseSearch() {
	// Test cases
	const testCases = [
		{ query: "USDC", description: "Popular token symbol" },
		{ query: "ETH", description: "Ethereum token symbol" },
		{
			query: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			description: "USDC Base contract address",
		},
		{ query: "Wrapped Ethereum", description: "Token name search" },
	];

	for (const testCase of testCases) {
		try {
			const results = await searchService.search(testCase.query, ["base"]);

			if (results.length > 0) {
				results.slice(0, 3).forEach((_result, _index) => {});
			} else {
			}
		} catch (_error) {}
	}
}

// Run the test
testBaseSearch().catch((error) => {
	process.stderr.write(`Error: ${error}\n`);
	process.exit(1);
});
