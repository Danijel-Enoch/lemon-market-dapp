import {
	applyReferralCode,
	createReferralCode,
	getUserReferralStats,
} from "@app/lib/dashboard-service";
import { useCallback, useEffect, useState } from "react";
import { useAsyncCallback } from "@app/hooks/useAsyncCallback";
import { useConnection } from "wagmi";

const REFERRAL_CODE_KEY = "lemon_referral_code";
const REFERRED_BY_KEY = "lemon_referred_by";

export function useReferral() {
	const { address } = useConnection();
	const [referralCode, setReferralCode] = useState<string | null>(null);

	// Get referral code from localStorage
	const getReferralCodeFromStorage = useCallback(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem(REFERRAL_CODE_KEY);
		}
		return null;
	}, []);

	// Get the referral code that brought this user to the site
	const getReferredByFromStorage = useCallback(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem(REFERRED_BY_KEY);
		}
		return null;
	}, []);

	// Save referral code to localStorage
	const saveReferralCode = useCallback((code: string) => {
		if (typeof window !== "undefined") {
			localStorage.setItem(REFERRAL_CODE_KEY, code);
			setReferralCode(code);
		}
	}, []);

	// Save the referral code that referred this user
	const saveReferredBy = useCallback((code: string) => {
		if (typeof window !== "undefined") {
			localStorage.setItem(REFERRED_BY_KEY, code);
		}
	}, []);

	// Clear referral data
	const clearReferralData = useCallback(() => {
		if (typeof window !== "undefined") {
			localStorage.removeItem(REFERRAL_CODE_KEY);
			localStorage.removeItem(REFERRED_BY_KEY);
			setReferralCode(null);
		}
	}, []);

	// Initialize user with referral code (call this when user connects wallet)
	const [{ loading: isLoading, error }, initializeUserReferral] = useAsyncCallback(
		async (userAddress: string) => {
			if (!userAddress) return;

			const referredBy = getReferredByFromStorage();

			// First, try to get existing referral stats
			const stats = await getUserReferralStats(userAddress);

			// If user already has a referral code, save it and return
			if (stats?.referralCode) {
				saveReferralCode(stats.referralCode);
				return { code: stats.referralCode, message: "Existing user" };
			}

			// If user was referred by someone, apply the referral code first
			if (referredBy) {
				const applyResult = await applyReferralCode(userAddress, referredBy);
				if (applyResult.success) {
					// Clear the referred_by code so it's not used again
					localStorage.removeItem(REFERRED_BY_KEY);
				}
			}

			// Generate a new referral code for this user
			const code = await createReferralCode(userAddress);
			if (code) {
				saveReferralCode(code);
				return { code, message: "User created successfully" };
			}

			return null;
		},
		[getReferredByFromStorage, saveReferralCode],
	);

	// Load referral code from storage on mount
	useEffect(() => {
		const storedCode = getReferralCodeFromStorage();
		if (storedCode) {
			setReferralCode(storedCode);
		}
	}, [getReferralCodeFromStorage]);

	// Check URL for referral code on mount
	useEffect(() => {
		if (typeof window !== "undefined") {
			const urlParams = new URLSearchParams(window.location.search);
			const refCode = urlParams.get("ref");
			if (refCode) {
				saveReferredBy(refCode);
				// Clean up URL without refreshing the page
				const newUrl = window.location.pathname + window.location.hash;
				window.history.replaceState({}, "", newUrl);
			}
		}
	}, [saveReferredBy]);

	// Initialize referral when address changes
	useEffect(() => {
		if (address) {
			initializeUserReferral(address);
		}
	}, [address, initializeUserReferral]);

	return {
		referralCode,
		getReferralCodeFromStorage,
		getReferredByFromStorage,
		saveReferralCode,
		saveReferredBy,
		clearReferralData,
		initializeUserReferral,
		isLoading,
		error: error?.message || null,
	};
}
