/**
 * Test script for Base chain search functionality
 * Run with: npm run test-search
 */

import { searchService } from "../src/lib/search-service";

async function testBaseSearch() {
    console.log('🧪 Testing Base chain search functionality...\n');

    // Test cases
    const testCases = [
        { query: 'USDC', description: 'Popular token symbol' },
        { query: 'ETH', description: 'Ethereum token symbol' },
        { query: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', description: 'USDC Base contract address' },
        { query: 'Wrapped Ethereum', description: 'Token name search' },
    ];

    for (const testCase of testCases) {
        console.log(`\n📝 Testing: ${testCase.description}`);
        console.log(`   Query: "${testCase.query}"`);
        console.log('   ⏳ Searching...');

        try {
            const results = await searchService.search(testCase.query, ['base']);

            if (results.length > 0) {
                console.log(`   ✅ Found ${results.length} results:`);
                results.slice(0, 3).forEach((result, index) => {
                    console.log(`      ${index + 1}. ${result.symbol} (${result.name})`);
                    console.log(`         🏦 DEX: ${result.dex}`);
                    console.log(`         ⛓️  Chain: ${result.chain}`);
                    console.log(`         💰 Price: $${result.priceUsd}`);
                    console.log(`         💧 Liquidity: $${parseFloat(result.liquidity).toLocaleString()}`);
                });
            } else {
                console.log('   ❌ No results found');
            }
        } catch (error) {
            console.log(`   💥 Error: ${error.message}`);
        }

        console.log('   ' + '─'.repeat(50));
    }

    console.log('\n🎉 Test completed!');
}

// Run the test
testBaseSearch().catch(console.error);
