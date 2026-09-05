import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end, against a real chain.
 *
 * These tests run against the Base-mainnet fork that `bun run fork:up` brings
 * up, with `bun run dev:fork` serving the apps on top of it. Nothing here is
 * mocked: a deposit is a transaction, the indexer picks it up, and the
 * assertion afterwards reads the same API the app reads. That is the point —
 * the interesting failures in this system live between the contract, the
 * indexer and the page, and a suite that stubs any of the three cannot see them.
 *
 *   bun run fork:up
 *   bun run dev:fork            # web :3002, admin :3004
 *   bun run test:e2e
 *
 * Serial rather than parallel, and one worker. The tests share one chain and
 * one database, and several of them move the same vault's balances — running
 * them concurrently would make the assertions depend on scheduling.
 */

const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3002";

export default defineConfig({
	testDir: "./e2e/specs",
	globalSetup: "./e2e/global-setup.ts",
	// Real transactions on a forked chain, then an indexer round trip. The
	// default 30s is not enough for the admin creation flow.
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
