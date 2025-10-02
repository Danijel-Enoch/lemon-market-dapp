import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		domains: ["via.placeholder.com"]
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
