import { NextRequest, NextResponse } from "next/server";
import {
	getAllVirtualMarkets,
	getVirtualMarketById,
	type VirtualMarket,
} from "@/lib/virtual-markets-service";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const marketId = searchParams.get("marketId");

		if (marketId) {
			// Fetch specific virtual market by ID
			const market = await getVirtualMarketById(marketId);

			if (!market) {
				return NextResponse.json({ error: "Virtual market not found" }, { status: 404 });
			}

			return NextResponse.json({
				data: market,
			});
		} else {
			// Fetch all virtual markets
			const markets = await getAllVirtualMarkets();

			return NextResponse.json({
				data: markets,
				count: markets.length,
			});
		}
	} catch (error) {
		console.error("Error fetching virtual markets:", error);
		return NextResponse.json({ error: "Failed to fetch virtual markets" }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { tokenSymbols } = body;

		if (!tokenSymbols || !Array.isArray(tokenSymbols)) {
			return NextResponse.json({ error: "tokenSymbols array is required" }, { status: 400 });
		}

		// Fetch all markets first
		const allMarkets = await getAllVirtualMarkets();

		// Create lookup results for requested token symbols
		const results: Record<string, VirtualMarket | null> = {};

		tokenSymbols.forEach((symbol: string) => {
			const normalizedSymbol = symbol.toUpperCase();
			const market = allMarkets.find((m) => m.marketId.toUpperCase() === normalizedSymbol);
			results[symbol] = market || null;
		});

		return NextResponse.json({
			data: results,
		});
	} catch (error) {
		console.error("Error in virtual markets batch lookup:", error);
		return NextResponse.json({ error: "Failed to perform batch lookup" }, { status: 500 });
	}
}
