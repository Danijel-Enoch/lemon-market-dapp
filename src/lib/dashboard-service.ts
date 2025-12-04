import { betterFetch } from "@better-fetch/fetch";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://api.lemonmarkets.xyz";

export interface DashboardStats {
	pointsEarned: number;
	feesEarned: number;
	tradingVolume: number;
	referralCode: string | null;
	totalReferrals: number;
	referralEarnings: number;
	leaderboardRank: number;
	isLoading: boolean;
	error: string | null;
}

/**
 * Fetch user's referral code from API
 */
export async function getUserReferralCode(address: string): Promise<string | null> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/referrals/code/${address}`, {
			method: "GET",
		});
		return (data as any)?.code || null;
	} catch (_error) {
		return null;
	}
}

/**
 * Create a new referral code for the user
 */
export async function createReferralCode(address: string): Promise<string | null> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/referrals/create`, {
			method: "POST",
			body: JSON.stringify({ address }),
			headers: { "Content-Type": "application/json" },
		});
		return (data as any)?.code || null;
	} catch (_error) {
		return null;
	}
}

/**
 * Fetch user's earned points
 */
export async function getUserPoints(address: string): Promise<number> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/users/${address}/points`, {
			method: "GET",
		});
		return (data as any)?.points || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Fetch user's earned fees
 */
export async function getUserFeesEarned(address: string): Promise<number> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/users/${address}/fees-earned`, {
			method: "GET",
		});
		return (data as any)?.feesEarned || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Fetch user's trading volume
 */
export async function getUserTradingVolume(address: string): Promise<number> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/users/${address}/volume`, {
			method: "GET",
		});
		return (data as any)?.volume || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Fetch user's referral statistics
 */
export async function getUserReferralStats(address: string): Promise<{
	totalReferrals: number;
	referralEarnings: number;
	points: number;
}> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/referrals/stats/${address}`, {
			method: "GET",
		});
		const stats = data as any;
		return {
			totalReferrals: stats?.totalReferrals || 0,
			referralEarnings: stats?.referralEarnings || 0,
			points: stats?.points || 0,
		};
	} catch (_error) {
		return { totalReferrals: 0, referralEarnings: 0, points: 0 };
	}
}

/**
 * Fetch user's leaderboard rank
 */
export async function getUserLeaderboardRank(address: string): Promise<number> {
	try {
		const { data } = await betterFetch(`${BASE_URL}/leaderboard/rank/${address}`, {
			method: "GET",
		});
		return (data as any)?.rank || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Format large numbers for display
 */
export function formatNumber(num: number | undefined | null, decimals = 2): string {
	// Handle undefined, null, or non-numeric values
	if (num == null || typeof num !== "number" || Number.isNaN(num)) {
		return "0";
	}

	if (num >= 1e6) {
		return `${(num / 1e6).toFixed(decimals)}M`;
	}
	if (num >= 1e3) {
		return `${(num / 1e3).toFixed(decimals)}K`;
	}
	return num.toFixed(decimals);
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, symbol = "$", decimals = 2): string {
	return symbol + amount.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
