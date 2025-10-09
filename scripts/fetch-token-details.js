const fs = require('fs');
const path = require('path');

// Pair addresses from the route file
const pairs = [
    "0x16969fa79651bae11736f2f6576a86fe2726b42b",
    "0xbffec96e8f3b5058b1817c14e4380758fada01ef",
    "0x534d3930edba2c0b90a7973549a0287141c987ef",
    "0x3817ff61b34c5ff5dc89709b2db1f194299e3ba9",
    "0xa1893c58a39c67f1e0f5d5ef6b8d673ef0448968",
    "0xe288d9d664c1fa3f9a06d070d135030bbdd809a8",
    "0xd6b652aecb704b0aebec6317315afb90ba641d57",
    "0xf5fda86bb33e46716dfcd845b2a78dff1e24567a",
    "0x3dc2878f9f60476dbbb18af7531fbe1a603c8dc0",
    "0xfad3b1b70868e16e93e323ea1375e2136a6c829a",
    "0x6d76e7bb743fee795a2f00a317760acf822ee2be",
    "0x397699606a5cdd931eac01738dec0f97d0e5f624",
    "0x30d59a44930b3994c116846efe55fc8fcf608aa8",
    "0x808a3f77c4be4e1ae5dab0f63cca2cbfde281dc5",
    "0x6dafbf0ab4fd72e2a5c0ad5a1ed277d3bf8a8d1f",
    "0xd317b5480faf6ef228c502d9c4d0c04599c5b74b",
    "0x7d6f2c4fb78b44527efec5bd5f39d85b04c1c5a2",
    "0xd26d38408a6ac6faff6fdfa92b5910ced2e5fd31",
    "0xf7d21628d824d4910eb92466e830f8d09e9cccb9",
    "0x78fc96f3543337cd5393533ea66dc8fe42ad054d",
    "0x757651b39d4d13509b60b5784ba0e504a8ef6691",
    "0x0f0cf38f67ed6fb00881cdb815e25441f7f022e0",
    "0x0ecf06daae95a9f860551cfd9ca175cc81ad90ed",
    "0xa9a6a589a24f03153b9915ff9bf3d76ae35e14ab",
    "0xaa29973ec578877553df06fa4f74fb63d88136f8",
    "0xf4216d953fb75f1301fed7d76d8164bd839937a3",
    "0xb2505b8a1ab470acfbc12dd255e7fa298a23ab67",
    "0x3c7e7122f4ddcfc5b5c31b5c735ce2ae3b015856",
    "0xdb25c09d96c165b62f6e6f9d9b17174738d897ba",
    "0x1f7b009acfb88aa5e1be0b26bbb7006fe8bda4c5",
    "0xeb7fe075b7677c98c75e105d4f5ace0e19505567",
    "0x6c95e3ec83f0a40360464a8526615f97d2bdbe5d",
    "0x588d7cf062f4edd7c7c7f2d66fd770e03b1ea735",
    "0xf66f5adad3b8f0bd1f9b413e87b772914d05bf3a",
    "0xd0160672b2ca764b8aff188ad806b4cd6ee29e8a",
    "0xb2505b8a1ab470acfbc12dd255e7fa298a23ab67",
    "0xcf084d9004c2fe328bf7819bdd37f3a5b179c0c6",
    "0xa511dc3d8422ee0e2a2c4ec1ac8b893757f0dc77",
    "0x5092a153895359ec9f77d3a66f95b53dcdf8025e",
    "0x0223c711ea46107df0a325e882bf2f657ec10ba5",
    "0x258b62531e0d6c8d1e2e7ff23904fd851def77ca",
    "0x79733327603b067f6ec6a2f111a16799cfbaf99b",
    "0xc33bacff9141da689875e6381c1932348ab4c5cb",
    "0x01c0612fcf95aa3624269dafc4324a47ad7928fa",
    "0x8e86a6c334ab270084bf8273d5293488f2578207",
    "0x126fadb82cc4ab91e6cd03accaf209fb6d1ffaab",
    "0xff0a8df8c4a0332e28a4c94ebb3f633944b08a94",
    "0x2269d2305830e3c3e7c05c26d46dd3790cd7314d",
    "0xca5e9d88c2ef13052435e8320747832731239f13",
    "0x2b69ae7cd715fec1a22908a04661406c0f95829f",
    "0x87a2cb3ffb71ea9940ba3b602047700eaaf8e24b",
    "0x9d60d308878d56c4aa4f89081421e6720bf3e8b2",
    "0x8fc2cc651c0543d5d45034365cdd83018d51523c",
    "0x0ec12db33551afba853b691b4edf49196ea0e99a",
    "0x468ab8fd260878ebd44b7a28ceab5f052e4833d2",
    "0x7874f0ecd450a5f06acb85543fe1d0d48e1c525f",
    "0xa0c7f9b6e1218344d2c06ca301e11ea3b797a8c7",
    "0x7cb113b487e025b3a69537fca579559433240cb5",
    "0x7f51c8aaa6b0599abd16674e2b17fec7a9f674a1",
    "0xa424c24c5cbfc377c3b6ae7355c3f30984664b16",
    "0xa341e8e8ee6bf97fa1d18c2d12f00555dc78207e",
    "0xe1799b52c010ad415325d19af139e20b8aa8aab0",
    "0x5db04ea767d9fa92b9c06d7752226be7bc2e546f",
    "0x5092a153895359ec9f77d3a66f95b53dcdf8025e",
    "0x0223c711ea46107df0a325e882bf2f657ec10ba5",
    "0x9e40a810debd1bb3113fd39d0080b2361c279e50",
    "0x8907f25be4878f68d0a968def4ad4b66d1f06226"
]

