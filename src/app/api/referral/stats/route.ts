import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
	const address = request.nextUrl.searchParams.get("address");

	if (!address) {
		return NextResponse.json(
			{ error: "Address parameter is required" },
			{ status: 400 }
		);
	}

	try {
		// Normalize address
		const normalizedAddress = address.toLowerCase();

		const user = await prisma.user.findUnique({
			where: { address: normalizedAddress },
			include: {
				referrals: {
					select: {
						referredAddress: true,
						createdAt: true,
						pointsAwarded: true
					}
				}
			}
		});

		if (!user) {
			return NextResponse.json(
				{ error: "User not found" },
				{ status: 404 }
			);
		}

		return NextResponse.json({
			address: user.address,
			referralCode: user.referralCode,
			points: user.points,
			totalReferrals: user.referrals.length,
			referrals: user.referrals,
			createdAt: user.createdAt
		});
	} catch (error) {
		console.error("Error fetching referral stats:", error);
		return NextResponse.json(
			{ error: "Failed to fetch referral stats" },
			{ status: 500 }
		);
	}
}
