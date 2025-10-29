"use client";

import { useEffect } from "react";
import { initializeReferralTracking } from "@/lib/referral-utils";

/**
 * Client component that initializes referral tracking on mount
 * This should be rendered at the root level
 */
export function ReferralInitializer() {
	useEffect(() => {
		initializeReferralTracking();
	}, []);

	return null;
}
