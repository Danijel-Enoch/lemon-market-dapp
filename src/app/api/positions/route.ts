import { NextRequest, NextResponse } from "next/server";
import { getTokenPriceService } from "@/lib/token-price-service";

// GraphQL query to fetch positions
const POSITIONS_QUERY = `
  query GetPositions($trader: String!) {
    positions(where: {trader: $trader}) {
      entryPrice
      exitPrice
      finalPnl
      id
      isLong
      lastBlockNumber
      lastBlockTimestamp
      lastTransactionHash
      lastUpdatedAt
      leverage
      liquidationPrice
      trader
      tokenSymbol
      positionId
      openedAt
      margin
      status
    }
  }
`;

interface Position {
	entryPrice: string;
	exitPrice: string;
	finalPnl: string;
	id: string;
	isLong: boolean;
	lastBlockNumber: string;
	lastBlockTimestamp: string;
	lastTransactionHash: string;
	lastUpdatedAt: string;
	leverage: string;
	liquidationPrice: string;
	trader: string;
	tokenSymbol: string;
	positionId: string;
	openedAt: string;
	margin: string;
	status: string;
}

interface GraphQLResponse {
	data?: {
		positions: Position[];
	};
	errors?: Array<{
		message: string;
	}>;
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const trader = searchParams.get("trader");

		if (!trader) {
			return NextResponse.json(
				{ error: "trader address is required" },
				{ status: 400 }
			);
		}

		// Validate trader address format (basic check)
		if (!trader.match(/^0x[a-fA-F0-9]{40}$/)) {
			return NextResponse.json(
				{ error: "Invalid trader address format" },
				{ status: 400 }
			);
		}

