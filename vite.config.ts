import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		proxy: {
			"/api/geckoterminal": {
				target: "https://api.geckoterminal.com",
				changeOrigin: true,
				headers: {
					Origin: "http://localhost:5173",
				},
				rewrite: (path) => path.replace(/^\/api\/geckoterminal/, ""),
			},
			"/api/dexscreener": {
				target: "https://api.dexscreener.com",
				changeOrigin: true,
				headers: {
					Origin: "http://localhost:5173",
				},
				rewrite: (path) => path.replace(/^\/api\/dexscreener/, ""),
			},
			"/api/coingecko": {
				target: "https://api.coingecko.com",
				changeOrigin: true,
				headers: {
					Origin: "http://localhost:5173",
				},
				rewrite: (path) => path.replace(/^\/api\/coingecko/, ""),
			},
		},
	},
	optimizeDeps: {
		// exclude: ["react-use"],
	},
	build: {
		reportCompressedSize: false,
		target: "esnext",
		rolldownOptions: {
			onwarn(warning, warn) {
				// Suppress warnings about PURE comments in node_modules
				if (warning.message.includes("contains an annotation that Rollup cannot interpret")) {
					return;
				}
				warn(warning);
			},
			external: ["react-use"],
			output: {
				advancedChunks: {
					groups: [
						{
							test: /react-/,
							name: "vendor_react",
						},
						{
							test: /wagmi|viem|@tanstack\/react-query/,
							name: "vendor_wagmi",
						},
						{
							test: /lucide-react|framer-motion|@radix-ui\/react-.*$/,
							name: "vendor_ui_libs",
						},
					],
				},
			},
		},
	},
});
