"use client";

import { useCallback } from "react";
import { useMiniApp } from "@/components/providers/MiniAppProvider";

export function useMiniAppActions() {
	const { isMiniApp } = useMiniApp();

	const composeCast = useCallback(
		async (options: any) => {
			if (!isMiniApp) {
				return null;
			}

			try {
				const { sdk } = await import("@farcaster/miniapp-sdk");
				const result = await sdk.actions.composeCast(options);
				return result;
			} catch (_error) {
				return null;
			}
		},
		[isMiniApp],
	);

	const addMiniApp = useCallback(async () => {
		if (!isMiniApp) {
			return;
		}

		try {
			const { sdk } = await import("@farcaster/miniapp-sdk");
			await sdk.actions.addMiniApp();
		} catch (_error) {}
	}, [isMiniApp]);

	const openUrl = useCallback(
		async (url: string) => {
			if (!isMiniApp) {
				// Fallback to regular navigation for web
				window.open(url, "_blank");
				return;
			}

			try {
				const { sdk } = await import("@farcaster/miniapp-sdk");
				await sdk.actions.openUrl(url);
			} catch (_error) {}
		},
		[isMiniApp],
	);

	return {
		composeCast,
		addMiniApp,
		openUrl,
		isMiniApp,
	};
}