		// Make GraphQL request to the subgraph
		const response = await fetch(process.env.SUBGRAPH_URL || "", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer 7d3c97e52a57d84a7a12d456559b745b"
			},
			body: JSON.stringify({
				query: POSITIONS_QUERY,
				variables: {
					trader: trader.toLowerCase() // Ensure lowercase for consistency
				}
			})
		});

		if (!response.ok) {
			throw new Error(
				`Subgraph request failed: ${response.status} ${response.statusText}`
			);
		}

		const result: GraphQLResponse = await response.json();

		if (result.errors && result.errors.length > 0) {
			console.error("GraphQL errors:", result.errors);
			return NextResponse.json(
				{
					error: "Failed to fetch positions from subgraph",
					details: result.errors
				},
				{ status: 500 }
			);
		}

		const positions = result.data?.positions || [];

		// Transform positions for frontend consumption
		const transformedPositions = positions.map((position) => ({
			id: position.id,
			positionId: position.positionId,
			pair: `${position.tokenSymbol.split("_")[0] || "c"}/USDT`,
			side: position.isLong ? "Long" : "Short",
			tokenSymbol: position.tokenSymbol.split("_")[0] || "c",
			tokenaddress: position.tokenSymbol.split("_")[2] || "",
			isLong: position.isLong,
			entryPrice: formatPrice(position.entryPrice),
			exitPrice: position.exitPrice
				? formatPrice(position.exitPrice)
				: null,
			margin: formatAmount(position.margin),
			leverage: `${position.leverage}x`,
			leverageValue: parseFloat(position.leverage),
			liquidationPrice: formatPrice(position.liquidationPrice),
			status: position.status,
			// Don't use subgraph PnL for open positions - let frontend calculate real-time PnL
			pnl:
				position.status === "CLOSED"
					? formatAmount(position.finalPnl)
					: "$0.00",
			pnlRaw: position.status === "CLOSED" ? position.finalPnl : null,
			openedAt: new Date(
				parseInt(position.openedAt) * 1000
			).toISOString(),
			lastUpdatedAt: new Date(
				parseInt(position.lastUpdatedAt) * 1000
			).toISOString(),
			lastTransactionHash: position.lastTransactionHash,
			trader: position.trader
		}));

		// Check if enhanced mode is requested (with real-time PnL)
		const enhanced = searchParams.get("enhanced") === "true";

		if (enhanced && transformedPositions.length > 0) {
			try {
				const tokenPriceService = getTokenPriceService();
				//console.log("Fetching real-time prices for enhanced mode");
				// Get unique token symbols for open positions
				const openPositions = transformedPositions.filter(
					(p) => p.status === "OPEN"
				);
				const uniqueSymbols = [
					...new Set(openPositions.map((pos) => pos.tokenaddress))
				];

				//console.log("Unique symbols:", uniqueSymbols);

				if (uniqueSymbols.length > 0) {
					// Fetch current prices
					const priceMap =
						await tokenPriceService.getMultipleTokenPrices(
							uniqueSymbols
						);
					//console.log("Fetched price map:", priceMap);

					// Enhance positions with real-time data
					const enhancedPositions = await Promise.all(
						transformedPositions.map(async (position) => {
							if (position.status !== "OPEN") {
								return position; // Don't enhance closed positions
							}

							const priceData = priceMap.get(
								position.tokenaddress
							);

							//console.log("Fetched price data:", priceData);

							if (!priceData) {
								return position; // Return original if no price data
							}

							// Calculate real-time PnL
							const pnlCalculation =
								await tokenPriceService.calculatePositionPnL(
									position.tokenaddress,
									position.entryPrice,
									position.margin,
									position.leverage,
									position.isLong,
									position.liquidationPrice
								);
							// console.log(
							// 	"PnL calculation for",
							// 	position.tokenSymbol,
							// 	pnlCalculation
							// );
							return {
								...position,
								currentPrice: `$${parseFloat(
									priceData.priceUSD
								).toFixed(12)}`, // Increased precision for micro changes
								unrealizedPnL:
									pnlCalculation?.unrealizedPnL || 0,
								unrealizedPnLPercentage:
									pnlCalculation?.unrealizedPnLPercentage ||
									0,
								tokenAmount: pnlCalculation?.tokenAmount || 0,
								currentValue: pnlCalculation?.currentValue || 0,
								priceSource: priceData.source,
								priceConfidence: priceData.confidence,
								lastPriceUpdate: Date.now()
							};
						})
					);

					// Calculate portfolio totals
					const totalUnrealizedPnL = enhancedPositions
						.filter((p) => p.status === "OPEN")
						.reduce(
							(sum, pos) =>
								sum + ((pos as any).unrealizedPnL || 0),
							0
						);

					const totalPortfolioValue = enhancedPositions
						.filter((p) => p.status === "OPEN")
						.reduce(
							(sum, pos) =>
								sum + ((pos as any).currentValue || 0),
							0
						);

					return NextResponse.json({
						success: true,
						positions: enhancedPositions,
						count: enhancedPositions.length,
						enhanced: true,
						totalUnrealizedPnL,
						totalPortfolioValue,
						priceUpdateTimestamp: Date.now()
					});
				}
			} catch (error) {
				console.warn(
					"Error fetching real-time prices, falling back to basic positions:",
					error
				);
				// Fall through to return basic positions
			}
		}

		return NextResponse.json({
			success: true,
			positions: transformedPositions,
			count: transformedPositions.length,
			enhanced: false
		});
	} catch (error) {
		console.error("Error fetching positions:", error);
		return NextResponse.json(
			{
				error: "Internal server error",
				details:
					error instanceof Error ? error.message : "Unknown error"
			},
			{ status: 500 }
		);
	}
}

// Helper function to format price values
function formatPrice(priceWei: string | null): string {
	try {
		if (!priceWei || priceWei === "null" || priceWei === "0") {
			return "$0.000000000000";
		}
		const price = parseFloat(priceWei) / 1e18; // Assuming 18 decimals
		if (isNaN(price) || !isFinite(price)) {
			return "$0.000000000000";
		}
		// Use adaptive precision for micro changes
		const precision = price < 0.001 ? 12 : price < 1 ? 8 : 6;
		return `$${price.toFixed(precision)}`;
	} catch {
		return "$0.000000000000";
	}
}

// Helper function to format amount values
function formatAmount(amountWei: string | null): string {
	try {
		if (!amountWei || amountWei === "null" || amountWei === "0") {
			return "$0.00";
		}
		const amount = parseFloat(amountWei) / 1e6; // Assuming USDC with 6 decimals
		if (isNaN(amount) || !isFinite(amount)) {
			return "$0.00";
		}
		return `$${amount.toLocaleString("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		})}`;
	} catch {
		return "$0.00";
	}
}
