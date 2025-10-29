import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Mock implementation - Replace with your actual backend API calls
export async function GET(request: NextRequest) {
	const address = request.nextUrl.searchParams.get("address");

	if (!address) {
		return NextResponse.json(
			{ error: "Address parameter is required" },
			{ status: 400 }
		);
	}

	try {
		// TODO: Replace with actual backend call to fetch user's referral code
		// Example: const referralCode = await fetchFromBackend(`/users/${address}/referral-code`);
		const normalizedAddress = address.toLowerCase();
		// Mock response - returns null if no code exists
		const referralCode = await prisma.user.findUnique({
			where: { address: normalizedAddress }
		});

		console.log(
			"Fetched referral code for address:",
			address,
			"Code:",
			referralCode
		);

		return NextResponse.json({
			code: referralCode?.referralCode || null,
			address
		});
	} catch (error) {
		console.error("Error fetching referral code:", error);
		return NextResponse.json(
			{ error: "Failed to fetch referral code" },
			{ status: 500 }
		);
	}
}
