import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		domains: [
			"via.placeholder.com",
			"dd.dexscreener.com",
			"assets.coingecko.com",
			"coin-images.coingecko.com",
			"s2.coinmarketcap.com",
			"assets.geckoterminal.com"
		]
	},
	typescript: {
		// Ignore TypeScript errors during build
		ignoreBuildErrors: true
	},
	eslint: {
		// Ignore ESLint errors during build
		ignoreDuringBuilds: true
	}
};

export default nextConfig;
