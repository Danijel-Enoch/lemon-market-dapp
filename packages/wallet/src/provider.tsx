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
		// RainbowKit renders its own modal outside our stylesheet, so the design
		// system's colours are restated here rather than referenced. Ink fill
		// with lime type is the same inversion every primary control uses.
		accentColor: "#12170b",
		accentColorForeground: "#a3e635",
		modalBackground: "#f7fee7",
		modalBorder: "#12170b",
		modalText: "#12170b",
		modalTextSecondary: "rgba(18, 23, 11, 0.6)",
	},
};

export function LemonRainbowKitProvider({ children }: { children: ReactNode }) {
	return (
		<RainbowKitProvider modalSize="compact" theme={lemonWalletTheme}>
			{children}
		</RainbowKitProvider>
	);
}
