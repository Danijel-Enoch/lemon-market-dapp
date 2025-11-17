import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	const address = request.nextUrl.searchParams.get("address");

	if (!address) {
		return NextResponse.json({ error: "Address parameter is required" }, { status: 400 });
	}

	try {
		// TODO: Replace with actual backend call to fetch user's earned fees
		// Example: const fees = await fetchFromBackend(`/users/${address}/fees-earned`);
		// You can calculate this from user's positions and closed trades

		// Mock response
		const feesEarned = 0;

		return NextResponse.json({
			feesEarned,
			address,
		});
	} catch (_error) {
		return NextResponse.json({ error: "Failed to fetch fees" }, { status: 500 });
	}
}
