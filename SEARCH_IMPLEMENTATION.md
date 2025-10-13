# Base Chain Search Implementation

## Overview
This implementation provides a comprehensive search functionality for Base chain tokens using DexScreener and GeckoTerminal APIs.

## Features

### 🔍 Multi-Source Search
- **DexScreener API**: Primary search for tokens, pairs, and general queries
- **GeckoTerminal API**: Additional coverage and validation
- **Smart Detection**: Automatically detects contract addresses vs. symbols

### 🎯 Search Capabilities
- **Token Symbol**: Search by token symbols (e.g., "USDC", "ETH")
- **Token Name**: Search by full token names (e.g., "Wrapped Ethereum")
- **Contract Address**: Search by token contract addresses (0x...)
- **Pair Address**: Search by trading pair addresses

### ⛓️ Base Chain Focus
- Optimized for Base network only
- Supported DEXes: BaseSwap, RocketSwap, SwapBased, DackieSwap, HorizonDex, SushiSwapV3, UniswapV2, UniswapV3, UniswapV4, VelocimeterV2, Aerodrome, Slipstream
- Base-specific token discovery with DEX filtering

## Implementation

### Core Components

1. **SearchService** (`/src/lib/search-service.ts`)
   - Main search orchestration
   - API integration with DexScreener and GeckoTerminal
   - Result deduplication and ranking

2. **useSearch Hook** (`/src/hooks/useSearch.ts`)
   - React hook for search state management
   - Debounced search execution
   - Loading and error states

3. **SearchResults Component** (`/src/components/ui/SearchResults.tsx`)
   - Search results display
   - Token information formatting
   - Trade action buttons

4. **Search API Endpoint** (`/src/app/api/search/route.ts`)
   - Server-side search proxy
   - Error handling and validation

### API Endpoints Used

#### DexScreener API
```typescript
// General search
GET https://api.dexscreener.com/latest/dex/search?q={query}

// Token address search  
GET https://api.dexscreener.com/latest/dex/tokens/{chainId}/{address}
```

#### GeckoTerminal API
```typescript
// Pool search
GET https://api.geckoterminal.com/api/v2/search/pools?query={query}&network=base&include=base_token,quote_token,dex
```

## Usage

### In React Components
```typescript
import { useSearch } from '@/hooks/useSearch';

const { results, isLoading, error, search, clearResults } = useSearch({
  chains: ['base']
});

// Search for tokens
await search('USDC');
```

### Direct Service Usage
```typescript
import { searchService } from '@/lib/search-service';

const results = await searchService.search('ETH', ['base']);
```

## Search Flow

1. User enters query in search input
2. Query is debounced (300ms delay for symbols, instant for addresses)
3. Service determines if query is an address or symbol
4. Parallel API calls to DexScreener and GeckoTerminal
5. Results are merged, deduplicated, and ranked by liquidity
6. Top 20 results displayed to user

## Result Data Structure

```typescript
interface SearchResult {
  id: string;
  symbol: string;
  name: string;
  tokenAddress: string;
  pairAddress: string;
  priceUsd: string;
  priceChange24h: string;
  volume24h: string;
  marketCap: string;
  liquidity: string;
  dex: string;
  chain: string;
  imageUrl?: string;
  source: 'dexscreener' | 'geckoterminal';
}
```

## Error Handling

- Network failures gracefully handled
- Invalid queries return empty results
- API rate limits respected
- Partial results displayed when one service fails

## Performance Optimizations

- Request debouncing for UX
- Parallel API calls for speed
- Result caching (browser-level)
- Duplicate removal
- Limited result sets (top 20)

## Testing

Run the test script to verify Base chain search:

```bash
node scripts/test-base-search.js
```

## Integration Points

- **Trending Page**: Main search interface at `/trending`
- **Trading Interface**: Search results link to trading pairs
- **Price Data**: Integrates with existing price services
