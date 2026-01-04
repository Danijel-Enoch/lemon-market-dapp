import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	css: {
		devSourcemap: false,
	},
	server: {
		port: 5174,
		strictPort: true,
		allowedHosts: ["testb.kubesmith.app", "lemonmarkets.xyz", "www.lemonmarkets.xyz"],
		sourcemapIgnoreList: (sourcePath) => sourcePath.includes("node_modules"),
	},
	build: {
		reportCompressedSize: false,
		target: "esnext",
		sourcemap: false,
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
				},
			},
		},
	},
});
