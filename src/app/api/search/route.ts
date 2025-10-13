import { NextRequest, NextResponse } from "next/server";
import { searchService } from "@/lib/search-service";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const query = searchParams.get("q");
		const chains = searchParams.get("chains")?.split(",") || [
			"ethereum",
			"bsc",
			"polygon"
		];

		if (!query) {
			return NextResponse.json(
				{ error: "Query parameter 'q' is required" },
				{ status: 400 }
			);
		}

		if (query.length < 2) {
			return NextResponse.json(
				{ error: "Query must be at least 2 characters long" },
				{ status: 400 }
			);
		}

		const results = await searchService.search(query, chains);

		return NextResponse.json({
			success: true,
			data: results,
			query,
			chains,
			resultsCount: results.length
		});
	} catch (error) {
		console.error("Search API error:", error);
		return NextResponse.json(
			{
				error: "Internal server error",
				message:
					error instanceof Error ? error.message : "Unknown error"
			},
			{ status: 500 }
		);
	}
}
