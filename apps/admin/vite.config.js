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
	/**
	 * One React, whoever asks for it. Same reason as the public app's config:
	 * `@lemon/ui` resolves `react` from the hoisted workspace root while Vite's
	 * dependency pre-bundle hands its own copy to anything it optimises, and a
	 * component rendered by one calling a hook from the other reads a null
	 * dispatcher. It surfaces from inside recharts, which this app also depends
	 * on, several layers from the actual cause.
	 */
	resolve: {
		dedupe: ["react", "react-dom"],
	},
	optimizeDeps: {
		include: ["react", "react-dom", "react/jsx-runtime", "recharts"],
	},
	css: { devSourcemap: false },
	// Its own HMR port, distinct from the public app's — see the note there.
	server: { port: 5175, strictPort: true, hmr: { port: 5175 } },
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
