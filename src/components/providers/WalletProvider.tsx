"use client";

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { config } from '@/lib/wagmi'

const queryClient = new QueryClient()

const connectKitTheme = {
  "--ck-font-family": "var(--font-geist-sans)",
  "--ck-border-radius": "0.35rem",
  "--ck-primary-button-border-radius": "0.35rem",
  "--ck-secondary-button-border-radius": "0.35rem",
  "--ck-primary-button-color": "oklch(0.205 0 0)",
  "--ck-primary-button-background": "oklch(0.922 0 0)",
  "--ck-primary-button-hover-background": "oklch(0.85 0 0)",
  "--ck-secondary-button-color": "oklch(0.985 0 0)",
  "--ck-secondary-button-background": "oklch(0.269 0 0)",
  "--ck-secondary-button-hover-background": "oklch(0.35 0 0)",
  "--ck-modal-background": "oklch(0.145 0 0)",
  "--ck-body-background": "oklch(0.205 0 0)",
  "--ck-body-color": "oklch(0.985 0 0)",
  "--ck-body-color-muted": "oklch(0.708 0 0)",
  "--ck-body-divider": "oklch(1 0 0 / 10%)",
  "--ck-overlay-background": "rgba(0, 0, 0, 0.8)",
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
  )
}