import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Generate a random alphanumeric referral code
function generateReferralCode(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let code = "";
	for (let i = 0; i < 8; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return code;
}

export async function POST(request: NextRequest) {
	try {
		const { address } = await request.json();

		if (!address) {
			return NextResponse.json({ error: "Address is required" }, { status: 400 });
		}

		// Normalize address to lowercase for consistency
		const normalizedAddress = address.toLowerCase();

		// Check if user already exists
		let user = await prisma.user.findUnique({
			where: { address: normalizedAddress },
		});

		if (user) {
			// User already has a referral code
			return NextResponse.json({
				code: user.referralCode,
				address: normalizedAddress,
				message: "Referral code retrieved successfully",
			});
		}

		// Generate unique referral code
		let referralCode = generateReferralCode();
		let codeExists = true;
		while (codeExists) {
			const existing = await prisma.user.findUnique({
				where: { referralCode },
			});
			if (!existing) {
				codeExists = false;
			} else {
				referralCode = generateReferralCode();
			}
		}

		// Create new user with referral code
		user = await prisma.user.create({
			data: {
				address: normalizedAddress,
				referralCode,
				points: 0,
			},
		});

		return NextResponse.json({
			code: user.referralCode,
			address: normalizedAddress,
			message: "Referral code created successfully",
		});
	} catch (_error) {
		return NextResponse.json({ error: "Failed to create referral code" }, { status: 500 });
	}
}
