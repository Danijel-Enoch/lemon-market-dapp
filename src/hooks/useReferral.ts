import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

const REFERRAL_CODE_KEY = "lemon_referral_code";
const REFERRED_BY_KEY = "lemon_referred_by";

export function useReferral() {
	const { address } = useAccount();
	const [referralCode, setReferralCode] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
	const initializeUserReferral = useCallback(
		async (userAddress: string) => {
			if (!userAddress) return;

			setIsLoading(true);
			setError(null);

			try {
				const referredBy = getReferredByFromStorage();

				// Redeem referral code if user was referred
				const redeemResponse = await fetch("/api/referral/redeem", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						address: userAddress,
						referralCode: referredBy || undefined,
					}),
				});

				if (!redeemResponse.ok) {
					const errorData = await redeemResponse.json();
					throw new Error(errorData.error || "Failed to initialize referral");
				}

				const data = await redeemResponse.json();
				saveReferralCode(data.code);

				// If this is a new user (just created), clear the referred_by code
				// so it's not used again
				if (referredBy && data.message === "User created successfully") {
					// Keep the referral code in storage for future reference
				}

				return data;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Unknown error";
				setError(errorMessage);
			} finally {
				setIsLoading(false);
			}
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
		error,
	};
}
