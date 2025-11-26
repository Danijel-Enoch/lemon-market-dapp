import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Security headers
	async headers() {
		const commonHeaders = [
			{
				key: "X-DNS-Prefetch-Control",
				value: "on",
			},
			{
				key: "X-Frame-Options",
				value: "DENY",
			},
			{
				key: "X-Content-Type-Options",
				value: "nosniff",
			},
			{
				key: "X-XSS-Protection",
				value: "1; mode=block",
			},
			{
				key: "Referrer-Policy",
				value: "strict-origin-when-cross-origin",
			},
			{
				key: "Permissions-Policy",
				value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
			},
		];

		const contentSecurityPolicy = [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://*.telegram.org https://www.googletagmanager.com https://www.google-analytics.com",
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
			"img-src 'self' data: blob: https: http:",
			"font-src 'self' data: https://fonts.gstatic.com",
			"connect-src 'self' https: wss: ws:",
			"frame-src 'self' https://telegram.org https://*.telegram.org https://dexscreener.com",
			"frame-ancestors 'none'",
			"base-uri 'self'",
			"form-action 'self'",
			"object-src 'none'",
			"media-src 'self' https:",
			"worker-src 'self' blob:",
			"manifest-src 'self'",
		].join("; ");

		// Only set HSTS (Strict-Transport-Security) and upgrade directives in production builds
		const headers =
			process.env.NODE_ENV === "production"
				? [
						...commonHeaders,
						{
							key: "Content-Security-Policy",
							value: `${contentSecurityPolicy}; upgrade-insecure-requests; block-all-mixed-content;`,
						},
						{
							key: "Strict-Transport-Security",
							value: "max-age=31536000; includeSubDomains; preload",
						},
					]
				: [
						...commonHeaders,
						{
							key: "Content-Security-Policy",
							value: contentSecurityPolicy,
						},
					];

		return [
			{
				source: "/:path*",
				headers,
			},
		];
	},
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
		minimumCacheTTL: 3600,
		deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
		imageSizes: [16, 32, 48, 64, 80, 96, 128, 256, 384],
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
		// Enable faster incremental builds
		swcTraceProfiling: false,
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
