"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useReferral } from "@/hooks/useReferral";

/**
 * Global referral handler that processes referral codes when user connects wallet
 */
export function ReferralHandler() {
	const { address, isConnected } = useAccount();
	const { initializeUserReferral } = useReferral();

	useEffect(() => {
		if (isConnected && address) {
			console.log(
				"User connected wallet, processing referral if any:",
				address
			);
			initializeUserReferral(address);
		}
	}, [isConnected, address, initializeUserReferral]);

	return null;
}
