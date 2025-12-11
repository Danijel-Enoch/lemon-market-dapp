import { betterFetch } from "@better-fetch/fetch";

const BASE_URL =
	import.meta.env.VITE_API_BASE_URL || "https://api.lemonmarkets.xyz";

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

export interface LinkReferralResponse {
	referralCode: string;
	address: string;
	message?: string;
}

export interface ApplyReferralResponse {
	success: boolean;
	message?: string;
	points?: number;
}

export interface ReferralStats {
	totalReferrals: number;
	referralEarnings: number;
	points: number;
	referralCode?: string;
	referrals?: Array<{
		referredAddress: string;
		createdAt: string;
		pointsAwarded: boolean;
	}>;
}

// API response wrapper types
interface LinkApiResponse {
	success: boolean;
	message?: string;
	user?: {
		address: string;
		referralCode: string;
		points: number;
	};
}

interface StatsApiResponse {
	success: boolean;
	stats?: {
		address: string;
		referralCode: string;
		points: number;
		totalReferrals: number;
		referredBy?: number;
		createdAt: string;
		referrals: Array<{
			address: string;
			pointsAwarded: boolean;
			createdAt: string;
		}>;
	};
	error?: string;
}

/**
 * Fetch user's referral stats including code from API
 */
export async function getUserReferralCode(
	address: string
): Promise<string | null> {
	try {
		const stats = await getUserReferralStats(address);
		return stats?.referralCode || null;
	} catch {
		return null;
	}
}

/**
 * Link an Ethereum address and generate a referral code
 */
export async function createReferralCode(
	address: string
): Promise<string | null> {
	try {
		const { data } = await betterFetch<LinkApiResponse>(
			`${BASE_URL}/referrals/link`,
			{
				method: "POST",
				body: JSON.stringify({ address }),
				headers: { "Content-Type": "application/json" }
			}
		);
		console.log("Create referral code API response:", data);
		// The API returns { success, message, user: { address, referralCode, points } }
		return data?.user?.referralCode || null;
	} catch (_error) {
		console.error("Failed to create referral code:", _error);
		return null;
	}
}

/**
 * Apply a referral code when linking a new address (referrer gets 10 points)
 */
export async function applyReferralCode(
	address: string,
	referralCode: string
): Promise<ApplyReferralResponse> {
	try {
		const { data } = await betterFetch<ApplyReferralResponse>(
			`${BASE_URL}/referrals/apply`,
			{
				method: "POST",
				body: JSON.stringify({ address, referralCode }),
				headers: { "Content-Type": "application/json" }
			}
		);
		return data || { success: false };
	} catch (_error) {
		console.error("Failed to apply referral code:", _error);
		return { success: false, message: "Failed to apply referral code" };
	}
}

/**
 * Fetch user's earned points
 */
export async function getUserPoints(address: string): Promise<number> {
	try {
		const { data } = await betterFetch(
			`${BASE_URL}/users/${address}/points`,
			{
				method: "GET"
			}
		);
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
		const { data } = await betterFetch(
			`${BASE_URL}/users/${address}/fees-earned`,
			{
				method: "GET"
			}
		);
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
		const { data } = await betterFetch(
			`${BASE_URL}/users/${address}/volume`,
			{
				method: "GET"
			}
		);
		return (data as any)?.volume || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Fetch user's referral statistics
 */
export async function getUserReferralStats(
	address: string
): Promise<ReferralStats> {
	try {
		const { data } = await betterFetch<StatsApiResponse>(
			`${BASE_URL}/referrals/stats/${address}`,
			{
				method: "GET"
			}
		);
		//console.log("Referral stats API response:", data);

		// The API returns { success, stats: { address, referralCode, points, totalReferrals, ... } }
		const stats = data?.stats;

		return {
			totalReferrals: stats?.totalReferrals || 0,
			referralEarnings: 0, // API doesn't return this, could be calculated from referrals
			points: stats?.points || 0,
			referralCode: stats?.referralCode,
			referrals:
				stats?.referrals?.map((r) => ({
					referredAddress: r.address,
					createdAt: r.createdAt,
					pointsAwarded: r.pointsAwarded
				})) || []
		};
	} catch (_error) {
		//console.error("Failed to fetch referral stats:", _error);
		return { totalReferrals: 0, referralEarnings: 0, points: 0 };
	}
}

/**
 * Fetch user's leaderboard rank
 */
export async function getUserLeaderboardRank(address: string): Promise<number> {
	try {
		const { data } = await betterFetch(
			`${BASE_URL}/leaderboard/rank/${address}`,
			{
				method: "GET"
			}
		);
		return (data as any)?.rank || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Format large numbers for display
 */
export function formatNumber(
	num: number | undefined | null,
	decimals = 2
): string {
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
export function formatCurrency(
	amount: number,
	symbol = "$",
	decimals = 2
): string {
	return (
		symbol + amount.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
	);
}
