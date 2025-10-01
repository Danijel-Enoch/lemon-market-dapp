# Position Creation API Usage

This document explains how to use the position creation API endpoint.

## Environment Setup

Make sure you have the following environment variable set in your `.env.local` file:

```bash
PK=0x... # Admin private key for signing oracle data
ETHEREUM_RPC_URL=https://eth.llamarpc.com # Optional: Custom RPC endpoint
```

## API Endpoints

### POST /api/position/create

Creates a new synthetic perpetual position.

**Request Body:**
```json
{
  "tokenSymbol": "ETH",
  "isLong": true,
  "margin": "100.00",
  "leverage": 5,
  "userAddress": "0x742d35Cc6634C0532925a3b8D060C0D7D28C8fEB",
  "pairAddress": "0x638f567d445E60E1aC1AfD369f53176FE9D5F93D"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "to": "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
    "data": "0x...", // Transaction calldata
    "value": "0x0",
    "gasEstimate": "150000"
  }
}
```

### GET /api/position/create

Health check endpoint that returns API status and configuration info.

## Usage Examples

### Frontend JavaScript/TypeScript

```typescript
// Create a long ETH position with 100 USDC margin and 5x leverage
async function createPosition() {
  try {
    const response = await fetch('/api/position/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tokenSymbol: 'ETH',
        isLong: true,
        margin: '100.00',
        leverage: 5,
        userAddress: '0x742d35Cc6634C0532925a3b8D060C0D7D28C8fEB',
        pairAddress: '0x638f567d445E60E1aC1AfD369f53176FE9D5F93D'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      // Use the transaction data with your wallet
      const txParams = result.data;
      
      // With wagmi/viem:
      const hash = await writeContract({
        address: txParams.to,
        abi: SyntheticAbi,
        functionName: 'openPosition',
        // The API already encodes the data, so you can send the raw transaction
      });

      // Or send as raw transaction:
      const hash = await sendTransaction({
        to: txParams.to,
        data: txParams.data,
        value: txParams.value,
        gas: txParams.gasEstimate
      });
      
      console.log('Transaction sent:', hash);
    } else {
      console.error('API Error:', result.error);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}
```

### cURL Example

```bash
# Create position
curl -X POST http://localhost:3000/api/position/create \
  -H "Content-Type: application/json" \
  -d '{
    "tokenSymbol": "ETH",
    "isLong": true,
    "margin": "100.00",
    "leverage": 5,
    "userAddress": "0x742d35Cc6634C0532925a3b8D060C0D7D28C8fEB",
    "pairAddress": "0x638f567d445E60E1aC1AfD369f53176FE9D5F93D"
  }'

# Health check
curl -X GET http://localhost:3000/api/position/create
```

## Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `tokenSymbol` | string | Token symbol (1-10 alphanumeric chars) | "ETH", "BTC", "LINK" |
| `isLong` | boolean | Position direction (true=long, false=short) | `true` |
| `margin` | string | Margin amount in USDC | "100.00" |
| `leverage` | number | Leverage multiplier (1-100) | `5` |
| `userAddress` | string | User's wallet address | "0x742d35..." |
| `pairAddress` | string (optional) | Trading pair address for accurate pricing | "0x638f567d..." |

## Error Responses

```json
{
  "success": false,
  "error": "Invalid token symbol format"
}
```

Common error messages:
- "Missing required parameters"
- "Invalid user address format"
- "Invalid leverage value. Must be between 1 and 100"
- "Invalid margin amount"
- "Unable to get valid price for token: [SYMBOL]"
- "Failed to fetch current token price"
- "Failed to sign oracle data"
- "Failed to encode transaction data"

## How It Works

1. **Validation**: The API validates all input parameters
2. **Price Fetching**: Gets current token price from DexScreener/GeckoTerminal
3. **Oracle Signing**: Creates signed oracle data using admin private key
4. **Transaction Encoding**: Encodes the contract call with all parameters
5. **Gas Estimation**: Estimates gas cost for the transaction
6. **Response**: Returns transaction parameters ready for execution

## Security Notes

- The admin private key should be kept secure and never exposed
- Oracle signatures include timestamps and nonces to prevent replay attacks
- All prices are fetched from external APIs and signed by the admin
- The contract validates signatures on-chain before executing positions
