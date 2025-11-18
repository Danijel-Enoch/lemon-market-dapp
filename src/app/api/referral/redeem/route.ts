import { type NextRequest, NextResponse } from "next/server";

// import { prisma } from "@/lib/prisma";

// Generate a random alphanumeric referral code
function _generateReferralCode(): string {
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

		const normalizedAddress = address.toLowerCase();

		// Check if user already exists
		// let user = await prisma.user.findUnique({
		// 	where: { address: normalizedAddress },
		// });

		// // If user doesn't exist, create them
		// if (!user) {
		// 	// Generate unique referral code for new user
		// 	let newReferralCode = generateReferralCode();
		// 	let codeExists = true;
		// 	while (codeExists) {
		// 		const existing = await prisma.user.findUnique({
		// 			where: { referralCode: newReferralCode }
		// 		});
		// 		if (!existing) {
		// 			codeExists = false;
		// 		} else {
		// 			newReferralCode = generateReferralCode();
		// 		}
		// 	}

		// 	// Create new user
		// 	user = await prisma.user.create({
		// 		data: {
		// 			address: normalizedAddress,
		// 			referralCode: newReferralCode,
		// 			points: 0
		// 		}
		// 	});
		// 	console.log("Created new user:", user.address);
		// }

		// // Process referral if referral code provided and user doesn't already have a referrer
		// if (referralCode && !user.referredBy) {
		// 	console.log("Processing referral code:", referralCode);

		// 	// Find referrer
		// 	const referrer = await prisma.user.findUnique({
		// 		where: { referralCode },
		// 	});

		// 	if (!referrer) {
		// 		return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
		// 	}

		// 	// Check if user trying to refer themselves
		// 	if (referrer.address.toLowerCase() === normalizedAddress) {
		// 		return NextResponse.json(
		// 			{ error: "You cannot refer yourself" },
		// 			{ status: 400 }
		// 		);
		// 	}

		// 	// Update user with referrer ID
		// 	user = await prisma.user.update({
		// 		where: { address: normalizedAddress },
		// 		data: { referredBy: referrer.id }
		// 	});

		// 	// Award 100 points to referrer
		// 	await prisma.user.update({
		// 		where: { referralCode },
		// 		data: { points: { increment: 100 } }
		// 	});

		// 	// Create referral record
		// 	await prisma.referral.create({
		// 		data: {
		// 			referrerId: referrer.id,
		// 			referredAddress: normalizedAddress,
		// 			pointsAwarded: true,
		// 		},
		// 	});

		// 	console.log("Referral processed successfully:");
		// 	console.log("- Referred user:", normalizedAddress);
		// 	console.log("- Referrer:", referrer.address);
		// 	console.log("- Points awarded to referrer: 100");
		// }

		return NextResponse.json({
			code: null,
			address: normalizedAddress,
			points: 0,
			referredBy: null,
			message: "Prisma disabled",
		});
	} catch (_error) {
		return NextResponse.json({ error: "Failed to process referral" }, { status: 500 });
	}
}
