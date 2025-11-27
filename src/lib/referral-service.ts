/**
 * Referral Service
 * Handles all API calls related to the referral system
 */

export interface CreateReferralResponse {
	code: string;
	address: string;
	message: string;
}

export interface RedeemReferralResponse {
	code: string;
	address: string;
	points: number;
	message: string;
}

export interface ReferralStatsResponse {
	address: string;
	referralCode: string;
	points: number;
	totalReferrals: number;
	referrals: Array<{
		referredAddress: string;
		createdAt: string;
		pointsAwarded: boolean;
	}>;
	createdAt: string;
}

export class ReferralService {
	private baseUrl: string;

	constructor(baseUrl: string = "") {
		this.baseUrl = baseUrl;
	}

	/**
	 * Create or get a referral code for a user
	 */
	async createReferralCode(address: string): Promise<CreateReferralResponse> {
		const response = await fetch(`${this.baseUrl}/api/referral/create`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ address }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || "Failed to create referral code");
		}

		return response.json();
	}

	/**
	 * Redeem a referral code for a new user
	 */
	async redeemReferralCode(
		address: string,
		referralCode?: string,
	): Promise<RedeemReferralResponse> {
		const response = await fetch(`${this.baseUrl}/api/referral/redeem`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				address,
				referralCode: referralCode || undefined,
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || "Failed to redeem referral code");
		}

		return response.json();
	}

	/**
	 * Get referral statistics for a user
	 */
	async getReferralStats(address: string): Promise<ReferralStatsResponse> {
		const response = await fetch(`${this.baseUrl}/api/referral/stats?address=${address}`);

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
export const referralService = new ReferralService(import.meta.env.VITE_APP_URL || "");
