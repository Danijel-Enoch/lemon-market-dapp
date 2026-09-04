import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import "@rainbow-me/rainbowkit/styles.css";

/**
 * RainbowKit's dark theme, tuned to the Pons palette.
 *
 * Shared rather than duplicated per app: the connect modal is the one surface a
 * user sees before anything else renders, and two apps whose modals disagree
 * about the accent colour look like two different products.
 */
const base = darkTheme({
	accentColor: "#65a30d",
	accentColorForeground: "white",
	borderRadius: "large",
	fontStack: "system",
	overlayBlur: "small",
});

export const lemonWalletTheme = {
	...base,
	colors: {
		...base.colors,
		accentColor: "#65a30d",
		accentColorForeground: "white",
		modalBackground: "#0f1419",
		modalBorder: "#1f2937",
	},
};

export function LemonRainbowKitProvider({ children }: { children: ReactNode }) {
	return (
		<RainbowKitProvider modalSize="compact" theme={lemonWalletTheme}>
			{children}
		</RainbowKitProvider>
	);
}
