import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "via.placeholder.com",
			},
			{
				protocol: "https",
				hostname: "dd.dexscreener.com",
			},
			{
				protocol: "https",
				hostname: "assets.coingecko.com",
			},
			{
				protocol: "https",
				hostname: "coin-images.coingecko.com",
			},
			{
				protocol: "https",
				hostname: "s2.coinmarketcap.com",
			},
			{
				protocol: "https",
				hostname: "assets.geckoterminal.com",
			},
			{
				protocol: "https",
				hostname: "cdn.dexscreener.com",
			},
		],
		formats: ["image/avif", "image/webp"],
		minimumCacheTTL: 60,
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
		optimizePackageImports: ["@/components", "framer-motion"],
	},
	// Enable compression
	compress: true,
	// Optimize output
	poweredByHeader: false,
	// Generate etags for better caching
	generateEtags: true,
};

export default nextConfig;
