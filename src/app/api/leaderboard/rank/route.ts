import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	const address = request.nextUrl.searchParams.get("address");

	if (!address) {
		return NextResponse.json(
			{ error: "Address parameter is required" },
			{ status: 400 }
		);
	}

	try {
		// TODO: Replace with actual backend call to fetch user's leaderboard rank
		// Example: const rank = await fetchFromBackend(`/leaderboard/rank?address=${address}`);

		// Mock response
		const rank = 0;

		return NextResponse.json({
			rank,
			address
		});
	} catch (error) {
		console.error("Error fetching leaderboard rank:", error);
		return NextResponse.json(
			{ error: "Failed to fetch leaderboard rank" },
			{ status: 500 }
		);
	}
}
