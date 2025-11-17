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
		const response = await fetch(`/api/referral/code?address=${address}`);
		if (!response.ok) return null;
		const data = await response.json();
		return data.code || null;
	} catch (_error) {
		return null;
	}
}

/**
 * Create a new referral code for the user
 */
export async function createReferralCode(address: string): Promise<string | null> {
	try {
		const response = await fetch("/api/referral/create", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ address }),
		});
		if (!response.ok) return null;
		const data = await response.json();
		return data.code || null;
	} catch (_error) {
		return null;
	}
}

/**
 * Fetch user's earned points
 */
export async function getUserPoints(address: string): Promise<number> {
	try {
		const response = await fetch(`/api/dashboard/points?address=${address}`);
		if (!response.ok) return 0;
		const data = await response.json();
		return data.points || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Fetch user's earned fees
 */
export async function getUserFeesEarned(address: string): Promise<number> {
	try {
		const response = await fetch(`/api/dashboard/fees?address=${address}`);
		if (!response.ok) return 0;
		const data = await response.json();
		return data.feesEarned || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Fetch user's trading volume
 */
export async function getUserTradingVolume(address: string): Promise<number> {
	try {
		const response = await fetch(`/api/dashboard/volume?address=${address}`);
		if (!response.ok) return 0;
		const data = await response.json();
		return data.volume || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Fetch user's referral statistics
 */
export async function getUserReferralStats(
	address: string,
): Promise<{ totalReferrals: number; referralEarnings: number }> {
	try {
		const response = await fetch(`/api/referral/stats?address=${address}`);
		if (!response.ok) return { totalReferrals: 0, referralEarnings: 0 };
		const data = await response.json();
		return {
			totalReferrals: data.totalReferrals || 0,
			referralEarnings: data.referralEarnings || 0,
		};
	} catch (_error) {
		return { totalReferrals: 0, referralEarnings: 0 };
	}
}

/**
 * Fetch user's leaderboard rank
 */
export async function getUserLeaderboardRank(address: string): Promise<number> {
	try {
		const response = await fetch(`/api/leaderboard/rank?address=${address}`);
		if (!response.ok) return 0;
		const data = await response.json();
		return data.rank || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Format large numbers for display
 */
export function formatNumber(num: number, decimals = 2): string {
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
