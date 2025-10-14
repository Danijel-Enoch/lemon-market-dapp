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
	encodeFunctionData,
	encodePacked,
	keccak256,
	parseUnits,
	recoverMessageAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, localhost, sepolia } from "viem/chains";
import { SyntheticPerpetualContract, SyntheticAbi } from "@/lib/contracts";
import { getTokenPriceService } from "@/lib/token-price-service";
import {
	calculateVirtualFunding,
	calculateVirtualFundingForMarket
} from "@/lib/volatility-utils";

// Types for the API request and response
interface CreatePositionRequest {
	tokenSymbol: string;
	isLong: boolean;
	margin: string; // in USDC
	leverage: number;
	tokenAddress: string;
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
	chain: sepolia,
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

	console.log("Using admin private key for signing:", privateKey);

	const account = privateKeyToAccount(privateKey);

	const walletClient = createWalletClient({
		account,
		chain: sepolia, // Match the chain used for the client
		transport: http()
	});

	console.log({ oracleData, traderAddress });

	// Updated format without volatilityTier
	const message = encodePacked(
		["string", "uint256", "uint256", "uint256", "uint256", "address"],
		[
			oracleData.tokenSymbol,
			oracleData.price,
			oracleData.timestamp,
			oracleData.nonce,
			oracleData.virtualFunding,
			traderAddress as `0x${string}` // This is the trader address, not admin address!
		]
	);

