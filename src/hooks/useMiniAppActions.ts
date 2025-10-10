"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useCallback } from "react";
import { useMiniApp } from "@/components/providers/MiniAppProvider";

export function useMiniAppActions() {
	const { isMiniApp } = useMiniApp();

	const composeCast = useCallback(
		async (options: any) => {
			if (!isMiniApp) {
				console.warn("Not in Mini App environment");
				return null;
			}

			try {
				const result = await sdk.actions.composeCast(options);
				return result;
			} catch (error) {
				console.error("Failed to compose cast:", error);
				return null;
			}
		},
		[isMiniApp]
	);

	const addMiniApp = useCallback(async () => {
		if (!isMiniApp) {
			console.warn("Not in Mini App environment");
			return;
		}

		try {
			await sdk.actions.addMiniApp();
		} catch (error) {
			console.error("Failed to add Mini App:", error);
		}
	}, [isMiniApp]);

	const openUrl = useCallback(
		async (url: string) => {
			if (!isMiniApp) {
				// Fallback to regular navigation for web
				window.open(url, "_blank");
				return;
			}

			try {
				await sdk.actions.openUrl(url);
			} catch (error) {
				console.error("Failed to open URL:", error);
			}
		},
		[isMiniApp]
	);

	return {
		composeCast,
		addMiniApp,
		openUrl,
		isMiniApp
	};
}
