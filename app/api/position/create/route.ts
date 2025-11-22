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

export const dynamic = 'force-dynamic';
export const revalidate = 0;
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

import { type NextRequest, NextResponse } from "next/server";
import {
	createPublicClient,
	createWalletClient,
	encodeFunctionData,
	encodePacked,
	http,
	keccak256,
	parseUnits,
	recoverMessageAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ERC20Abi, SyntheticAbi, SyntheticPerpetualContract, usdc } from "@/lib/contracts";
import { getTokenPriceService } from "@/lib/token-price-service";
import { calculateVirtualFundingForMarket } from "@/lib/volatility-utils";

// Types for the API request and response
interface CreatePositionRequest {
	tokenSymbol: string;
	isLong: boolean;
	margin: string; // margin amount in token units (e.g., 100.0) - specify marginTokenAddress to indicate which token
	leverage: number;
	tokenAddress: string;
	marginTokenAddress?: string; // optional - which ERC20 is used for margin
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
		marginUsd?: string;
	};
	error?: string;
}

// Initialize clients
const publicClient = createPublicClient({
	chain: sepolia,
	transport: http(),
});

// Helper function to create oracle signature
async function signOracleData(oracleData: OracleData, traderAddress: string): Promise<string> {
	const privateKey = process.env.ADMIN_PRIVATE_KEY as `0x${string}`;

	if (!privateKey) {
		throw new Error("Admin private key not found");
	}

	const account = privateKeyToAccount(privateKey);

	const walletClient = createWalletClient({
		account,
		chain: sepolia, // Match the chain used for the client
		transport: http(),
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
			traderAddress as `0x${string}`, // This is the trader address, not admin address!
		],
	);

	const messageHash = keccak256(message);

	// Use signMessage (not sign) to match ethers.signMessage behavior
	// This adds the Ethereum signed message prefix like the test does
	const signature = await walletClient.signMessage({
		account,
		message: { raw: messageHash },
	});
	return signature;
}

// Helper function to generate nonce (timestamp + random for uniqueness)
function generateNonce(): bigint {
	const timestamp = BigInt(Date.now());
	const random = BigInt(Math.floor(Math.random() * 1000000));
	return timestamp * BigInt(1000000) + random;
}

// Helper function to validate token symbol
function _isValidTokenSymbol(symbol: string): boolean {
	// Basic validation for token symbols (alphanumeric, 1-10 characters)
	return /^[A-Za-z0-9]{1,10}$/.test(symbol);
}

// Helper function to verify signature locally (for debugging)
async function verifySignatureLocallyWithTrader(
	oracleData: OracleData,
	signature: string,
	expectedSigner: `0x${string}`,
	traderAddress: string,
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
				traderAddress as `0x${string}`,
			],
		);

		const messageHash = keccak256(message);

		// Try to recover the signer address from the signature
		const recoveredAddress = await recoverMessageAddress({
			message: { raw: messageHash },
			signature: signature as `0x${string}`,
		});

		return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
	} catch (_error) {
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
			args: [tokenSymbol.toUpperCase()],
		})) as boolean;

		// Get available liquidity using the formula: availableLiquidity = totalLiquidity - totalAllocatedLiquidity
		const totalLiquidity = (await publicClient.readContract({
			address: SyntheticPerpetualContract,
			abi: SyntheticAbi,
			functionName: "totalLiquidity",
			args: [],
		})) as bigint;

		const totalAllocatedLiquidity = (await publicClient.readContract({
			address: SyntheticPerpetualContract,
			abi: SyntheticAbi,
			functionName: "totalAllocatedLiquidity",
			args: [],
		})) as bigint;

		const availableLiquidity = totalLiquidity - totalAllocatedLiquidity;

		return { marketExists, availableLiquidity };
	} catch (_error) {
		// If we can't check, assume market exists to be safe (virtual funding = 0)
		return { marketExists: true, availableLiquidity: BigInt(0) };
	}
}

