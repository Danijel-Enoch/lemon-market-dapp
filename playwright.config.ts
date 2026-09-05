import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end, against the running stack.
 *
 * Nothing here is mocked: the pages are the real pages, the data comes from the
 * indexer through the real API, and the assertions read what a visitor reads.
 * That is the point — the interesting failures in this system live between the
 * contract, the indexer and the page, and a suite that stubs any of the three
 * cannot see them.
 *
 *   bun run dev:stack           # web :3002, api, indexer :42069
 *   bun run dev:admin           # admin :3004
 *   bun run test:e2e
 *
 * Read-only, deliberately. The app trades on Base mainnet and there is no
 * throwaway chain to sign against, so a spec that deposited would be spending
 * real money — the write paths are covered by the contract tests instead.
 *
 * Serial rather than parallel, and one worker. The specs share one deployment,
 * and running them concurrently would make the assertions depend on scheduling.
 */

const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3002";

export default defineConfig({
	testDir: "./e2e/specs",
	globalSetup: "./e2e/global-setup.ts",
	// An indexer round trip behind a cold Vite route. The default 30s is not
	// enough for the first spec to touch each app.
	timeout: 120_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: process.env.CI ? [["github"], ["list"]] : [["list"], ["html", { open: "never" }]],

	use: {
		baseURL: WEB_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},

	projects: [
		{
			name: "desktop",
			use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
			testIgnore: /mobile\.spec\.ts/,
		},
		{
			/**
			 * A real device profile rather than a narrow desktop window. The
			 * difference matters for this app: `env(safe-area-inset-bottom)`, touch
			 * targets and the pointer-coarse hover rules only behave correctly with
			 * a touch-capable, correctly-scaled viewport.
			 */
			name: "mobile",
			use: { ...devices["iPhone 14 Pro"] },
			testMatch: /mobile\.spec\.ts|landing\.spec\.ts|board\.spec\.ts/,
		},
	],
});
