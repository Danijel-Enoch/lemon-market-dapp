# Volatility Tier Removal Update Summary

## Overview
Updated the codebase to remove volatility tier from oracle data structures in line with the new synthetic contract ABI updates.

## Changes Made

### 1. Contract ABI Updates (`src/lib/contracts.ts`)
- **Fixed inconsistency**: The `closePosition` function's `OracleData` struct was updated to match `openPosition` and `modifyPosition`
- **Removed**: `volatilityTier` field from the `OracleData` struct in `closePosition`
- **Consistent structure**: All position-related functions now use the same `OracleData` structure:
  ```typescript
  {
    tokenSymbol: string,
    price: uint256,
    timestamp: uint256,
    nonce: uint256,
    virtualFunding: uint256
  }
  ```

### 2. Position API Updates

#### Create Position API (`src/app/api/position/create/route.ts`)
- **Removed**: `volatilityTier` from `OracleData` interface
- **Updated**: Message encoding to exclude volatility tier:
  - Old format: `["string", "uint256", "uint256", "uint256", "uint8", "uint256", "address"]`
  - New format: `["string", "uint256", "uint256", "uint256", "uint256", "address"]`
- **Removed**: `getVolatilityTierForToken` import and usage
- **Cleaned up**: Logging and oracle data creation to exclude volatility tier

#### Close Position API (`src/app/api/position/close/route.ts`)
- **Removed**: `volatilityTier` from `OracleData` interface
- **Updated**: Message encoding format (same as create position)
- **Removed**: `getVolatilityTierForToken` import and usage
- **Cleaned up**: All references to volatility tier

#### Modify Position API (`src/app/api/position/modify/route.ts`)
- **Removed**: `volatilityTier` from `OracleData` interface
- **Updated**: Message encoding format (same as other APIs)
- **Removed**: `getVolatilityTierForToken` import and usage
- **Cleaned up**: All references to volatility tier

## Impact
- **Consistent**: All position APIs now use the same oracle data structure
- **Simplified**: Removed complexity of volatility tier calculations and assignments
- **Compatible**: Updated to work with the new synthetic contract ABI
- **Clean**: No more inconsistencies between different position operations

## Oracle Data Structure (After Update)
```typescript
interface OracleData {
  tokenSymbol: string;    // Token symbol (e.g., "ETH", "BTC")
  price: bigint;         // Token price in wei (18 decimals)
  timestamp: bigint;     // Current timestamp
  nonce: bigint;         // Unique nonce for replay protection
  virtualFunding: bigint; // Virtual funding amount
}
```

## Message Encoding (After Update)
```typescript
encodePacked(
  ["string", "uint256", "uint256", "uint256", "uint256", "address"],
  [
    oracleData.tokenSymbol,
    oracleData.price,
    oracleData.timestamp,
    oracleData.nonce,
    oracleData.virtualFunding,
    traderAddress
  ]
)
```

## Files Modified
1. `/src/lib/contracts.ts` - Updated ABI for consistency
2. `/src/app/api/position/create/route.ts` - Removed volatility tier handling
3. `/src/app/api/position/close/route.ts` - Removed volatility tier handling
4. `/src/app/api/position/modify/route.ts` - Removed volatility tier handling

## Testing
- ✅ TypeScript compilation successful
- ✅ Next.js build successful
- ✅ No runtime errors detected
- ✅ All position APIs updated consistently

## Notes
- The volatility utilities in `/src/lib/volatility-utils.ts` are still present but no longer used by the position APIs
- These utilities can be removed in the future if not needed elsewhere
- The virtual funding calculation logic remains intact and functional
