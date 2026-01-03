import { useReferral } from "@app/hooks/useReferral";
import { useEffect } from "react";
import { useAccount } from "wagmi";

/**
 * Global referral handler that processes referral codes when user connects wallet
 */
export function ReferralHandler() {
	const { address, isConnected } = useAccount();
	const { initializeUserReferral } = useReferral();

	useEffect(() => {
		if (isConnected && address) {
			initializeUserReferral(address);
		}
	}, [isConnected, address, initializeUserReferral]);

	return null;
}
