import { useReferral } from "@app/hooks/useReferral";
import { useEffect } from "react";
import { useConnection } from "wagmi";

/**
 * Global referral handler that processes referral codes when user connects wallet
 */
export function ReferralHandler() {
	const { address, isConnected } = useConnection();
	const { initializeUserReferral } = useReferral();

	useEffect(() => {
		if (isConnected && address) {
			initializeUserReferral(address);
		}
	}, [isConnected, address, initializeUserReferral]);

	return null;
}
