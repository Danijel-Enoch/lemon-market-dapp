/**
 * Referral Service
 * Handles all API calls related to the referral system
 */

const BASE_URL =
	import.meta.env.VITE_API_BASE_URL || "https://api.lemonmarkets.xyz";

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

export interface ReferralStatsResponse {
	address: string;
	referralCode: string;
	points: number;
	totalReferrals: number;
	referralEarnings: number;
	referrals: Array<{
		referredAddress: string;
		createdAt: string;
		pointsAwarded: boolean;
	}>;
	createdAt: string;
}

export class ReferralService {
	private baseUrl: string;

	constructor(baseUrl: string = BASE_URL) {
		this.baseUrl = baseUrl;
	}

	/**
	 * Link an Ethereum address and generate a referral code
	 */
	async createReferralCode(address: string): Promise<LinkReferralResponse> {
		const response = await fetch(`${this.baseUrl}/referrals/link`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ address })
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || "Failed to create referral code");
		}

		return response.json();
	}

	/**
	 * Apply a referral code when linking a new address (referrer gets 10 points)
	 */
	async applyReferralCode(
		address: string,
		referralCode: string
	): Promise<ApplyReferralResponse> {
		const response = await fetch(`${this.baseUrl}/referrals/apply`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				address,
				referralCode
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || "Failed to apply referral code");
		}

		return response.json();
	}

	/**
	 * Get referral statistics for a user
	 */
	async getReferralStats(address: string): Promise<ReferralStatsResponse> {
		const response = await fetch(
			`${this.baseUrl}/referrals/stats/${address}`
		);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || "Failed to fetch referral stats");
		}

		return response.json();
	}

	/**
	 * Generate a shareable referral URL
	 */
	generateShareUrl(baseUrl: string, referralCode: string): string {
		const url = new URL(baseUrl);
		url.searchParams.set("ref", referralCode);
		return url.toString();
	}

	/**
	 * Copy text to clipboard
	 */
	async copyToClipboard(text: string): Promise<void> {
		if (navigator.clipboard) {
			await navigator.clipboard.writeText(text);
		} else {
			// Fallback for older browsers
			const textarea = document.createElement("textarea");
			textarea.value = text;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			document.body.removeChild(textarea);
		}
	}
}

// Export singleton instance
export const referralService = new ReferralService();
