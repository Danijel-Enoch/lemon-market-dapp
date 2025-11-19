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
		ignoreDuringBuilds: true,
	},
	reactStrictMode: true,
	output: "standalone",
	experimental: {
		// This helps with HMR in some edge cases
		optimizePackageImports: ["@/components", "framer-motion", "lucide-react", "recharts"],
		// Use compiler for faster builds
		webpackBuildWorker: true,
	},
	// Enable compression
	compress: true,
	// Optimize output
	poweredByHeader: false,
	// Generate etags for better caching
	generateEtags: true,
	// Compiler optimizations
	compiler: {
		// Remove console logs in production
		removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
	},
};

export default nextConfig;
