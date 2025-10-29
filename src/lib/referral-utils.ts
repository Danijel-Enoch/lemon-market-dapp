/**
 * Referral URL utilities
 * Handles extracting and storing referral codes from URLs
 */

const REFERRAL_CODE_KEY = "lemon_referred_by";
const REFERRAL_PARAM = "ref";

/**
 * Get referral code from URL query parameters
 */
export function getReferralCodeFromUrl(): string | null {
	if (typeof window === "undefined") return null;

	const params = new URLSearchParams(window.location.search);
	return params.get(REFERRAL_PARAM);
}

/**
 * Save referral code to localStorage
 */
export function saveReferralCode(code: string): void {
	if (typeof window !== "undefined") {
		localStorage.setItem(REFERRAL_CODE_KEY, code);
	}
}

/**
 * Get saved referral code from localStorage
 */
export function getSavedReferralCode(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(REFERRAL_CODE_KEY);
}

/**
 * Clear referral code from localStorage
 */
export function clearReferralCode(): void {
	if (typeof window !== "undefined") {
		localStorage.removeItem(REFERRAL_CODE_KEY);
	}
}

/**
 * Initialize referral tracking
 * Call this in your layout or root component
 */
export function initializeReferralTracking(): void {
	const referralCode = getReferralCodeFromUrl();
	if (referralCode) {
		saveReferralCode(referralCode);
	}
}

/**
 * Generate a shareable referral URL
 */
export function generateReferralUrl(
	baseUrl: string,
	referralCode: string
): string {
	const url = new URL(baseUrl);
	url.searchParams.set(REFERRAL_PARAM, referralCode);
	return url.toString();
}
