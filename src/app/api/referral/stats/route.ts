import { type NextRequest, NextResponse } from "next/server";
// import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
	const address = request.nextUrl.searchParams.get("address");

	if (!address) {
		return NextResponse.json({ error: "Address parameter is required" }, { status: 400 });
	}

	try {
		// Normalize address
		const normalizedAddress = address.toLowerCase();

		// const user = await prisma.user.findUnique({
		// 	where: { address: normalizedAddress },
		// 	include: {
		// 		referrals: {
		// 			select: {
		// 				referredAddress: true,
		// 				createdAt: true,
		// 				pointsAwarded: true,
		// 			},
		// 		},
		// 	},
		// });

		// if (!user) {
		// 	return NextResponse.json({ error: "User not found" }, { status: 404 });
		// }
		// console.log("Fetched referral stats for user:", user);
		return NextResponse.json({
			address: normalizedAddress,
			referralCode: null,
			points: 0,
			totalReferrals: 0,
			referrals: [],
			createdAt: new Date(),
		});
	} catch (_error) {
		return NextResponse.json({ error: "Failed to fetch referral stats" }, { status: 500 });
	}
}
