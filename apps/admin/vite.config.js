import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * The admin app's build.
 *
 * Deliberately thinner than the public app's. There is no wallet-vendor chunk
 * because there is no RainbowKit here, and no PostHog because an operator
 * console is not something to instrument for product analytics.
 */
export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	css: { devSourcemap: false },
	server: { port: 5175, strictPort: true },
	build: {
		rollupOptions: {
			output: {
				manualChunks(id, { getModuleInfo }) {
					if (getModuleInfo?.(id)?.isExternal) return;
					if (id.includes("node_modules/react-router")) return "react-router-vendor";
					if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
						return "react-vendor";
					}
					if (id.includes("node_modules/viem") || id.includes("node_modules/@wagmi")) {
						return "web3-vendor";
					}
					if (id.includes("node_modules/recharts")) return "recharts";
				},
			},
		},
	},
});