// Helper function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to fetch token details from DexScreener
async function fetchFromDexScreener(pairAddress, chainId = 'bsc') {
    try {
        console.log(`Fetching DexScreener data for pair: ${pairAddress}`);
        const response = await fetch(
            `https://api.dexscreener.com/latest/dex/pairs/${chainId}/${pairAddress}`,
            {
                method: "GET",
                headers: {
                    'Accept': 'application/json',
                }
            }
        );

        if (!response.ok) {
            throw new Error(`DexScreener HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const pair = data.pairs?.[0] || data.pair;

        if (!pair) {
            console.log(`No pair data found for ${pairAddress}`);
            return null;
        }

        return {
            pairAddress: pair.pairAddress,
            chainId: pair.chainId,
            dexId: pair.dexId,
            baseToken: {
                address: pair.baseToken?.address,
                name: pair.baseToken?.name,
                symbol: pair.baseToken?.symbol,
            },
            quoteToken: {
                address: pair.quoteToken?.address,
                name: pair.quoteToken?.name,
                symbol: pair.quoteToken?.symbol,
            }
        };
    } catch (error) {
        console.error(`Error fetching from DexScreener for ${pairAddress}:`, error.message);
        return null;
    }
}

// Function to fetch token details from GeckoTerminal
async function fetchFromGeckoTerminal(tokenAddress, network = 'bsc') {
    try {
        console.log(`Fetching GeckoTerminal data for token: ${tokenAddress}`);
        const response = await fetch(
            `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${tokenAddress}`,
            {
                method: "GET",
                headers: {
                    'Accept': 'application/json',
                }
            }
        );

        if (!response.ok) {
            throw new Error(`GeckoTerminal HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const tokenData = data.data;

        if (!tokenData) {
            console.log(`No token data found for ${tokenAddress}`);
            return null;
        }

        return {
            address: tokenData.id,
            name: tokenData.attributes.name,
            symbol: tokenData.attributes.symbol,
            decimals: tokenData.attributes.decimals,
            totalSupply: tokenData.attributes.total_supply,
            coingeckoId: tokenData.attributes.coingecko_coin_id,
            network: network
        };
    } catch (error) {
        console.error(`Error fetching from GeckoTerminal for ${tokenAddress}:`, error.message);
        return null;
    }
}

// Function to fetch token decimals from BSC blockchain via BSCScan API (fallback)
async function fetchTokenDecimalsFromBSCScan(tokenAddress) {
    try {
        console.log(`Fetching decimals from BSCScan for token: ${tokenAddress}`);
        // Using BSCScan API to get token decimals
        const response = await fetch(
            `https://api.bscscan.com/api?module=token&action=tokeninfo&contractaddress=${tokenAddress}&apikey=YourApiKeyToken`,
            {
                method: "GET",
                headers: {
                    'Accept': 'application/json',
                }
            }
        );

        if (!response.ok) {
            throw new Error(`BSCScan HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === "1" && data.result) {
            return {
                decimals: parseInt(data.result[0]?.divisor || data.result[0]?.decimals || '18'),
                name: data.result[0]?.tokenName,
                symbol: data.result[0]?.symbol,
                totalSupply: data.result[0]?.totalSupply,
                source: 'bscscan'
            };
        }

        return null;
    } catch (error) {
        console.error(`Error fetching decimals from BSCScan for ${tokenAddress}:`, error.message);
        return null;
    }
}

// Function to try multiple sources for token decimals
async function fetchTokenDecimals(tokenAddress, network = 'bsc') {
    console.log(`🔍 Fetching decimals for token: ${tokenAddress}`);

    // Try GeckoTerminal first
    let tokenData = await fetchFromGeckoTerminal(tokenAddress, network);
    if (tokenData && tokenData.decimals !== null && tokenData.decimals !== undefined) {
        console.log(`✅ Found decimals from GeckoTerminal: ${tokenData.decimals}`);
        return tokenData;
    }

    // Fallback to BSCScan API
    if (network === 'bsc') {
        let bscData = await fetchTokenDecimalsFromBSCScan(tokenAddress);
        if (bscData && bscData.decimals !== null && bscData.decimals !== undefined) {
            console.log(`✅ Found decimals from BSCScan: ${bscData.decimals}`);
            return {
                address: tokenAddress,
                decimals: bscData.decimals,
                name: bscData.name,
                symbol: bscData.symbol,
                totalSupply: bscData.totalSupply,
                source: 'bscscan',
                network: network
            };
        }
    }

    // If all else fails, assume common decimals (18 for most ERC-20 tokens)
    console.log(`⚠️ Could not fetch decimals for ${tokenAddress}, defaulting to 18`);
    return {
        address: tokenAddress,
        decimals: 18,
        name: null,
        symbol: null,
        source: 'default',
        network: network
    };
}

// Function to fetch pools from GeckoTerminal
async function fetchPoolsFromGeckoTerminal(poolAddress, network = 'bsc') {
    try {
        console.log(`Fetching GeckoTerminal pool data for: ${poolAddress}`);
        const response = await fetch(
            `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}`,
            {
                method: "GET",
                headers: {
                    'Accept': 'application/json',
                }
            }
        );

        if (!response.ok) {
            throw new Error(`GeckoTerminal Pool HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const poolData = data.data;

        if (!poolData) {
            console.log(`No pool data found for ${poolAddress}`);
            return null;
        }

        return {
            poolAddress: poolData.id,
            name: poolData.attributes.name,
            network: network,
            dexId: poolData.attributes.dex_id,
            baseToken: {
                address: poolData.relationships.base_token.data.id,
            },
            quoteToken: {
                address: poolData.relationships.quote_token.data.id,
            }
        };
    } catch (error) {
        console.error(`Error fetching pool from GeckoTerminal for ${poolAddress}:`, error.message);
        return null;
    }
}

// Main function to fetch all token details
async function fetchAllTokenDetails() {
    console.log(`Starting to fetch details for ${pairs.length} pairs...`);
    const results = [];

    for (let i = 0; i < pairs.length; i++) {
        const pairAddress = pairs[i];
        console.log(`\n--- Processing ${i + 1}/${pairs.length}: ${pairAddress} ---`);

        try {
            // Fetch basic pair info from DexScreener
            const dexScreenerData = await fetchFromDexScreener(pairAddress);
            await delay(200); // Rate limiting

            let geckoPoolData = null;
            let baseTokenDetails = null;
            let quoteTokenDetails = null;

            // Try to fetch pool data from GeckoTerminal
            geckoPoolData = await fetchPoolsFromGeckoTerminal(pairAddress);
            await delay(200);

            // If we have token addresses, fetch detailed token info including decimals
            if (dexScreenerData?.baseToken?.address) {
                baseTokenDetails = await fetchTokenDecimals(dexScreenerData.baseToken.address);
                await delay(300); // Increased delay for multiple API calls
            }

            if (dexScreenerData?.quoteToken?.address) {
                quoteTokenDetails = await fetchTokenDecimals(dexScreenerData.quoteToken.address);
                await delay(300); // Increased delay for multiple API calls
            }

            // Compile the result
            const result = {
                pairAddress: pairAddress,
                dexScreener: dexScreenerData,
                geckoPool: geckoPoolData,
                baseToken: {
                    ...dexScreenerData?.baseToken,
                    ...baseTokenDetails,
                },
                quoteToken: {
                    ...dexScreenerData?.quoteToken,
                    ...quoteTokenDetails,
                }
            };

            results.push(result);

            // Log summary with decimal information
            console.log(`✅ Processed: ${dexScreenerData?.baseToken?.symbol || baseTokenDetails?.symbol || 'Unknown'}`);
            console.log(`   Base Token: ${dexScreenerData?.baseToken?.address || 'N/A'}`);
            console.log(`   Base Decimals: ${baseTokenDetails?.decimals || 'N/A'} (${baseTokenDetails?.source || 'unknown source'})`);
            console.log(`   Quote Token: ${dexScreenerData?.quoteToken?.address || 'N/A'}`);
            console.log(`   Quote Decimals: ${quoteTokenDetails?.decimals || 'N/A'} (${quoteTokenDetails?.source || 'unknown source'})`);

        } catch (error) {
            console.error(`❌ Error processing ${pairAddress}:`, error.message);
            results.push({
                pairAddress: pairAddress,
                error: error.message,
                dexScreener: null,
                geckoPool: null,
                baseToken: null,
                quoteToken: null
            });
        }
    }

    return results;
}

// Function to save results to file
function saveResults(results) {
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `token-details-${timestamp}.json`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Results saved to: ${filepath}`);

    // Create formatted token config
    const formattedConfig = {};
    results.forEach(result => {
        const base = result.baseToken || {};
        const quote = result.quoteToken || {};
        const chain = result.dexScreener?.chainId || 'bsc';

        // Add base token if it has all required fields
        if (base.symbol && base.address && base.decimals !== undefined) {
            formattedConfig[base.symbol] = {
                address: base.address,
                chain: chain,
                decimals: base.decimals
            };
        }

        // Add quote token if it has all required fields and isn't already added
        if (quote.symbol && quote.address && quote.decimals !== undefined && !formattedConfig[quote.symbol]) {
            formattedConfig[quote.symbol] = {
                address: quote.address,
                chain: chain,
                decimals: quote.decimals
            };
        }
    });

    const configFilename = `token-config-${timestamp}.json`;
    const configFilepath = path.join(outputDir, configFilename);
    fs.writeFileSync(configFilepath, JSON.stringify(formattedConfig, null, 4));
    console.log(`📋 Formatted token config saved to: ${configFilepath}`);

    // Also create a CSV summary
    const csvFilename = `token-summary-${timestamp}.csv`;
    const csvFilepath = path.join(outputDir, csvFilename);

    const csvHeaders = 'Pair Address,Base Token Address,Base Token Symbol,Base Token Name,Base Decimals,Base Decimal Source,Quote Token Address,Quote Token Symbol,Quote Token Name,Quote Decimals,Quote Decimal Source,Chain ID,Dex ID\n';
    const csvRows = results.map(result => {
        const base = result.baseToken || {};
        const quote = result.quoteToken || {};
        const dex = result.dexScreener || {};

        return [
            result.pairAddress,
            base.address || 'N/A',
            base.symbol || 'N/A',
            base.name || 'N/A',
            base.decimals || 'N/A',
            base.source || 'N/A',
            quote.address || 'N/A',
            quote.symbol || 'N/A',
            quote.name || 'N/A',
            quote.decimals || 'N/A',
            quote.source || 'N/A',
            dex.chainId || 'N/A',
            dex.dexId || 'N/A'
        ].join(',');
    }).join('\n');

    fs.writeFileSync(csvFilepath, csvHeaders + csvRows);
    console.log(`📊 CSV summary saved to: ${csvFilepath}`);
}

// Main execution
async function main() {
    console.log('🚀 Starting token details fetcher...');
    console.log(`📊 Total pairs to process: ${pairs.length}`);
    console.log('⏱️  Estimated time: ~' + Math.ceil(pairs.length * 0.8 / 60) + ' minutes\n');

    try {
        const results = await fetchAllTokenDetails();

        console.log('\n📈 Fetch Summary:');
        console.log(`✅ Total processed: ${results.length}`);
        console.log(`✅ Successful: ${results.filter(r => !r.error).length}`);
        console.log(`❌ Errors: ${results.filter(r => r.error).length}`);

        saveResults(results);

        console.log('\n🎉 Script completed successfully!');

    } catch (error) {
        console.error('💥 Script failed:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = {
    fetchFromDexScreener,
    fetchFromGeckoTerminal,
    fetchPoolsFromGeckoTerminal,
    fetchTokenDecimalsFromBSCScan,
    fetchTokenDecimals,
    fetchAllTokenDetails
};
