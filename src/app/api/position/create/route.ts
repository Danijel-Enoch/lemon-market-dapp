/**
 * Position Creation API
 *
 * This API endpoint handles the creation of synthetic perpetual positions.
 * It fetches real-time token prices, creates signed oracle data, and returns
 * transaction parameters that can be executed by the frontend.
 *
 * POST /api/position/create
 * Body: {
 *   tokenSymbol: string,    // e.g., "ETH", "BTC"
 *   isLong: boolean,        // true for long, false for short
 *   margin: string,         // margin amount in USDC (e.g., "100.00")
 *   leverage: number,       // leverage multiplier (1-100)
 *   userAddress: string,    // user's wallet address
 *   pairAddress?: string    // optional pair address for accurate pricing
 * }
 *
 * Returns: {
 *   success: boolean,
 *   data?: {
 *     to: string,           // contract address
 *     data: string,         // transaction calldata
 *     value: string,        // ETH value (always "0x0")
 *     gasEstimate?: string  // estimated gas cost (as string)
 *   },
 *   error?: string
 * }
 *
 * GET /api/position/create - Health check and API info
 */

import { NextRequest, NextResponse } from "next/server";
import {
	createPublicClient,
	createWalletClient,
	http,
	parseUnits,
	encodeFunctionData,
	keccak256,
	encodePacked,
	verifyMessage,
	recoverMessageAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, localhost, mainnet } from "viem/chains";
import { SyntheticPerpetualContract, SyntheticAbi } from "@/lib/contracts";
import { getTokenPrice, getTokenPriceByPair } from "@/lib/oracle";

// Types for the API request and response
interface CreatePositionRequest {
	tokenSymbol: string;
	isLong: boolean;
	margin: string; // in USDC
	leverage: number;
	userAddress: string;
	pairAddress?: string; // Optional pair address for more accurate price fetching
}

interface OracleData {
	tokenSymbol: string;
	price: bigint;
	timestamp: bigint;
	nonce: bigint;
}

interface CreatePositionResponse {
	success: boolean;
	data?: {
		to: string;
		data: string;
		value: string;
		gasEstimate?: string;
	};
	error?: string;
}

// Initialize clients
const publicClient = createPublicClient({
	chain: hardhat,
	transport: http()
});

// Helper function to create oracle signature
async function signOracleData(
	oracleData: OracleData,
	traderAddress: string
): Promise<string> {
	const privateKey =
		"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

	if (!privateKey) {
		throw new Error("Admin private key not found");
	}

	const account = privateKeyToAccount(privateKey);

	const walletClient = createWalletClient({
		account,
		chain: hardhat, // Match the chain used for the client
		transport: http()
	});

	// Match the exact format from the test:
	// ethers.keccak256(ethers.solidityPacked(["string", "uint256", "uint256", "uint256", "address"],
	//   [TOKEN_SYMBOL, INITIAL_PRICE, timestamp, nonce, trader1Address]))
	const message = encodePacked(
		["string", "uint256", "uint256", "uint256", "address"],
		[
			oracleData.tokenSymbol,
			oracleData.price,
			oracleData.timestamp,
			oracleData.nonce,
			traderAddress as `0x${string}` // This is the trader address, not admin address!
		]
	);

	console.log("Signing oracle data (matching test format):");
	console.log("- Token:", oracleData.tokenSymbol);
	console.log("- Price:", oracleData.price.toString());
	console.log("- Timestamp:", oracleData.timestamp.toString());
	console.log("- Nonce:", oracleData.nonce.toString());
	console.log("- Trader address:", traderAddress);
	console.log("- Admin signer address:", account.address);
	console.log("- Message to sign:", message);

	const messageHash = keccak256(message);
	console.log("- Message hash:", messageHash);

	// Use signMessage (not sign) to match ethers.signMessage behavior
	// This adds the Ethereum signed message prefix like the test does
	const signature = await walletClient.signMessage({
		account,
		message: { raw: messageHash }
	});

	console.log("Generated signature:", signature);
	return signature;
}

// Helper function to generate nonce (timestamp + random for uniqueness)
function generateNonce(): bigint {
	const timestamp = BigInt(Date.now());
	const random = BigInt(Math.floor(Math.random() * 1000000));
	return timestamp * BigInt(1000000) + random;
}

