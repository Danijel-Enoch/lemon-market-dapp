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
		const { address, referralCode } = await request.json();

		if (!address) {
			return NextResponse.json({ error: "Address is required" }, { status: 400 });
		}

		// Normalize address to lowercase
		const normalizedAddress = address.toLowerCase();

		// Check if user trying to refer themselves
		if (referralCode) {
			const referrer = await prisma.user.findUnique({
				where: { referralCode },
			});

			if (referrer && referrer.address.toLowerCase() === normalizedAddress) {
				return NextResponse.json({ error: "You cannot refer yourself" }, { status: 400 });
			}
		}

		// Check if user already exists
		let user = await prisma.user.findUnique({
			where: { address: normalizedAddress },
		});

		if (user) {
			return NextResponse.json({
				code: user.referralCode,
				address: normalizedAddress,
				points: user.points,
				message: "User already exists",
			});
		}

		// Generate unique referral code
		let newReferralCode = generateReferralCode();
		let codeExists = true;
		while (codeExists) {
			const existing = await prisma.user.findUnique({
				where: { referralCode: newReferralCode },
			});
			if (!existing) {
				codeExists = false;
			} else {
				newReferralCode = generateReferralCode();
			}
		}

		// Get referrer if referral code is provided
		let referrerId: string | undefined;
		if (referralCode) {
			const referrer = await prisma.user.findUnique({
				where: { referralCode },
			});

			if (!referrer) {
				return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
			}

			referrerId = referrer.id;
		}

		// Create new user with referral code
		user = await prisma.user.create({
			data: {
				address: normalizedAddress,
				referralCode: newReferralCode,
				points: 0,
				referredBy: referrerId,
			},
		});

		// If user was referred, award points to referrer and create referral record
		if (referrerId) {
			// Award 100 points to referrer
			await prisma.user.update({
				where: { id: referrerId },
				data: { points: { increment: 100 } },
			});

			// Create referral record
			await prisma.referral.create({
				data: {
					referrerId,
					referredAddress: normalizedAddress,
					pointsAwarded: true,
				},
			});
		}

		return NextResponse.json({
			code: user.referralCode,
			address: normalizedAddress,
			points: user.points,
			message: "User created successfully",
		});
	} catch (_error) {
		return NextResponse.json({ error: "Failed to redeem referral code" }, { status: 500 });
	}
}
