# Virtual Markets Integration

This document describes the integration of virtual markets data with trending tokens using GraphQL queries.

## Overview

The virtual markets integration enhances the trending tokens API by adding liquidity and open interest data from the virtual markets subgraph. This allows users to see:

- Total liquidity available for trading
- Real liquidity (total open interest) 
- Whether a market exists for each token
- Virtual market details

**Important**: The `marketId` field in virtual markets corresponds to the token symbol (e.g., "ETH", "BTC"), not the token contract address.

## GraphQL Queries Used

### 1. All Virtual Markets Query
```graphql
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
```

### 2. Virtual Market by ID Query
```graphql
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
```

## API Endpoints

### Virtual Markets API
- **GET** `/api/virtual-markets` - Get all virtual markets
- **GET** `/api/virtual-markets?marketId={symbol}` - Get specific virtual market by token symbol
- **POST** `/api/virtual-markets` - Batch lookup for multiple token symbols

### Enhanced Trending Tokens
- **GET** `/api/trending/tokens` - Now includes virtual market data

## Data Structure

### Virtual Market Interface
```typescript
interface VirtualMarket {
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
```

### Enhanced Token Interface
```typescript
interface Token {
  // Original fields
  id: number;
  symbol: string;
  name: string;
  price: string;
  change24h: string;
  volume: string;
  marketCap: string;
  trend: "up" | "down";
  logo: string;
  pairAddress?: string;
  
  // New virtual market fields
  totalLiquidity?: string;       // Total liquidity in the market
  realLiquidity?: string;        // Same as openInterest
  openInterest?: string;         // Total open interest (realLiquidity)
  hasMarket?: boolean;           // Whether a virtual market exists
  marketId?: string | null;      // Market ID if exists
  virtualLiquidity?: string;     // Virtual liquidity component
  tokenAddress?: string;         // Token contract address
}
```

## Implementation Details

### 1. Virtual Markets Service
The `VirtualMarketsService` class provides:
- Direct GraphQL queries to the subgraph
- Efficient market lookup maps
- Helper functions for liquidity calculations
- Error handling and fallbacks

### 2. Enhanced Trending Tokens API
The trending tokens endpoint now:
1. Fetches DexScreener data (existing functionality)
2. Creates a lookup map of virtual markets by token symbol
3. Enriches token data with virtual market information
4. Returns enhanced token objects with liquidity data

### 3. UI Enhancements
The trending tokens table now displays:
- **Total Liquidity**: Combined liquidity available
- **Open Interest**: Real liquidity representing total positions
- **Market Badge**: Visual indicator when a virtual market exists
- **Formatted Values**: Human-readable liquidity amounts

## Key Features

### Liquidity Calculation Logic
- If a virtual market exists: Use `totalLiquidity` from virtual market
- If no virtual market: Fall back to DEX liquidity from DexScreener
- Real liquidity represents total open interest (positions)
- Virtual liquidity is the synthetic component

### Error Handling
- Graceful fallbacks when subgraph is unavailable
- Zero values for tokens without markets
- Detailed error logging for debugging

### Performance Optimization
- Bulk market lookups to minimize API calls
- Efficient Map-based token-to-market matching
- Parallel fetching of DexScreener and virtual market data

## 🔢 Decimal Precision Handling

All liquidity values from the virtual markets are parsed with **6 decimal precision** (divided by 1e6) to convert from raw blockchain values to human-readable amounts.

### Parsing Logic
```typescript
// Raw value from subgraph: "1234567890"
// Parsed value: 1234567890 / 1e6 = 1234.56789
const parsedLiquidity = parseLiquidityWith6Decimals("1234567890");
```

### Affected Fields
- `totalLiquidity`: Total market liquidity
- `realLiquidity`: Real liquidity (open interest) 
- `virtualLiquidity`: Virtual/synthetic liquidity component

### Utility Function
```typescript
import { parseLiquidityWith6Decimals } from '@/lib/virtual-markets-utils';

const amount = parseLiquidityWith6Decimals("1000000"); // Returns 1.0
```

## Environment Setup

Ensure the following environment variable is set:
```bash
SUBGRAPH_URL=http://localhost:8000/subgraphs/name/lemon
```

## Testing

Run the comprehensive test suite:
```bash
node scripts/test-virtual-markets.js
```

The test script validates:
1. Direct GraphQL connectivity to subgraph
2. Virtual markets API endpoints
3. Enhanced trending tokens integration
4. Data consistency and format

## Usage Examples

### Get All Virtual Markets
```javascript
import { getAllVirtualMarkets } from '@/lib/virtual-markets-service';

const markets = await getAllVirtualMarkets();
console.log(`Found ${markets.length} virtual markets`);
```

### Get Market for Specific Token
```javascript
import { getVirtualMarketById } from '@/lib/virtual-markets-service';

const market = await getVirtualMarketById('0x1234...');
if (market) {
  console.log(`Total liquidity: ${market.totalLiquidity}`);
  console.log(`Open interest: ${market.realLiquidity}`);
}
```

### Create Market Lookup Map
```javascript
import { createMarketLookupMap } from '@/lib/virtual-markets-service';

const tokenAddresses = ['0x1234...', '0x5678...'];
const marketMap = await createMarketLookupMap(tokenAddresses);

tokenAddresses.forEach(address => {
  const market = marketMap.get(address.toLowerCase());
  console.log(`${address}: ${market ? 'Has Market' : 'No Market'}`);
});
```

## Future Enhancements

Potential improvements for future iterations:
1. Real-time market updates via WebSocket subscriptions
2. Historical liquidity charts
3. Market depth visualization
4. Advanced filtering by liquidity ranges
5. Market creation notifications
6. Integration with position management

## Troubleshooting

### Common Issues

1. **Subgraph Connection Errors**
   - Check SUBGRAPH_URL environment variable
   - Verify subgraph is running and accessible
   - Check authorization token

2. **Empty Virtual Markets**
   - Verify subgraph has been indexed with market data
   - Check if market creation events have been processed

3. **Type Errors in Frontend**
   - Ensure Token interface matches API response
   - Check for undefined market fields in UI components

4. **Performance Issues**
   - Monitor GraphQL query complexity
   - Consider caching for frequently accessed markets
   - Implement request batching for large token lists
