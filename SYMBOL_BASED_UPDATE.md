# Virtual Markets Integration - Symbol-Based Update

## ✅ Key Change Implemented

Updated the virtual markets integration to use **token symbols** instead of token addresses for market matching, since `marketId` corresponds to token symbols (e.g., "ETH", "BTC").

## 🔧 Changes Made

### 1. Virtual Markets Service (`src/lib/virtual-markets-service.ts`)
- **`createMarketLookupMap()`**: Now accepts `tokenSymbols[]` instead of `tokenAddresses[]`
- **Market matching**: Uses `marketId.toUpperCase()` for consistent symbol matching
- **Utility functions**: Updated to work with token symbols instead of addresses
- **Parameter names**: Changed `tokenAddress` to `tokenSymbol` throughout

### 2. Trending Tokens API (`src/app/api/trending/tokens/route.ts`)
- **Symbol extraction**: Now extracts `pair.baseToken.symbol` instead of addresses
- **Market lookup**: Uses token symbols to match against virtual markets
- **Consistent casing**: Normalizes symbols to uppercase for matching

### 3. Virtual Markets API (`src/app/api/virtual-markets/route.ts`)
- **POST endpoint**: Now expects `tokenSymbols[]` instead of `tokenAddresses[]`
- **Batch lookup**: Matches symbols using uppercase normalization
- **API contract**: Updated parameter names and logic

### 4. Test Script (`scripts/test-virtual-markets.js`)
- **Batch testing**: Updated to test with token symbols like "ETH", "BTC"
- **Sample data**: Uses realistic symbol examples

### 5. Documentation Updates
- **VIRTUAL_MARKETS_INTEGRATION.md**: Added clarification that `marketId = tokenSymbol`
- **API docs**: Updated to reflect symbol-based endpoints
- **Implementation notes**: Clarified symbol vs address usage

## 🎯 How Token Matching Works Now

### Before (Address-based):
```typescript
// ❌ Old approach - using addresses
const tokenAddress = "0x1234...";
const market = marketMap.get(tokenAddress.toLowerCase());
```

### After (Symbol-based):
```typescript
// ✅ New approach - using symbols  
const tokenSymbol = "ETH";
const market = marketMap.get(tokenSymbol.toUpperCase());
```

## 📊 Data Flow

1. **DexScreener API** → Extract `baseToken.symbol` (e.g., "ETH")
2. **Virtual Markets Query** → Find markets where `marketId = "ETH"`
3. **Symbol Matching** → `"ETH".toUpperCase() === market.marketId.toUpperCase()`
4. **Enhanced Response** → Token data + virtual market liquidity info

## 🔍 API Examples

### Get Market by Symbol
```bash
GET /api/virtual-markets?marketId=ETH
```

### Batch Lookup by Symbols
```bash
POST /api/virtual-markets
Content-Type: application/json

{
  "tokenSymbols": ["ETH", "BTC", "USDT"]
}
```

### Enhanced Trending Tokens Response
```json
{
  "data": [
    {
      "symbol": "ETH",
      "name": "Ethereum", 
      "totalLiquidity": "$45.67M",    // From virtual market
      "openInterest": "$12.34M",      // From virtual market  
      "hasMarket": true,              // Market exists for ETH
      "marketId": "ETH"               // Matches symbol
    }
  ]
}
```

## ✅ Benefits of Symbol-Based Matching

1. **Simpler Logic**: Direct symbol-to-symbol matching
2. **Human Readable**: "ETH" is more intuitive than "0x1234..."
3. **Cross-Chain**: Symbols work across different networks
4. **Consistent**: Standard token symbols are universal

## 🚀 Ready to Test

The integration now correctly matches tokens to virtual markets using symbols. Run the test script to verify:

```bash
node scripts/test-virtual-markets.js
```

This will test:
- Direct GraphQL queries to subgraph
- Symbol-based virtual markets API
- Enhanced trending tokens with correct market matching
