# Pair Address Integration Update 🔄

## Changes Made

I've successfully updated both the backend API and frontend to support **pair addresses** for more accurate token price fetching!

### 🔧 **Backend API Updates** (`/src/app/api/position/create/route.ts`)

1. **Extended Request Interface**:
   ```typescript
   interface CreatePositionRequest {
     tokenSymbol: string;
     isLong: boolean;
     margin: string;
     leverage: number;
     userAddress: string;
     pairAddress?: string; // 🆕 NEW: Optional pair address
   }
   ```

2. **Smart Price Fetching Logic**:
   - **Primary**: Uses `getTokenPriceByPair(pairAddress, "ethereum")` when pair address is provided
   - **Fallback**: Uses `getTokenPrice(tokenSymbol, "ethereum")` if pair address fails or not provided
   - **Logging**: Added detailed console logs for debugging price fetching

3. **Updated Documentation**:
   - API endpoint documentation now includes `pairAddress` parameter
   - Health check endpoint shows the new optional parameter

### 🎨 **Frontend Updates** (`/src/app/perp/page.tsx`)

1. **Enhanced API Call**:
   ```typescript
   const result = await createPosition({
     tokenSymbol,
     isLong,
     margin: valueUSDC,
     leverage,
     userAddress: address,
     pairAddress: tradingPair.pairAddress // 🆕 NEW: Include pair address
   });
   ```

2. **Automatic Pair Address Detection**:
   - The page already extracts `pairAddress` from URL parameters
   - Now passes this to the API for accurate pricing

### 🛠️ **Utility Updates** (`/src/lib/position-api.ts`)

1. **Extended Interface**:
   - Added optional `pairAddress` field to `CreatePositionRequest`
   - Maintains backward compatibility (optional field)

### 📚 **Documentation Updates**

Updated all documentation files to include the new `pairAddress` parameter:
- API examples now show pair address usage
- Parameter tables include pair address description
- cURL examples updated with pair address

## 🎯 **How It Works Now**

### **Price Fetching Priority**:
1. **If pair address provided**: Uses DexScreener's pair-specific endpoint for most accurate pricing
2. **If pair address fails/missing**: Falls back to token symbol-based pricing
3. **Logs everything**: Console logs show which method was used and the fetched price

### **Frontend Flow**:
1. User navigates to `/perp?symbol=ETH&pairAddress=0x638f567d...`
2. Frontend extracts both symbol and pair address
3. When creating position, sends both to API
4. API uses pair address for precise pricing
5. Transaction executed with real-time accurate price

## 🚀 **Benefits**

- **More Accurate Pricing**: Pair-specific pricing is more reliable than symbol-based
- **Better Liquidity Detection**: Can use specific pair liquidity data
- **Fallback Safety**: Still works if pair address is missing or invalid
- **Backward Compatible**: Existing integrations without pair address still work
- **Debug Friendly**: Detailed logging for troubleshooting price issues

## 🔍 **Example Usage**

### With Pair Address (Recommended):
```bash
curl -X POST /api/position/create \
  -H "Content-Type: application/json" \
  -d '{
    "tokenSymbol": "ETH",
    "isLong": true,
    "margin": "100.00",
    "leverage": 5,
    "userAddress": "0x742d35...",
    "pairAddress": "0x638f567d445E60E1aC1AfD369f53176FE9D5F93D"
  }'
```

### Without Pair Address (Fallback):
```bash
curl -X POST /api/position/create \
  -H "Content-Type: application/json" \
  -d '{
    "tokenSymbol": "ETH",
    "isLong": true,
    "margin": "100.00",
    "leverage": 5,
    "userAddress": "0x742d35..."
  }'
```

Both will work, but the first will provide more accurate pricing! 🎯
