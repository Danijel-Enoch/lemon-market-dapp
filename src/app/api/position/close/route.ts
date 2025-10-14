/**
 * Position Close API
 *
 * This API endpoint handles the closing of synthetic perpetual positions.
 * It fetches real-time token prices, creates signed oracle data, and returns
 * transaction parameters that can be executed by the frontend.
 *
 * POST /api/position/close
 * Body: {
 *   positionId: string,     // position ID to close
 *   tokenSymbol: string,    // e.g., "ETH", "BTC"
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
interface ClosePositionRequest {
	positionId: string;
	tokenSymbol: string;
	userAddress: string;
	tokenAddress: string;
	pairAddress?: string; // Optional pair address for more accurate price fetching
}

interface OracleData {
	tokenSymbol: string;
	price: bigint;
	timestamp: bigint;
	nonce: bigint;
	virtualFunding: bigint;
}

interface ClosePositionResponse {
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

	// Match the exact format from the test - updated to remove volatilityTier
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

	console.log("Signing oracle data for close position:");
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
		const body: ClosePositionRequest = await request.json();

		// Validate request parameters
		if (!body.positionId || !body.tokenSymbol || !body.userAddress) {
			return NextResponse.json(
				{ success: false, error: "Missing required parameters" },
				{ status: 400 }
			);
		}
		if (!body.tokenAddress) {
			return NextResponse.json(
				{ success: false, error: "Missing token address parameter" },
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
		// if (!isValidTokenSymbol(body.tokenSymbol)) {
		// 	return NextResponse.json(
		// 		{ success: false, error: "Invalid token symbol format" },
		// 		{ status: 400 }
		// 	);
		// }

		// Validate user address format
		if (!/^0x[a-fA-F0-9]{40}$/.test(body.userAddress)) {
			return NextResponse.json(
				{ success: false, error: "Invalid user address format" },
				{ status: 400 }
			);
		}

		// Fetch current price using enhanced token price service
		let tokenPriceData;
		try {
			console.log(
				`Fetching current price for ${body.tokenSymbol} to close position`
			);

			const tokenPriceService = getTokenPriceService();
			tokenPriceData = await tokenPriceService.getTokenPriceWithAddress(
				body.tokenAddress
			);

			if (tokenPriceData) {
				console.log(
					`Successfully fetched price: $${tokenPriceData.data
						?.averagePrice!} for ${body.tokenSymbol}`,
					`(source: ${tokenPriceData.data?.bestPriceUSD?.dex}, confidence: ${tokenPriceData.success})`
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
			!tokenPriceData.data?.averagePrice! ||
			parseFloat(tokenPriceData.data.averagePrice) <= 0
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
		const priceValue = parseFloat(tokenPriceData.data.averagePrice);
		const priceInWei = parseUnits(priceValue.toFixed(18), 18);

		// For closing positions, market should already exist, so virtual funding is zero
		const virtualFunding = BigInt(0);

		const oracleData: OracleData = {
			tokenSymbol:
				body.tokenSymbol.toUpperCase() + "_PERP_" + body.tokenAddress,
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
				functionName: "closePosition",
				args: [
					BigInt(positionIdNum),
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

		const response: ClosePositionResponse = {
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
		console.error("Error closing position:", error);

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
			endpoint: "Position Close API",
			contract: SyntheticPerpetualContract,
			requiredParams: {
				positionId: 'string (e.g., "123")',
				tokenSymbol: 'string (e.g., "ETH", "BTC")',
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
