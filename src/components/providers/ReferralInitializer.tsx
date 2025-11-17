"use client";

import { useEffect } from "react";

const REFERRED_BY_KEY = "lemon_referred_by";
const REFERRAL_PARAM = "ref";

/**
 * Client component that initializes referral tracking on mount
 * This should be rendered at the root level
 */
export function ReferralInitializer() {
	useEffect(() => {
		// Only run on client side and only once
		if (typeof window === "undefined") return;

		// Check if we already have a referral code stored
		const existingCode = localStorage.getItem(REFERRED_BY_KEY);
		if (existingCode) return; // Don't overwrite existing referral

		// Get referral code from URL
		const params = new URLSearchParams(window.location.search);
		const referralCode = params.get(REFERRAL_PARAM);

		if (referralCode) {
			console.log("Storing referral code from URL:", referralCode);
			localStorage.setItem(REFERRED_BY_KEY, referralCode);

			// Optional: Clean the URL to remove the ref parameter
			const url = new URL(window.location.href);
			url.searchParams.delete(REFERRAL_PARAM);
			window.history.replaceState({}, "", url.toString());
		}
	}, []);

	return null;
}
