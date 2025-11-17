import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	const address = request.nextUrl.searchParams.get("address");

	if (!address) {
		return NextResponse.json({ error: "Address parameter is required" }, { status: 400 });
	}

	try {
		// TODO: Replace with actual backend call to fetch user's points
		// Example: const points = await fetchFromBackend(`/users/${address}/points`);
		// You can fetch this from your subgraph or database

		// Mock response
		const points = 0;

		return NextResponse.json({
			points,
			address,
		});
	} catch (_error) {
		return NextResponse.json({ error: "Failed to fetch points" }, { status: 500 });
	}
}
