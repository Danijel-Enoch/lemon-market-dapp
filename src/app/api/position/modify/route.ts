/**
 * Position Modify API
 *
 * This API endpoint handles the modification of synthetic perpetual positions.
 * It fetches real-time token prices, creates signed oracle data, and returns
 * transaction parameters that can be executed by the frontend.
 *
 * POST /api/position/modify
 * Body: {
 *   positionId: string,     // position ID to modify
 *   tokenSymbol: string,    // e.g., "ETH", "BTC"
 *   newMargin: string,      // new margin amount in USDC
 *   newLeverage: number,    // new leverage multiplier (1-100)
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
 */

import { NextRequest, NextResponse } from "next/server";
import {
	createPublicClient,
	createWalletClient,
	http,
	encodeFunctionData,
	encodePacked,
	keccak256,
	parseUnits
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, sepolia } from "viem/chains";
import { SyntheticPerpetualContract, SyntheticAbi } from "@/lib/contracts";
import { getTokenPriceService } from "@/lib/token-price-service";
import { calculateVirtualFunding } from "@/lib/volatility-utils";

// Types for the API request and response
interface ModifyPositionRequest {
	positionId: string;
	tokenSymbol: string;
	newMargin: string; // in USDC
	newLeverage: number;
	userAddress: string;
	pairAddress?: string; // Optional pair address for more accurate price fetching
}

interface OracleData {
	tokenSymbol: string;
	price: bigint;
	timestamp: bigint;
	nonce: bigint;
	virtualFunding: bigint;
}

interface ModifyPositionResponse {
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
	chain: process.env.NODE_ENV === "development" ? hardhat : sepolia,
	transport: http()
});

// Helper function to create oracle signature
async function signOracleData(
	oracleData: OracleData,
	traderAddress: string
): Promise<string> {
	const privateKey = process.env.ADMIN_PRIVATE_KEY as `0x${string}`;

	if (!privateKey) {
		throw new Error("Admin private key not found");
	}

	const account = privateKeyToAccount(privateKey);

	const walletClient = createWalletClient({
		account,
		chain: process.env.NODE_ENV === "development" ? hardhat : sepolia,
		transport: http()
	});

	// Updated format without volatilityTier
	const message = encodePacked(
		["string", "uint256", "uint256", "uint256", "uint256", "address"],
		[
			oracleData.tokenSymbol,
			oracleData.price,
			oracleData.timestamp,
			oracleData.nonce,
			oracleData.virtualFunding,
			traderAddress as `0x${string}`
		]
	);

	console.log("Signing oracle data for modify position:");
	console.log("- Token:", oracleData.tokenSymbol);
	console.log("- Price:", oracleData.price.toString());
	console.log("- Timestamp:", oracleData.timestamp.toString());
	console.log("- Nonce:", oracleData.nonce.toString());
	console.log("- Virtual Funding:", oracleData.virtualFunding.toString());
	console.log("- Trader address:", traderAddress);

	const messageHash = keccak256(message);
	const signature = await walletClient.signMessage({
		account,
		message: { raw: messageHash }
	});

	console.log("Generated signature:", signature);
	return signature;
}

// Helper function to generate nonce
function generateNonce(): bigint {
	const timestamp = BigInt(Date.now());
	const random = BigInt(Math.floor(Math.random() * 1000000));
	return timestamp * BigInt(1000000) + random;
}

// Helper function to validate token symbol
function isValidTokenSymbol(symbol: string): boolean {
	return /^[A-Za-z0-9]{1,10}$/.test(symbol);
}

export async function POST(request: NextRequest) {
	try {
		const body: ModifyPositionRequest = await request.json();

		// Validate request parameters
		if (
			!body.positionId ||
			!body.tokenSymbol ||
			!body.userAddress ||
			!body.newMargin ||
			body.newLeverage === undefined
		) {
			return NextResponse.json(
				{ success: false, error: "Missing required parameters" },
				{ status: 400 }
			);
		}

		// Validate position ID format
		const positionIdNum = parseInt(body.positionId);
		if (isNaN(positionIdNum) || positionIdNum < 0) {
			return NextResponse.json(
				{ success: false, error: "Invalid position ID format" },
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

		// Validate leverage bounds
		if (body.newLeverage <= 0 || body.newLeverage > 100) {
			return NextResponse.json(
				{
					success: false,
					error: "Invalid leverage value. Must be between 1 and 100"
				},
				{ status: 400 }
			);
		}

		// Validate margin amount
		const marginAmount = parseFloat(body.newMargin);
		if (isNaN(marginAmount) || marginAmount <= 0) {
			return NextResponse.json(
				{ success: false, error: "Invalid margin amount" },
				{ status: 400 }
			);
		}

		// Fetch current price using enhanced token price service
		let tokenPriceData;
		try {
			console.log(
				`Fetching current price for ${body.tokenSymbol} to modify position`
			);

			const tokenPriceService = getTokenPriceService();
			tokenPriceData = await tokenPriceService.getTokenPrice(
				body.tokenSymbol,
				body.pairAddress
			);

			if (tokenPriceData) {
				console.log(
					`Successfully fetched price: $${tokenPriceData.priceUSD} for ${body.tokenSymbol}`,
					`(source: ${tokenPriceData.source}, confidence: ${tokenPriceData.confidence})`
				);
			}
		} catch (error) {
			console.error("Token price service error:", error);
			return NextResponse.json(
				{
					success: false,
					error: "Failed to fetch current token price from oracle service"
				},
				{ status: 503 }
			);
		}

		if (
			!tokenPriceData ||
			!tokenPriceData.priceUSD ||
			parseFloat(tokenPriceData.priceUSD) <= 0
		) {
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
		const priceValue = parseFloat(tokenPriceData.priceUSD);
		const priceInWei = parseUnits(priceValue.toFixed(18), 18);

		const marginInWei = parseUnits(body.newMargin, 6);

		// For modifying positions, market should already exist, so virtual funding is zero
		const virtualFunding = BigInt(0);

		const oracleData: OracleData = {
			tokenSymbol:
				body.tokenSymbol.toUpperCase() + tokenPriceData.tokenAddress,
			price: priceInWei,
			timestamp: currentTimestamp,
			nonce: nonce,
			virtualFunding: virtualFunding
		};

		// Sign the oracle data
		let signature: string;
		try {
			signature = await signOracleData(oracleData, body.userAddress);
		} catch (error) {
			console.error("Oracle signing error:", error);
			return NextResponse.json(
				{ success: false, error: "Failed to sign oracle data" },
				{ status: 500 }
			);
		}

		// Encode the function call data
		let calldata: `0x${string}`;
		try {
			calldata = encodeFunctionData({
				abi: SyntheticAbi,
				functionName: "modifyPosition",
				args: [
					BigInt(positionIdNum),
					marginInWei,
					BigInt(body.newLeverage),
					{
						tokenSymbol: oracleData.tokenSymbol,
						price: oracleData.price,
						timestamp: oracleData.timestamp,
						nonce: oracleData.nonce,
						virtualFunding: oracleData.virtualFunding
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

		const response: ModifyPositionResponse = {
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
		console.error("Error modifying position:", error);

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
		return NextResponse.json({
			success: true,
			status: "healthy",
			endpoint: "Position Modify API",
			contract: SyntheticPerpetualContract,
			requiredParams: {
				positionId: 'string (e.g., "123")',
				tokenSymbol: 'string (e.g., "ETH", "BTC")',
				newMargin: "string (amount in USDC)",
				newLeverage: "number (1-100)",
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
