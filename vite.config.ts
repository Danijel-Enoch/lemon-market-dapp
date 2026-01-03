import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [reactRouter(), tailwindcss(), tsconfigPaths()],
	server: {
		port: 5174,
		strictPort: true,
		hmr: {
			host: "localhost",
		},
		proxy: {
			"/api/geckoterminal": {
				target: "https://api.geckoterminal.com",
				changeOrigin: true,
				headers: {
					Origin: "http://localhost:5174",
				},
				rewrite: (path) => path.replace(/^\/api\/geckoterminal/, ""),
			},
			"/api/dexscreener": {
				target: "https://api.dexscreener.com",
				changeOrigin: true,
				headers: {
					Origin: "http://localhost:5174",
				},
				rewrite: (path) => path.replace(/^\/api\/dexscreener/, ""),
			},
			"/api/coingecko": {
				target: "https://api.coingecko.com",
				changeOrigin: true,
				headers: {
					Origin: "http://localhost:5174",
				},
				rewrite: (path) => path.replace(/^\/api\/coingecko/, ""),
			},
		},
	},
	optimizeDeps: {
		// exclude: ["ox"],
	},
	build: {
		reportCompressedSize: false,
		target: "esnext",
	},
});