// Helper function to validate token symbol
function isValidTokenSymbol(symbol: string): boolean {
	// Basic validation for token symbols (alphanumeric, 1-10 characters)
	return /^[A-Za-z0-9]{1,10}$/.test(symbol);
}

// Helper function to verify signature locally (for debugging)
async function verifySignatureLocallyWithTrader(
	oracleData: OracleData,
	signature: string,
	expectedSigner: `0x${string}`,
	traderAddress: string
): Promise<boolean> {
	try {
		// Match the exact format: oracle data + trader address
		const message = encodePacked(
			["string", "uint256", "uint256", "uint256", "address"],
			[
				oracleData.tokenSymbol,
				oracleData.price,
				oracleData.timestamp,
				oracleData.nonce,
				traderAddress as `0x${string}`
			]
		);

		const messageHash = keccak256(message);

		// Try to recover the signer address from the signature
		const recoveredAddress = await recoverMessageAddress({
			message: { raw: messageHash },
			signature: signature as `0x${string}`
		});

		console.log("Local signature verification:");
		console.log("- Expected signer:", expectedSigner);
		console.log("- Recovered address:", recoveredAddress);
		console.log("- Trader address in message:", traderAddress);
		console.log(
			"- Signature valid:",
			recoveredAddress.toLowerCase() === expectedSigner.toLowerCase()
		);

		return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
	} catch (error) {
		console.error("Local signature verification failed:", error);
		return false;
	}
}

