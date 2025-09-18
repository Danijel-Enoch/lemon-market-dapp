import { http, createConfig } from 'wagmi'
import { mainnet, sepolia, arbitrum, polygon } from 'wagmi/chains'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'
import { getDefaultConfig } from 'connectkit'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'your-project-id'

export const config = createConfig(
  getDefaultConfig({
    // Your dApps chains
    chains: [mainnet, sepolia, arbitrum, polygon],
    transports: {
      // RPC URL for each chain
      [mainnet.id]: http(),
      [sepolia.id]: http(),
      [arbitrum.id]: http(),
      [polygon.id]: http(),
    },

    // Required API Keys
    walletConnectProjectId: projectId,

    // Required App Info
    appName: "Contango Clone",
    appDescription: "A decentralized trading platform clone",
    appUrl: "https://contango-clone.vercel.app", // your app's url
    appIcon: "https://contango-clone.vercel.app/favicon.ico", // your app's icon, no bigger than 1024x1024px (max. 1MB)
  }),
)

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}