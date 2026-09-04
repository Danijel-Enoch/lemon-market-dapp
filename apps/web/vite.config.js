import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	/**
	 * One React, whoever asks for it.
	 *
	 * In a workspace, `@lemon/ui` and the app resolve `react` from the hoisted
	 * root while Vite's dependency pre-bundle hands its own copy to anything it
	 * optimises. Two copies means two hook dispatchers, and a component rendered
	 * by one calling a hook from the other reads a null dispatcher — which
	 * surfaces as `Cannot read properties of null (reading 'useContext')` from
	 * inside recharts, several layers away from the actual cause.
	 */
	resolve: {
		dedupe: ["react", "react-dom"],
	},
	optimizeDeps: {
		include: ["react", "react-dom", "react/jsx-runtime", "recharts"],
	},
	css: {
		devSourcemap: false,
	},
	server: {
		port: 5174,
		strictPort: true,
		/**
		 * The HMR socket needs its own port, explicitly.
		 *
		 * Vite runs in middleware mode here — the Bun server owns :3002 and Vite
		 * never binds `server.port` at all — so the HMR websocket falls back to a
		 * default that the admin app also wants. Whichever app boots second logs
		 * `WebSocket server error: Port undefined is already in use` and then
		 * simply never hot-reloads, with no error in the browser to explain it.
		 */
		hmr: { port: 5174 },
		allowedHosts: ["testb.kubesmith.app", "lemonmarkets.xyz", "www.lemonmarkets.xyz"],
		sourcemapIgnoreList: (sourcePath) => sourcePath.includes("node_modules"),
	},
	build: {
		rollupOptions: {
			onwarn(warning, warn) {
				if (
					warning.code === "INVALID_ANNOTATION" &&
					warning.message.includes("contains an annotation that Rollup cannot interpret")
				) {
					return;
				}
				warn(warning);
			},
			output: {
				// (Rollup throws if a manual chunk references an external module)
				manualChunks(id, { getModuleInfo }) {
					// If a module is marked external, do not try to include it in a manual chunk
					const info = getModuleInfo?.(id);
					if (info?.isExternal) return;

					if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
						return "react-vendor";
					}

					if (id.includes("node_modules/react-router")) {
						return "react-router-vendor";
					}

					if (id.includes("node_modules/react-hot-toast")) {
						return "toast-vendor";
					}

					if (id.includes("node_modules/posthog-js")) {
						return "posthog";
					}

					if (id.includes("node_modules/viem") || id.includes("node_modules/@wagmi")) {
						return "web3-vendor";
					}

					if (id.includes("node_modules/recharts")) {
						return "recharts";
					}

					if (id.includes("node_modules/framer-motion")) {
						return "framer-motion";
					}
				},
			},
		},
	},
});