export async function POST(request: NextRequest) {
	try {
		const body: CreatePositionRequest = await request.json();

		// Validate request parameters
		if (
			!body.tokenSymbol ||
			!body.userAddress ||
			!body.margin ||
			body.leverage === undefined
		) {
			return NextResponse.json(
				{ success: false, error: "Missing required parameters" },
				{ status: 400 }
			);
		}

		// Validate token symbol format
		if (!isValidTokenSymbol(body.tokenSymbol)) {
			return NextResponse.json(
				{ success: false, error: "Invalid token symbol format" },
				{ status: 400 }
			);
		}

		// Validate user address format
		if (!/^0x[a-fA-F0-9]{40}$/.test(body.userAddress)) {
			return NextResponse.json(
				{ success: false, error: "Invalid user address format" },
				{ status: 400 }
			);
		}

		// Validate leverage bounds (check contract MAX_LEVERAGE)
		if (body.leverage <= 0 || body.leverage > 100) {
			return NextResponse.json(
				{
					success: false,
					error: "Invalid leverage value. Must be between 1 and 100"
				},
				{ status: 400 }
			);
		}

		// Validate margin amount
		const marginAmount = parseFloat(body.margin);
		if (isNaN(marginAmount) || marginAmount <= 0) {
			return NextResponse.json(
				{ success: false, error: "Invalid margin amount" },
				{ status: 400 }
			);
		}

		// Fetch current price from oracle
		let tokenPrice;
		try {
			// Use pair address for more accurate pricing if available
			if (body.pairAddress) {
				console.log(
					`Fetching price using pair address: ${body.pairAddress} for ${body.tokenSymbol}`
				);
				// For Ethereum mainnet, use 'ethereum' as chainId for DexScreener
				tokenPrice = await getTokenPriceByPair(body.pairAddress, "bsc");

				if (tokenPrice) {
					console.log(
						`Successfully fetched price from pair: $${tokenPrice.priceUsd} for ${tokenPrice.symbol}`
					);
				}
			}

			// Fallback to token symbol if pair address fails or not provided
			if (!tokenPrice) {
				console.log(
					`Fetching price using token symbol: ${body.tokenSymbol} (fallback method)`
				);
				tokenPrice = await getTokenPrice(
					body.tokenSymbol.toLowerCase(),
					"bsc"
				);

				if (tokenPrice) {
					console.log(
						`Successfully fetched price from symbol: $${tokenPrice.priceUsd} for ${tokenPrice.symbol}`
					);
				}
			}
		} catch (error) {
			console.error("Oracle price fetch error:", error);
			return NextResponse.json(
				{
					success: false,
					error: "Failed to fetch current token price"
				},
				{ status: 503 }
			);
		}

		if (!tokenPrice || !tokenPrice.priceUsd || tokenPrice.priceUsd <= 0) {
			return NextResponse.json(
				{
					success: false,
					error: `Unable to get valid price for token: ${body.tokenSymbol}`
				},
				{ status: 404 }
			);
		}

		// Prepare oracle data
		const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
		const nonce = generateNonce();

		// Convert price to appropriate decimals (18 decimals for price oracle)
		const priceInWei = parseUnits(tokenPrice.priceUsd.toFixed(18), 18);

		const oracleData: OracleData = {
			tokenSymbol: body.tokenSymbol.toUpperCase(),
			price: priceInWei,
			timestamp: currentTimestamp,
			nonce: nonce
		};

		// Sign the oracle data
		let signature: string;
		try {
			signature = await signOracleData(oracleData, body.userAddress);

			// Verify signature locally for debugging
			const privateKey =
				"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
			const signerAddress = privateKeyToAccount(privateKey).address;
			const isValid = await verifySignatureLocallyWithTrader(
				oracleData,
				signature,
				signerAddress,
				body.userAddress
			);
			console.log("Local signature verification result:", isValid);
		} catch (error) {
			console.error("Oracle signing error:", error);
			return NextResponse.json(
				{ success: false, error: "Failed to sign oracle data" },
				{ status: 500 }
			);
		}

		// Convert margin to wei (USDC has 6 decimals)
		const marginInWei = parseUnits(body.margin, 6);

		// Encode the function call data
		let calldata: `0x${string}`;
		try {
			calldata = encodeFunctionData({
				abi: SyntheticAbi,
				functionName: "openPosition",
				args: [
					oracleData.tokenSymbol,
					body.isLong,
					marginInWei,
					BigInt(body.leverage),
					{
						tokenSymbol: oracleData.tokenSymbol,
						price: oracleData.price,
						timestamp: oracleData.timestamp,
						nonce: oracleData.nonce
					},
					signature
				]
			});
		} catch (error) {
			console.error("Calldata encoding error:", error);
			return NextResponse.json(
				{ success: false, error: "Failed to encode transaction data" },
				{ status: 500 }
			);
		}

		// Estimate gas (optional)
		let gasEstimate: bigint | undefined;
		try {
			gasEstimate = await publicClient.estimateGas({
				account: body.userAddress as `0x${string}`,
				to: SyntheticPerpetualContract as `0x${string}`,
				data: calldata
			});
		} catch (error) {
			console.warn("Gas estimation failed:", error);
			// Gas estimation failure is not critical, continue without it
		}

		const response: CreatePositionResponse = {
			success: true,
			data: {
				to: SyntheticPerpetualContract,
				data: calldata,
				value: "0x0", // No ETH value needed
				gasEstimate: gasEstimate ? gasEstimate.toString() : undefined
			}
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error("Error creating position:", error);

		return NextResponse.json(
			{
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Internal server error"
			},
			{ status: 500 }
		);
	}
}

// GET endpoint for health check and API information
export async function GET() {
	try {
		// Check if admin private key is configured
		const hasPrivateKey = !!process.env.PK;

		// Check if we can connect to the blockchain
		let blockNumber: bigint | null = null;
		try {
			blockNumber = await publicClient.getBlockNumber();
		} catch (error) {
			console.error("Blockchain connection error:", error);
		}

		return NextResponse.json({
			success: true,
			status: "healthy",
			contract: SyntheticPerpetualContract,
			chain: "ethereum",
			adminConfigured: hasPrivateKey,
			blockchainConnected: blockNumber !== null,
			currentBlock: blockNumber?.toString(),
			endpoints: {
				create: "POST /api/position/create",
				healthCheck: "GET /api/position/create"
			},
			requiredParams: {
				tokenSymbol: 'string (e.g., "ETH", "BTC")',
				isLong: "boolean",
				margin: "string (amount in USDC)",
				leverage: "number (1-100)",
				userAddress: "string (0x...)",
				pairAddress: "string (optional, for accurate pricing)"
			}
		});
	} catch (error) {
		return NextResponse.json(
			{
				success: false,
				status: "unhealthy",
				error: error instanceof Error ? error.message : "Unknown error"
			},
			{ status: 500 }
		);
	}
}
