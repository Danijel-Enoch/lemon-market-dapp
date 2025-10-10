"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode
} from "react";

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
	isLoading: true
});

export function useMiniApp() {
	return useContext(MiniAppContextState);
}

interface MiniAppProviderProps {
	children: ReactNode;
}

export function MiniAppProvider({ children }: MiniAppProviderProps) {
	const [isMiniApp, setIsMiniApp] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [context, setContext] = useState<MiniAppContextData>();

	useEffect(() => {
		async function initMiniApp() {
			try {
				// Check if we're in a Mini App environment
				const inMiniApp = await sdk.isInMiniApp();
				setIsMiniApp(inMiniApp);

				if (inMiniApp) {
					// Get the context
					const ctx = await sdk.context;
					setContext(ctx as MiniAppContextData);

					// Signal that the app is ready (hide splash screen)
					await sdk.actions.ready();

					console.log("Farcaster Mini App initialized", ctx);
				}
			} catch (error) {
				console.error("Failed to initialize Mini App:", error);
				setIsMiniApp(false);
			} finally {
				setIsLoading(false);
			}
		}

		initMiniApp();
	}, []);

	return (
		<MiniAppContextState.Provider value={{ isMiniApp, isLoading, context }}>
			{children}
		</MiniAppContextState.Provider>
	);
}
