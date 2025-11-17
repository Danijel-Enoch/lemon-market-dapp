import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		domains: [
			"via.placeholder.com",
			"dd.dexscreener.com",
			"assets.coingecko.com",
			"coin-images.coingecko.com",
			"s2.coinmarketcap.com",
			"assets.geckoterminal.com",
		],
	},
	typescript: {
		// Ignore TypeScript errors during build
		ignoreBuildErrors: true,
	},
	eslint: {
		// Ignore ESLint errors during build
		ignoreDuringBuilds: true,
	},
	// Enable React Strict Mode for better development experience
	reactStrictMode: true,
	// Ensure Fast Refresh is enabled (default in development)
	experimental: {
		// This helps with HMR in some edge cases
		optimizePackageImports: ["@/components"],
	},
};

export default nextConfig;
