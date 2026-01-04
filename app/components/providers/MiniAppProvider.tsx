import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

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

interface MiniAppLocation {
	latitude?: number;
	longitude?: number;
	accuracy?: number;
}

interface MiniAppContextData {
	user: MiniAppUser;
	client: MiniAppClient;
	location?: MiniAppLocation;
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

	const [value, setValue] = useState<boolean>(false);
	const [loading, setLoading] = useState<boolean>(true);

	useEffect(() => {
		let mounted = true;

		const init = async () => {
			try {
				if (typeof window === "undefined") {
					if (mounted) {
						setValue(false);
						setLoading(false);
					}
					return;
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
					if (mounted) {
						setValue(false);
						setLoading(false);
					}
					return;
				}

				// Dynamically import the SDK only in mobile/WebView environments
				const { sdk } = await import("@farcaster/miniapp-sdk");

				// Check if we're in a Mini App environment
				const inMiniApp = await sdk.isInMiniApp();

				if (inMiniApp) {
					// Get the context
					const ctx = await sdk.context;
					if (mounted) {
						setContext(ctx as MiniAppContextData);

						// Signal that the app is ready (hide splash screen)
						await sdk.actions.ready();
						setValue(true);
					}
				} else {
					if (mounted) {
						setValue(false);
					}
				}
			} catch (error) {
				console.error("Error initializing MiniApp SDK:", error);
				if (mounted) {
					setValue(false);
				}
			} finally {
				if (mounted) {
					setLoading(false);
				}
			}
		};

		init();

		return () => {
			mounted = false;
		};
	}, []);

	return (
		<MiniAppContextState.Provider value={{ isMiniApp: !!value, isLoading: loading, context }}>
			{children}
		</MiniAppContextState.Provider>
	);
}
