import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

console.log("Vite config loaded!");

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [reactRouter(), tailwindcss(), tsconfigPaths()],
	server: {
		port: 5174,
		strictPort: true,

		allowedHosts: ["testb.kubesmith.app", "lemonmarkets.xyz", "www.lemonmarkets.xyz"],
	},
	build: {
		reportCompressedSize: false,
		target: "esnext",
		sourcemap: false,
	},
	optimizeDeps: {
	},
});
