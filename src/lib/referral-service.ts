/**
 * Referral Service
 * Handles all API calls related to the referral system
 */

import { betterFetch } from "@better-fetch/fetch";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://api.degenoptions.xyz";

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
		const { data, error } = await betterFetch<LinkReferralResponse>(
			`${this.baseUrl}/referrals/link`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ address }),
			},
		);

		if (error || !data) {
			throw new Error("Failed to create referral code");
		}

		return data;
	}

	/**
	 * Apply a referral code when linking a new address (referrer gets 10 points)
	 */
	async applyReferralCode(address: string, referralCode: string): Promise<ApplyReferralResponse> {
		const { data, error } = await betterFetch<ApplyReferralResponse>(
			`${this.baseUrl}/referrals/apply`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					address,
					referralCode,
				}),
			},
		);

		if (error || !data) {
			throw new Error("Failed to apply referral code");
		}

		return data;
	}

	/**
	 * Get referral statistics for a user
	 */
	async getReferralStats(address: string): Promise<ReferralStatsResponse> {
		const { data, error } = await betterFetch<ReferralStatsResponse>(
			`${this.baseUrl}/referrals/stats/${address}`,
		);

		if (error || !data) {
			throw new Error("Failed to fetch referral stats");
		}

		return data;
	}

	/**
	 * Get the referrer for a user (who referred them)
	 */
	async getReferrer(address: string): Promise<{
		success: boolean;
		referrer: { address: string; referralCode: string } | null;
		message?: string;
		error?: string;
	}> {
		//console.log("Getting referrer for address:", address);
		try {
			const { data, error } = await betterFetch<{
				success: boolean;
				referrer: { address: string; referralCode: string } | null;
				message?: string;
			}>(`${this.baseUrl}/referrals/referrer/${address}`);

			//	console.log("Referrer API response:", data);

			if (error || !data) {
				return {
					success: false,
					referrer: null,
					error: "Failed to fetch referrer",
				};
			}

			return data;
		} catch (err) {
			console.error("Error fetching referrer:", err);
			return {
				success: false,
				referrer: null,
				error: err instanceof Error ? err.message : "Unknown error",
			};
		}
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
