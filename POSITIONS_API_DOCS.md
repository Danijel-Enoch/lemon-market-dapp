# Positions API Documentation

## Overview
The Positions API allows you to fetch user positions from the Lemon Loopa subgraph. This API provides real-time position data including PnL, margin, leverage, and position status.

## Endpoints

### GET /api/positions

Fetches all positions for a specific trader address.

**Parameters:**
- `trader` (required): The Ethereum address of the trader (must be a valid 40-character hex address starting with 0x)

**Response Format:**
```typescript
{
  success: boolean;
  positions: Position[];
  count: number;
  error?: string;
  details?: any;
}
```

**Position Object:**
```typescript
{
  id: string;                    // Unique position identifier
  positionId: string;            // Position ID from contract
  pair: string;                  // Trading pair (e.g., "BTC/USDT")
  side: "Long" | "Short";        // Position direction
  tokenSymbol: string;           // Token symbol (e.g., "BTC")
  isLong: boolean;               // True for long positions
  entryPrice: string;            // Entry price formatted as currency
  exitPrice?: string | null;     // Exit price (null for open positions)
  margin: string;                // Margin amount formatted as currency
  leverage: string;              // Leverage formatted (e.g., "10x")
  leverageValue: number;         // Leverage as number
  liquidationPrice: string;      // Liquidation price formatted as currency
  status: string;                // Position status ("OPEN", "CLOSED", etc.)
  pnl: string;                   // PnL formatted as currency
  pnlRaw: string | null;         // Raw PnL value in wei
  openedAt: string;              // ISO timestamp when position opened
  lastUpdatedAt: string;         // ISO timestamp of last update
  lastTransactionHash: string;   // Hash of last transaction
  trader: string;                // Trader address
}
```

## Usage Examples

### JavaScript/TypeScript
```typescript
import { getUserPositions } from '@/lib/position-api';

// Fetch positions for a user
const response = await getUserPositions('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');

if (response.success) {
  console.log(`Found ${response.count} positions`);
  response.positions.forEach(position => {
    console.log(`${position.pair} ${position.side} - PnL: ${position.pnl}`);
  });
} else {
  console.error('Error:', response.error);
}
```

### React Hook
```typescript
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { getUserPositions, type Position } from '@/lib/position-api';

export function useUserPositions() {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = async () => {
    if (!address) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await getUserPositions(address);
      if (response.success) {
        setPositions(response.positions);
      } else {
        setError(response.error || 'Failed to fetch positions');
      }
    } catch (err) {
      setError('Failed to load positions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchPositions();
    } else {
      setPositions([]);
      setError(null);
    }
  }, [isConnected, address]);

  return {
    positions,
    isLoading,
    error,
    refetch: fetchPositions
  };
}
```

### cURL
```bash
# Fetch positions for a specific address
curl "http://localhost:3000/api/positions?trader=0x70997970c51812dc3a010c7d01b50e0d17dc79c8"

# Example response
{
  "success": true,
  "positions": [
    {
      "id": "0x70997970c51812dc3a010c7d01b50e0d17dc79c801000000",
      "positionId": "1",
      "pair": "TST/USDT",
      "side": "Long",
      "tokenSymbol": "TST",
      "isLong": true,
      "entryPrice": "$0.03",
      "exitPrice": null,
      "margin": "$100.00",
      "leverage": "2x",
      "leverageValue": 2,
      "liquidationPrice": "$0.00",
      "status": "OPEN",
      "pnl": "$0.00",
      "pnlRaw": null,
      "openedAt": "2025-10-01T10:21:42.000Z",
      "lastUpdatedAt": "2025-10-01T10:21:42.000Z",
      "lastTransactionHash": "0x49ab666fe5b5c51f76ccc632ec7229cf962ea394ff193ebbc50985482acf9ef5",
      "trader": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
    }
  ],
  "count": 1
}
```

## Error Handling

The API provides comprehensive error handling:

### 400 Bad Request
- Missing trader parameter
- Invalid trader address format

### 500 Internal Server Error
- Subgraph connection issues
- GraphQL query errors
- Server-side processing errors

## Helper Functions

The `position-api.ts` library provides several utility functions:

- `calculatePnlPercentage(pnlRaw, margin)` - Calculate PnL percentage
- `isPositionProfitable(pnlRaw)` - Check if position is profitable
- `formatPositionSize(margin, leverage, entryPrice, tokenSymbol)` - Format position size for display

## Frontend Integration

The positions are automatically displayed in the perpetual trading interface at `/perp`. Features include:

- Real-time position loading
- Automatic refresh when wallet connects/disconnects
- Position updates after successful trades
- Loading states and error handling
- Empty state when no positions exist

## Subgraph Configuration

The API connects to the Lemon subgraph at `http://localhost:8000/subgraphs/name/lemon`. 

To test subgraph connectivity:
```bash
node scripts/test-subgraph.js
```

## Data Format Notes

- Prices and amounts are converted from wei format to human-readable values
- Timestamps are converted from Unix timestamps to ISO strings
- All currency values are formatted with $ prefix and proper decimal places
- Null/undefined values are handled gracefully with fallback to $0.00
