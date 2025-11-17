"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { useAsync } from "react-use";

// Define the context type based on what sdk.context resolves to
interface MiniAppUser {
	fid: number;
	username?: string;
	displayName?: string;
	pfpUrl?: string;
}

interface MiniAppClient {
	platformType?: "web" | "mobile";
	clientFid: number;
	added: boolean;
	safeAreaInsets?: {
		top: number;
		bottom: number;
		left: number;
		right: number;
	};
}

interface MiniAppContextData {
	user: MiniAppUser;
	client: MiniAppClient;
	location?: any;
}

interface MiniAppStateType {
	isMiniApp: boolean;
	isLoading: boolean;
	context?: MiniAppContextData;
}

const MiniAppContextState = createContext<MiniAppStateType>({
	isMiniApp: false,
	isLoading: true,
});

export function useMiniApp() {
	return useContext(MiniAppContextState);
}

interface MiniAppProviderProps {
	children: ReactNode;
}

export function MiniAppProvider({ children }: MiniAppProviderProps) {
	const [context, setContext] = useState<MiniAppContextData>();

	const { loading, value } = useAsync(async () => {
		// Wait until component is mounted and we're in the browser
		if (typeof window === "undefined") {
			return false;
		}

		// Quick check: Skip SDK initialization on desktop browsers
		// Farcaster Mini Apps typically run in mobile WebView or have specific user agents
		const isMobileOrWebView =
			/Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
			// Check for common WebView indicators
			/wv|WebView/i.test(navigator.userAgent) ||
			// Check if running in Farcaster app (they might set specific properties)
			"farcasterContext" in window;

		if (!isMobileOrWebView) {
			return false;
		}
		// Dynamically import the SDK only in mobile/WebView environments
		const { sdk } = await import("@farcaster/miniapp-sdk");

		// Check if we're in a Mini App environment
		const inMiniApp = await sdk.isInMiniApp();

		if (inMiniApp) {
			// Get the context
			const ctx = await sdk.context;
			setContext(ctx as MiniAppContextData);

			// Signal that the app is ready (hide splash screen)
			await sdk.actions.ready();
			return true;
		}
	}, []);

	return (
		<MiniAppContextState.Provider value={{ isMiniApp: !!value, isLoading: loading, context }}>
			{children}
		</MiniAppContextState.Provider>
	);
}
