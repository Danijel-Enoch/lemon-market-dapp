import { type NextRequest, NextResponse } from "next/server";
// import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Mock implementation - Replace with your actual backend API calls
export async function GET(request: NextRequest) {
	const address = request.nextUrl.searchParams.get("address");

	if (!address) {
		return NextResponse.json({ error: "Address parameter is required" }, { status: 400 });
	}

	try {
		// TODO: Replace with actual backend call to fetch user's referral code
		// Example: const referralCode = await fetchFromBackend(`/users/${address}/referral-code`);
		const _normalizedAddress = address.toLowerCase();
		// Mock response - returns null if no code exists
		// const referralCode = await prisma.user.findUnique({
		// 	where: { address: normalizedAddress },
		// });

		return NextResponse.json({
			code: null,
			address,
		});
	} catch (_error) {
		return NextResponse.json({ error: "Failed to fetch referral code" }, { status: 500 });
	}
}
