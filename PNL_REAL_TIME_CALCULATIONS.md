# PnL Calculation Update: Token Price Service Integration

## Overview

This update replaces the reliance on subgraph PnL data with real-time PnL calculations using the token price service. This ensures more accurate and up-to-date profit/loss values for trading positions.

## Key Changes

### 1. Updated API Endpoints

#### `/src/app/api/positions/route.ts`
- **Change**: Modified position transformation to not use subgraph PnL for open positions
- **Before**: `pnlRaw: position.finalPnl` for all positions
- **After**: `pnlRaw: position.status === "CLOSED" ? position.finalPnl : null` for open positions
- **Reason**: Prevents stale subgraph PnL data from being used for open positions

#### `/src/app/api/positions/enhanced/route.ts`
- **Change**: Same modification as regular positions API
- **Impact**: Enhanced positions now also avoid subgraph PnL for open positions

### 2. Enhanced useUserPositions Hook

#### `/src/hooks/useUserPositions.ts`
**New Features Added:**

1. **Real-time PnL calculation function**
   ```typescript
   async function calculatePositionRealTimePnL(position: Position): Promise<number>
   ```
   - Calculates PnL using token price service for open positions
   - Uses subgraph finalPnl only for closed positions

2. **PnL calculation state management**
   ```typescript
   const [calculatedPnLMap, setCalculatedPnLMap] = useState<Map<string, number>>(new Map());
   ```
   - Stores calculated PnL values for each position
   - Updates automatically with price changes

3. **Position enrichment**
   ```typescript
   const enrichPositionsWithCalculatedPnL = useCallback((positionsToEnrich: Position[]): Position[] => {
   ```
   - Enriches positions with calculated PnL values
   - Converts PnL back to USDC wei format for consistency
   - Updates both `pnlRaw` and `pnl` fields

4. **Auto-refresh mechanism**
   - Extended to work in both basic and enhanced modes
   - Refreshes every 10 seconds for real-time updates
   - In basic mode: recalculates PnL using current prices
   - In enhanced mode: fetches enhanced positions data

**Updated Calculations:**
- `totalPnl`: Now uses enriched positions with real-time calculations
- `profitablePositions`/`unprofitablePositions`: Use calculated PnL values
- `totalMargin`: Uses enriched positions for consistency

### 3. Token Price Service Integration

The hook now leverages the existing token price service infrastructure:
- `getTokenPriceService()`: Gets singleton instance
- `calculatePositionPnL()`: Calculates real-time PnL based on current prices
- Supports multiple price sources: Lemon Oracle, DexScreener, CoinGecko

## Benefits

### 1. Real-time Accuracy
- PnL values update based on current market prices
- No dependency on potentially stale subgraph data
- Micro price changes are detected and reflected

### 2. Better User Experience
- More responsive position values
- Accurate profit/loss calculations
- Consistent updates across basic and enhanced modes

### 3. Improved Data Flow
- Clean separation: subgraph for position data, price service for PnL
- Existing components work without changes (backward compatibility)
- Centralized PnL calculation logic

## Technical Details

### Data Flow

1. **API Layer**: Returns positions with `pnlRaw: null` for open positions
2. **Hook Layer**: Calculates real-time PnL using token price service
3. **Component Layer**: Receives positions with enriched PnL values

### Calculation Logic

For **Open Positions**:
```typescript
// Calculate using current market price
const pnlCalculation = await tokenPriceService.calculatePositionPnL(
  tokenSymbol, entryPrice, margin, leverage, isLong, liquidationPrice
);
```

For **Closed Positions**:
```typescript
// Use finalPnl from subgraph (historical data)
const pnl = parseFloat(position.pnlRaw) / 1e6;
```

### Auto-refresh Strategy

- **Enhanced Mode**: Fetches complete enhanced positions (includes price + PnL)
- **Basic Mode**: Recalculates PnL with current prices only
- **Interval**: 10 seconds for responsive updates
- **Condition**: Only when wallet connected and has open positions

## Backward Compatibility

- Existing components continue to work without modification
- `pnlRaw` field still exists and contains calculated values
- API response format remains the same
- Enhanced positions retain all existing fields

## Testing

Run the test script to verify the implementation:
```bash
node scripts/test-pnl-calculations.js
```

Manual testing steps:
1. Connect wallet with open positions
2. Verify PnL values update with market changes
3. Test both basic and enhanced modes
4. Check auto-refresh functionality

## Performance Considerations

- PnL calculations only run for open positions
- Price data is cached by the token price service
- Calculations run asynchronously to avoid blocking UI
- Error handling prevents failed calculations from breaking the UI

## Future Enhancements

- Consider adding PnL calculation caching with TTL
- Implement WebSocket connections for real-time price updates
- Add user preference for refresh intervals
- Consider batching position calculations for better performance
