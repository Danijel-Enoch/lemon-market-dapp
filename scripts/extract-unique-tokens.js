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

const fs = require('fs');
const path = require('path');

// Input file path
const inputFile = path.join(__dirname, 'output', 'token-details-2025-10-09T15-41-57-653Z.json');

// Output file path
const outputFile = path.join(__dirname, 'output', 'unique-tokens.json');

try {
    console.log('Reading token details from:', inputFile);

    // Read and parse the JSON file
    const fileContent = fs.readFileSync(inputFile, 'utf8');
    const tokenDetails = JSON.parse(fileContent);

    console.log(`Found ${tokenDetails.length} pairs to process`);

    // Object to store unique tokens
    // Using address as key to ensure uniqueness
    const uniqueTokensMap = new Map();

    // Extract tokens from each pair
    tokenDetails.forEach((pair, index) => {
        // Extract base token
        if (pair.baseToken) {
            const baseToken = pair.baseToken;
            let symbol = baseToken.symbol;
            let address = baseToken.address;

            // Fallback to dexScreener data if symbol is null/missing
            if (!symbol && pair.dexScreener?.baseToken) {
                symbol = pair.dexScreener.baseToken.symbol;
            }

            // Only add if we haven't seen this token before
            if (!uniqueTokensMap.has(address)) {
                // Extract chain from address (format: "bsc_0x...")
                const chain = baseToken.network || address.split('_')[0];

                uniqueTokensMap.set(address, {
                    symbol: symbol,
                    address: address,
                    chain: chain,
                    decimals: baseToken.decimals || 18
                });
            }
        }

        // Extract quote token
        if (pair.quoteToken) {
            const quoteToken = pair.quoteToken;
            let symbol = quoteToken.symbol;
            let address = quoteToken.address;

            // Fallback to dexScreener data if symbol is null/missing
            if (!symbol && pair.dexScreener?.quoteToken) {
                symbol = pair.dexScreener.quoteToken.symbol;
            }

            // Only add if we haven't seen this token before
            if (!uniqueTokensMap.has(address)) {
                // Extract chain from address (format: "bsc_0x...")
                const chain = quoteToken.network || address.split('_')[0];

                uniqueTokensMap.set(address, {
                    symbol: symbol,
                    address: address,
                    chain: chain,
                    decimals: quoteToken.decimals || 18
                });
            }
        }
    });

    console.log(`\nExtracted ${uniqueTokensMap.size} unique tokens`);

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
            console.log(`⚠️  Duplicate symbol detected: ${symbol} -> ${key}`);
        }

        uniqueTokens[key] = {
            address: token.address,
            chain: token.chain,
            decimals: token.decimals
        };
    });

    // Write to output file
    const outputContent = JSON.stringify(uniqueTokens, null, 4);
    fs.writeFileSync(outputFile, outputContent, 'utf8');

    console.log(`\n✅ Successfully extracted unique tokens to: ${outputFile}`);
    console.log(`\nSample output (first 5 tokens):`);

    // Display first 5 tokens as sample
    const keys = Object.keys(uniqueTokens).slice(0, 5);
    const sample = {};
    keys.forEach(key => {
        sample[key] = uniqueTokens[key];
    });
    console.log(JSON.stringify(sample, null, 4));

    // Summary
    console.log('\n📊 Summary:');
    console.log(`   Total pairs processed: ${tokenDetails.length}`);
    console.log(`   Unique tokens found: ${uniqueTokensMap.size}`);
    console.log(`   Output entries: ${Object.keys(uniqueTokens).length}`);

} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
