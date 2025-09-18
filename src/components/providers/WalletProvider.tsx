"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { config } from "@/lib/wagmi";

const queryClient = new QueryClient();

const connectKitTheme = {
	// Typography
	"--ck-font-family": "var(--font-geist-sans)",
	"--ck-font-weight": "500",

	// Border radius
	"--ck-border-radius": "var(--radius)",
	"--ck-primary-button-border-radius": "var(--radius)",
	"--ck-secondary-button-border-radius": "var(--radius)",
	"--ck-tertiary-button-border-radius": "var(--radius)",

	// Primary buttons
	"--ck-primary-button-color": "var(--primary-foreground)",
	"--ck-primary-button-background": "var(--primary)",
	"--ck-primary-button-hover-background": "var(--primary)",
	"--ck-primary-button-active-background": "var(--primary)",
	"--ck-primary-button-box-shadow": "var(--ring)",

	// Secondary buttons
	"--ck-secondary-button-color": "var(--secondary-foreground)",
	"--ck-secondary-button-background": "var(--secondary)",
	"--ck-secondary-button-hover-background": "var(--accent)",
	"--ck-secondary-button-active-background": "var(--accent)",
	"--ck-secondary-button-border": "1px solid var(--border)",

	// Tertiary buttons
	"--ck-tertiary-button-color": "var(--foreground)",
	"--ck-tertiary-button-background": "transparent",
	"--ck-tertiary-button-hover-background": "var(--muted)",

	// Modal & backgrounds
	"--ck-modal-background": "var(--background)",
	"--ck-modal-box-shadow": "var(--ring)",
	"--ck-body-background": "var(--card)",
	"--ck-body-background-secondary": "var(--muted)",
	"--ck-body-background-tertiary": "var(--accent)",
	"--ck-overlay-background": "rgba(0, 0, 0, 0.8)",

	// Text colors
	"--ck-body-color": "var(--foreground)",
	"--ck-body-color-muted": "var(--muted-foreground)",
	"--ck-body-color-muted-hover": "var(--foreground)",

	// Borders & dividers
	"--ck-body-divider": "var(--border)",
	"--ck-body-divider-box-shadow": "var(--border)",

	// Focus states
	"--ck-focus-color": "var(--chart-1)",
	"--ck-dropdown-button-color": "var(--foreground)",
	"--ck-dropdown-button-box-shadow": "0 0 0 1px var(--border)",

	// Wallet cards
	"--ck-wallet-card-background": "var(--muted)",
	"--ck-wallet-card-hover-background": "var(--accent)",
	"--ck-wallet-card-box-shadow": "var(--ring)",

	// Tooltips
	"--ck-tooltip-background": "var(--accent)",
	"--ck-tooltip-color": "var(--foreground)",
	"--ck-tooltip-shadow": "var(--ring)",

	// QR Code
	"--ck-qr-dot-color": "var(--foreground)",
	"--ck-qr-background": "var(--foreground)",

	// Animations
	"--ck-animation-duration": "200ms",
	"--ck-animation-easing": "cubic-bezier(0.4, 0, 0.2, 1)",
} as React.CSSProperties;

export function WalletProvider({ children }: { children: React.ReactNode }) {
	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				<ConnectKitProvider theme="midnight" customTheme={connectKitTheme}>
					{children}
				</ConnectKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
}