	console.log("Signing oracle data (updated format):");
	console.log("- Token:", oracleData.tokenSymbol);
	console.log("- Price:", oracleData.price.toString());
	console.log("- Timestamp:", oracleData.timestamp.toString());
	console.log("- Nonce:", oracleData.nonce.toString());
	console.log("- Virtual Funding:", oracleData.virtualFunding.toString());
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
		// Match the exact format: oracle data + trader address (updated format)
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

// Helper function to check market existence and get available liquidity
async function checkMarketAndLiquidity(tokenSymbol: string): Promise<{
	marketExists: boolean;
	availableLiquidity: bigint;
}> {
	try {
		// Check if virtual market exists
		const marketExists = (await publicClient.readContract({
			address: SyntheticPerpetualContract,
			abi: SyntheticAbi,
			functionName: "virtualMarketExists",
			args: [tokenSymbol.toUpperCase()]
		})) as boolean;

		// Get available liquidity using the formula: availableLiquidity = totalLiquidity - totalAllocatedLiquidity
		const totalLiquidity = (await publicClient.readContract({
			address: SyntheticPerpetualContract,
			abi: SyntheticAbi,
			functionName: "totalLiquidity",
			args: []
		})) as bigint;

		const totalAllocatedLiquidity = (await publicClient.readContract({
			address: SyntheticPerpetualContract,
			abi: SyntheticAbi,
			functionName: "totalAllocatedLiquidity",
			args: []
		})) as bigint;

		const availableLiquidity = totalLiquidity - totalAllocatedLiquidity;

		console.log(`Market check for ${tokenSymbol}:`);
		console.log(`- Market exists: ${marketExists}`);
		console.log(`- Total liquidity: ${totalLiquidity.toString()}`);
		console.log(
			`- Total allocated liquidity: ${totalAllocatedLiquidity.toString()}`
		);
		console.log(`- Available liquidity: ${availableLiquidity.toString()}`);

		return { marketExists, availableLiquidity };
	} catch (error) {
		console.error("Error checking market and liquidity:", error);
		// If we can't check, assume market exists to be safe (virtual funding = 0)
		return { marketExists: true, availableLiquidity: BigInt(0) };
	}
}

export async function POST(request: NextRequest) {
	console.log("Received create position request");
	try {
		const body: CreatePositionRequest = await request.json();

		// Validate request parameters
		if (
			!body.tokenSymbol ||
			!body.userAddress ||
			!body.margin ||
			body.leverage === undefined
		) {
			console.log("Missing required parameters");
			return NextResponse.json(
				{ success: false, error: "Missing required parameters" },
				{ status: 400 }
			);
		}

		// Validate token symbol format
		// if (!(body.tokenSymbol)) {
		// 	console.log("Invalid token symbol format");
		// 	return NextResponse.json(
		// 		{ success: false, error: "Invalid token symbol format" },
		// 		{ status: 400 }
		// 	);
		// }

		// Validate user address format
		if (!/^0x[a-fA-F0-9]{40}$/.test(body.userAddress)) {
			console.log("Invalid user address format");
			return NextResponse.json(
				{ success: false, error: "Invalid user address format" },
				{ status: 400 }
			);
		}
		if (!/^0x[a-fA-F0-9]{40}$/.test(body.tokenAddress)) {
			console.log("Invalid token address format");
			return NextResponse.json(
				{ success: false, error: "Invalid token address format" },
				{ status: 400 }
			);
		}

		// Validate leverage bounds (check contract MAX_LEVERAGE)
		if (body.leverage <= 0 || body.leverage > 100) {
			console.log("Invalid leverage value");
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
			console.log("Invalid margin amount");
			return NextResponse.json(
				{ success: false, error: "Invalid margin amount" },
				{ status: 400 }
			);
		}

		// Fetch current price from oracle
		let tokenPrice;
		try {
			// Use the token price service to get current token price
			const tokenPriceService = getTokenPriceService();
			tokenPrice = await tokenPriceService.getTokenPriceWithAddress(
				body.tokenAddress
			);

			if (tokenPrice) {
				console.log(
					`Successfully fetched price: $${tokenPrice.data?.averagePriceUSD} for ${body.tokenSymbol}`,
					`(source: ${tokenPrice.data?.bestPrice?.dex}, confidence: ${tokenPrice.data?.bestPrice?.success})`
				);
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

		if (
			!tokenPrice ||
			!tokenPrice.data?.bestPriceUSD ||
			parseFloat(tokenPrice.data?.bestPriceUSD?.price!) <= 0
		) {
			return NextResponse.json(
				{
					success: false,
					error: `Unable to get valid price for token: ${body.tokenSymbol}`
				},
				{ status: 500 }
			);
		}

		// Prepare oracle data
		const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
		const nonce = generateNonce();

		// Convert price to appropriate decimals (18 decimals for price oracle)
		const priceValue = parseFloat(tokenPrice.data.bestPriceUSD.priceUSD!);
		const priceInWei = parseUnits(priceValue.toFixed(18), 18);

		// Check if market exists and get available liquidity to calculate virtual funding
		const { marketExists, availableLiquidity } =
			await checkMarketAndLiquidity(body.tokenSymbol);

		console.log(
			`Calculating virtual funding for ${body.tokenSymbol}...`,
			`Market exists: ${marketExists}, Available liquidity: ${availableLiquidity.toString()}`
		);

		// Calculate virtual funding based on market existence and available liquidity
		const virtualFunding = calculateVirtualFundingForMarket(
			availableLiquidity,
			marketExists
		);

		console.log(
			`Virtual funding calculated for ${
				body.tokenSymbol
			}: ${virtualFunding.toString()}`
		);
		if (marketExists) {
			console.log("Market already exists - virtual funding set to zero");
		} else if (availableLiquidity <= BigInt(0)) {
			console.log(
				"No allocatable funds available - virtual funding set to zero"
			);
		} else {
			const masterFund = (availableLiquidity * BigInt(3)) / BigInt(100);
			console.log(
				`Master fund amount (3% of ${availableLiquidity.toString()}): ${masterFund.toString()}`
			);
		}
		console.log(
			`Final virtual funding to be used in oracle data: ${virtualFunding.toString()}`
		);

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

			// Verify signature locally for debugging
			const privateKey = process.env.ADMIN_PRIVATE_KEY as `0x${string}`;
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
