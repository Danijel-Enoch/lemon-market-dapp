import { type NextRequest, NextResponse } from "next/server";
// import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
	const address = request.nextUrl.searchParams.get("address");

	if (!address) {
		return NextResponse.json({ error: "Address parameter is required" }, { status: 400 });
	}

	try {
		// Fetch user points from database using Prisma
		// const user = await prisma.user.findUnique({
		// 	where: {
		// 		address: address
		// 	},
		// 	select: {
		// 		points: true,
		// 		address: true
		// 	}
		// });

		// If user doesn't exist, return 0 points
		// const points = user?.points || 0;
		const points = 0;

		console.log("Fetched points for user:", null, points);

		return NextResponse.json({
			points,
			address,
		});
	} catch (_error) {
		return NextResponse.json({ error: "Failed to fetch points" }, { status: 500 });
	}
}
