#!/usr/bin/env node

/**
 * Script to extract unique tokens from token details JSON file
 * Extracts both base and quote tokens without duplicates
 * Outputs in the format:
 * {
 *   "SYMBOL": {
 *     "address": "chain_0x...",
 *     "chain": "chain",
 *     "decimals": 18
 *   }
 * }
 */

const fs = require("node:fs");
const path = require("node:path");

// Input file path
const inputFile = path.join(__dirname, "output", "token-details-2025-10-09T15-41-57-653Z.json");

// Output file path
const outputFile = path.join(__dirname, "output", "unique-tokens.json");

try {
	// Read and parse the JSON file
	const fileContent = fs.readFileSync(inputFile, "utf8");
	const tokenDetails = JSON.parse(fileContent);

	// Object to store unique tokens
	// Using address as key to ensure uniqueness
	const uniqueTokensMap = new Map();

	// Extract tokens from each pair
	tokenDetails.forEach((pair, _index) => {
		// Extract base token
		if (pair.baseToken) {
			const baseToken = pair.baseToken;
			let symbol = baseToken.symbol;
			const address = baseToken.address;

			// Fallback to dexScreener data if symbol is null/missing
			if (!symbol && pair.dexScreener?.baseToken) {
				symbol = pair.dexScreener.baseToken.symbol;
			}

			// Only add if we haven't seen this token before
			if (!uniqueTokensMap.has(address)) {
				// Extract chain from address (format: "bsc_0x...")
				const chain = baseToken.network || address.split("_")[0];

				uniqueTokensMap.set(address, {
					symbol: symbol,
					address: address,
					chain: chain,
					decimals: baseToken.decimals || 18,
				});
			}
		}

		// Extract quote token
		if (pair.quoteToken) {
			const quoteToken = pair.quoteToken;
			let symbol = quoteToken.symbol;
			const address = quoteToken.address;

			// Fallback to dexScreener data if symbol is null/missing
			if (!symbol && pair.dexScreener?.quoteToken) {
				symbol = pair.dexScreener.quoteToken.symbol;
			}

			// Only add if we haven't seen this token before
			if (!uniqueTokensMap.has(address)) {
				// Extract chain from address (format: "bsc_0x...")
				const chain = quoteToken.network || address.split("_")[0];

				uniqueTokensMap.set(address, {
					symbol: symbol,
					address: address,
					chain: chain,
					decimals: quoteToken.decimals || 18,
				});
			}
		}
	});

	// Convert Map to object with symbol as key
	const uniqueTokens = {};
	const symbolCounts = new Map(); // Track symbol occurrences for duplicates

	// First pass - count symbols
	uniqueTokensMap.forEach((token) => {
		const count = symbolCounts.get(token.symbol) || 0;
		symbolCounts.set(token.symbol, count + 1);
	});

	// Second pass - create output object
	uniqueTokensMap.forEach((token) => {
		const symbol = token.symbol;

		// If symbol appears multiple times, append address suffix to make it unique
		let key = symbol;
		if (symbolCounts.get(symbol) > 1) {
			// Extract last 4 chars of address for uniqueness
			const addressSuffix = token.address.slice(-4);
			key = `${symbol}_${addressSuffix}`;
		}

		uniqueTokens[key] = {
			address: token.address,
			chain: token.chain,
			decimals: token.decimals,
		};
	});

	// Write to output file
	const outputContent = JSON.stringify(uniqueTokens, null, 4);
	fs.writeFileSync(outputFile, outputContent, "utf8");

	// Display first 5 tokens as sample
	const keys = Object.keys(uniqueTokens).slice(0, 5);
	const sample = {};
	keys.forEach((key) => {
		sample[key] = uniqueTokens[key];
	});
} catch (_error) {
	process.exit(1);
}
