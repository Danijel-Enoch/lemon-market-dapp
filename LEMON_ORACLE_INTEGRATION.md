# Enhanced Position System with Lemon Oracle Integration

## Overview

The enhanced position system integrates the Lemon Oracle Client to provide real-time PnL calculations for user positions. It fetches token prices from multiple sources and provides accurate position valuations.

## Key Features

### 1. Multi-Source Price Fetching
- **Lemon Oracle Client**: Primary source with highest confidence, aggregates prices from multiple DEXes
- **DexScreener API**: Fallback source for token price data
- **CoinGecko API**: Secondary fallback with API key support

### 2. Real-time PnL Calculations
- Live unrealized PnL based on current market prices
- Position value calculations
- Percentage-based PnL display
- Portfolio-level aggregations

### 3. Token Address Resolution
- Automatic token symbol to contract address mapping
- Support for major tokens (BTC, ETH, BNB, etc.)
- Dynamic token lookup via external APIs

## Usage Examples

### Basic Usage (Hook)

```tsx
import { useUserPositions } from '@/hooks/useUserPositions';

function MyComponent() {
  const {
    positions,
    enhancedPositions,
    isLoading,
    error,
    isEnhancedMode,
    toggleEnhancedMode,
    totalUnrealizedPnL,
    totalPortfolioValue
  } = useUserPositions();

  // Toggle between basic and enhanced mode
  const handleToggleMode = () => {
    toggleEnhancedMode();
  };

  if (isEnhancedMode && enhancedPositions) {
    return (
      <div>
        <h3>Portfolio Value: ${totalPortfolioValue?.toFixed(2)}</h3>
        <h3>Total PnL: ${totalUnrealizedPnL?.toFixed(2)}</h3>
        {enhancedPositions.map(position => (
          <div key={position.id}>
            <span>{position.tokenSymbol}</span>
            <span>{position.currentPrice}</span>
            <span>{position.unrealizedPnL}</span>
            <span>Source: {position.priceSource}</span>
          </div>
        ))}
      </div>
    );
  }

  return <div>Basic positions view</div>;
}
```

### Direct API Usage

```tsx
import { getEnhancedUserPositions, calculatePositionPnL } from '@/lib/position-api';
import { getTokenPriceService } from '@/lib/token-price-service';

// Get enhanced positions
const enhancedData = await getEnhancedUserPositions(userAddress);

// Calculate PnL for a specific position
const pnlCalc = await calculatePositionPnL(
  'BTC',      // token symbol
  '$45000',   // entry price
  '$1000',    // margin
  '10x',      // leverage
  true,       // is long
  '$40000'    // liquidation price
);

// Get real-time price for a token
const tokenPriceService = getTokenPriceService();
const priceData = await tokenPriceService.getTokenPrice('BTC');
```

### Using Enhanced Positions API Endpoint

```bash
# Get basic positions
GET /api/positions?trader=0x123...

# Get enhanced positions with real-time PnL
GET /api/positions/enhanced?trader=0x123...
```

### Component Usage

```tsx
import { EnhancedPositionsTable } from '@/components/trading/EnhancedPositionsTable';

function TradingDashboard() {
  return (
    <div>
      <EnhancedPositionsTable className="mt-4" />
    </div>
  );
}
```

## API Integration

### Position Close with Real-time Price

```tsx
import { closePosition } from '@/lib/position-api';

const handleClosePosition = async (positionId: string) => {
  try {
    const result = await closePosition({
      positionId,
      tokenSymbol: 'BTC',
      userAddress: address,
      pairAddress: '0x123...' // optional for better accuracy
    });
    
    if (result.success) {
      // Execute transaction with result.data
    }
  } catch (error) {
    console.error('Failed to close position:', error);
  }
};
```

### Position Modify with Real-time Price

```tsx
import { modifyPosition } from '@/lib/position-api';

const handleModifyPosition = async () => {
  try {
    const result = await modifyPosition({
      positionId: '1',
      tokenSymbol: 'BTC',
      newMargin: '2000',
      newLeverage: 15,
      userAddress: address
    });
    
    if (result.success) {
      // Execute transaction
    }
  } catch (error) {
    console.error('Failed to modify position:', error);
  }
};
```

## Configuration

### Environment Variables

```bash
# Lemon Oracle API
LEMON_ORACLE_API_URL=http://localhost:3001

# CoinGecko API (optional)
COINGECKO_API_KEY=your_api_key_here
```

### Token Address Mapping

The system includes built-in mappings for major tokens:

```typescript
const TOKEN_ADDRESS_MAP = {
  'BTC': { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', chain: 'bsc', decimals: 18 },
  'ETH': { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', chain: 'bsc', decimals: 18 },
  // ... more tokens
};
```

## Price Sources and Confidence Levels

### High Confidence (Lemon Oracle)
- Aggregated from multiple DEXes
- Real-time price feeds
- Cross-validated data

### Medium Confidence (DexScreener)
- Direct from DEX pairs
- Good liquidity data
- Fast updates

### Low Confidence (CoinGecko)
- Centralized price feeds
- Slower updates
- Broad market coverage

## Error Handling

The system includes comprehensive error handling:

1. **Network failures**: Automatic retries with exponential backoff
2. **Price fetch failures**: Cascading fallbacks between sources
3. **Invalid data**: Validation and sanitization
4. **API rate limits**: Built-in caching and request throttling

## Performance Optimizations

1. **Caching**: 30-second TTL for price data
2. **Batch requests**: Multiple tokens fetched in single API calls
3. **Lazy loading**: Enhanced mode only when requested
4. **Debounced updates**: Prevents excessive API calls

## Monitoring and Debugging

Enable debug mode for detailed logging:

```typescript
const tokenPriceService = new TokenPriceService({
  debug: process.env.NODE_ENV === 'development'
});
```

This will log:
- Price fetch attempts and results
- API response times
- Cache hit/miss ratios
- Error details and fallback chains