export async function POST(request: NextRequest) {
	try {
		const body: CreatePositionRequest = await request.json();

		// Validate request parameters
		if (!body.tokenSymbol || !body.userAddress || !body.margin || body.leverage === undefined) {
			return NextResponse.json(
				{ success: false, error: "Missing required parameters" },
				{ status: 400 },
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
			return NextResponse.json(
				{ success: false, error: "Invalid user address format" },
				{ status: 400 },
			);
		}
		if (!/^0x[a-fA-F0-9]{40}$/.test(body.tokenAddress)) {
			return NextResponse.json(
				{ success: false, error: "Invalid token address format" },
				{ status: 400 },
			);
		}
		if (body.marginTokenAddress && !/^0x[a-fA-F0-9]{40}$/.test(body.marginTokenAddress)) {
			return NextResponse.json(
				{ success: false, error: "Invalid margin token address format" },
				{ status: 400 },
			);
		}

		// Validate leverage bounds (check contract MAX_LEVERAGE)
		if (body.leverage <= 0 || body.leverage > 100) {
			return NextResponse.json(
				{
					success: false,
					error: "Invalid leverage value. Must be between 1 and 100",
				},
				{ status: 400 },
			);
		}

		// Validate margin amount - interpret body.margin as token amount for marginTokenAddress
		const marginAmount = parseFloat(body.margin);
		if (Number.isNaN(marginAmount) || marginAmount <= 0) {
			return NextResponse.json({ success: false, error: "Invalid margin amount" }, { status: 400 });
		}

		// Fetch current price from oracle
		let tokenPrice:
			| Awaited<ReturnType<ReturnType<typeof getTokenPriceService>["getTokenPriceWithAddress"]>>
			| undefined;
		try {
			// Use the token price service to get current token price
			const tokenPriceService = getTokenPriceService();
			tokenPrice = await tokenPriceService.getTokenPriceWithAddress(body.tokenAddress);

			if (tokenPrice) {
			}
		} catch (_error) {
			return NextResponse.json(
				{
					success: false,
					error: "Failed to fetch current token price",
				},
				{ status: 503 },
			);
		}

		if (
			!tokenPrice ||
			!tokenPrice.data?.bestPriceUSD ||
			!tokenPrice.data?.bestPriceUSD?.price ||
			parseFloat(tokenPrice.data.bestPriceUSD.price) <= 0
		) {
			return NextResponse.json(
				{
					success: false,
					error: `Unable to get valid price for token: ${body.tokenSymbol}`,
				},
				{ status: 500 },
			);
		}

		// Prepare oracle data
		const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
		const nonce = generateNonce();

		// Convert price to appropriate decimals (18 decimals for price oracle)
		const priceValue = parseFloat(
			tokenPrice.data.bestPriceUSD.priceUSD || tokenPrice.data.bestPriceUSD.price || "0",
		);
		const priceInWei = parseUnits(priceValue.toFixed(18), 18);

		// Check if market exists and get available liquidity to calculate virtual funding
		const { marketExists, availableLiquidity } = await checkMarketAndLiquidity(body.tokenSymbol);

		// Calculate virtual funding based on market existence and available liquidity
		const virtualFunding = calculateVirtualFundingForMarket(availableLiquidity, marketExists);
		if (marketExists) {
		} else if (availableLiquidity <= BigInt(0)) {
		} else {
			const _masterFund = (availableLiquidity * BigInt(3)) / BigInt(100);
		}

		const oracleData: OracleData = {
			tokenSymbol: `${body.tokenSymbol.toUpperCase()}_PERP_${body.tokenAddress}`,
			price: priceInWei,
			timestamp: currentTimestamp,
			nonce: nonce,
			virtualFunding: virtualFunding,
		};

		// Sign the oracle data
		let signature: string;
		try {
			signature = await signOracleData(oracleData, body.userAddress);

			// Verify signature locally for debugging
			const privateKey = process.env.ADMIN_PRIVATE_KEY as `0x${string}`;
			const signerAddress = privateKeyToAccount(privateKey).address;
			const _isValid = await verifySignatureLocallyWithTrader(
				oracleData,
				signature,
				signerAddress,
				body.userAddress,
			);
		} catch (_error) {
			return NextResponse.json(
				{ success: false, error: "Failed to sign oracle data" },
				{ status: 500 },
			);
		}

		// Determine margin token decimals
		const marginTokenAddr = body.marginTokenAddress || (usdc as `0x${string}`);
		let marginDecimals = 6;
		try {
			const decimalsRead = await publicClient.readContract({
				address: marginTokenAddr as `0x${string}`,
				abi: ERC20Abi,
				functionName: "decimals",
				args: [],
			});
			marginDecimals = Number(decimalsRead);
		} catch (_error) {
			// If we fail to read decimals, default to 6 (USDC-like)
			marginDecimals = 6;
		}

		// Convert margin to wei using discovered decimals
		const marginInWei = parseUnits(body.margin, marginDecimals);

		// Fetch margin token USD price for validation and USD exposure conversion
		let marginTokenPriceData:
			| Awaited<ReturnType<ReturnType<typeof getTokenPriceService>["getTokenPriceWithAddress"]>>
			| undefined;
		let marginTokenUsdPrice = 1;
		try {
			const tokenPriceService = getTokenPriceService();
			marginTokenPriceData = await tokenPriceService.getTokenPriceWithAddress(
				marginTokenAddr as `0x${string}`,
			);
			if (marginTokenPriceData?.data?.bestPriceUSD?.price) {
				marginTokenUsdPrice = parseFloat(marginTokenPriceData.data.bestPriceUSD.price);
			} else if (marginTokenPriceData?.data?.averagePrice) {
				marginTokenUsdPrice = parseFloat(marginTokenPriceData.data.averagePrice);
			}
		} catch (_error) {
			// If we fail to fetch margin token price, assume stable USD = 1
			marginTokenUsdPrice = 1;
		}

		const marginUsdAmount = marginAmount * marginTokenUsdPrice;

		// Validate margin value in USD (min/max checks)
		if (marginUsdAmount < 10) {
			return NextResponse.json({ success: false, error: "Minimum margin is $10" }, { status: 400 });
		}
		if (marginUsdAmount > 100000) {
			return NextResponse.json(
				{ success: false, error: "Maximum margin is $100,000" },
				{ status: 400 },
			);
		}

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
						virtualFunding: oracleData.virtualFunding,
					},
					signature,
				],
			});
		} catch (_error) {
			return NextResponse.json(
				{ success: false, error: "Failed to encode transaction data" },
				{ status: 500 },
			);
		}

		// Estimate gas (optional)
		let gasEstimate: bigint | undefined;
		try {
			gasEstimate = await publicClient.estimateGas({
				account: body.userAddress as `0x${string}`,
				to: SyntheticPerpetualContract as `0x${string}`,
				data: calldata,
			});
		} catch (_error) {
			// Gas estimation failure is not critical, continue without it
		}

		const response: CreatePositionResponse = {
			success: true,
			data: {
				to: SyntheticPerpetualContract,
				data: calldata,
				value: "0x0", // No ETH value needed
				gasEstimate: gasEstimate ? gasEstimate.toString() : undefined,
				marginUsd: marginUsdAmount ? marginUsdAmount.toString() : undefined,
			},
		};

		return NextResponse.json(response);
	} catch (error) {
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
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
		} catch (_error) {}

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
				healthCheck: "GET /api/position/create",
			},
			requiredParams: {
				tokenSymbol: 'string (e.g., "ETH", "BTC")',
				isLong: "boolean",
				margin:
					"string (amount in token units - specify marginTokenAddress to indicate which token)",
				leverage: "number (1-100)",
				userAddress: "string (0x...)",
				pairAddress: "string (optional, for accurate pricing)",
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				success: false,
				status: "unhealthy",
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
