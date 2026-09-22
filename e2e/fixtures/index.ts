import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

/**
 * Configuration is read the same way the stack reads it: `.env`, then any
 * `.env.local` on top.
 *
 * The overlay matters, and leaving it out is how this suite failed with "the
 * contracts have not been deployed" against a stack that was running perfectly
 * — `scripts/dev.sh` layers the same two files, so a fixture that reads only
 * the base file is looking at different configuration from the app it is
 * testing.
 *
 * Reading the files rather than hardcoding addresses means the suite follows
 * whatever this deployment is actually pointed at. The factory address is a
 * deployment fact, and a test pinned to a stale one fails for the least
 * interesting possible reason.
 */
function loadEnv(): Record<string, string> {
	const root = join(import.meta.dirname, "..", "..");
	const out: Record<string, string> = {};
	// Later files win, matching the shell's precedence in `scripts/dev.sh`.
	for (const file of [".env", ".env.local"]) {
		let text: string;
		try {
			text = readFileSync(join(root, file), "utf8");
		} catch {
			continue;
		}
		for (const line of text.split("\n")) {
			const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
			if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
		}
	}
	return out;
}

const env = loadEnv();

export const CONFIG = {
	webUrl: process.env.E2E_WEB_URL ?? "http://localhost:3002",
	adminUrl: process.env.E2E_ADMIN_URL ?? "http://localhost:3004",
	/**
	 * The chain the e2e stack runs against.
	 *
	 * Base, and deliberately one chain rather than all of them. These specs drive
	 * a browser against a live deployment; running them per chain would multiply
	 * the suite by three to re-test the same components with a different
	 * constant. What is worth testing per chain is the configuration — which
	 * chains are enabled, and that none inherits another's endpoint — and that is
	 * a unit test in `packages/wallet/src/chain.test.ts`, where it runs in
	 * milliseconds instead of minutes.
	 */
	chainName: "Base",
	chainId: 8453,
	factory:
		env.VITE_VAULT_FACTORY_ADDRESS_BASE ??
		env.VITE_VAULT_FACTORY_ADDRESS ??
		env.VAULT_FACTORY_ADDRESS_BASE ??
		env.VAULT_FACTORY_ADDRESS ??
		"",
	usdc: env.USDC_ADDRESS_BASE ?? env.USDC_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

/**
 * The keys `useFirstRun` writes. Seeding them is how a test says "I am a
 * returning visitor" — without it every spec opens behind a four-slide intro
 * and a walkthrough that navigates the page out from under it.
 *
 * The intro is not skipped by disabling it; it is skipped by making the browser
 * genuinely be a returning one, so the code under test is the same code a
 * returning visitor runs. `onboarding.spec.ts` opts out and drives it for real.
 */
export const ONBOARDING_KEYS = {
	welcome: "lemon.welcome.seen.v1",
	tour: "lemon.tour.done.v1",
} as const;

export async function skipOnboarding(page: Page) {
	await page.addInitScript((keys: Record<string, string>) => {
		try {
			for (const key of Object.values(keys)) window.localStorage.setItem(key, "1");
		} catch {
			// Blocked storage already reads as "seen"; nothing to do.
		}
	}, ONBOARDING_KEYS);
}

/**
 * No wallet fixture, and that is a deliberate limit on this suite.
 *
 * The app trades on Base mainnet, so a spec that signed would be spending real
 * money against real contracts — there is no throwaway chain to do it on. What
 * is left is everything that does not need a signature: the pages render, the
 * indexer serves them, and the read paths agree with the API. The write paths
 * — creating a vault, depositing, queueing a redemption — are covered by the
 * contract tests, and are not covered here.
 */
type Fixtures = {
	/** Opt out of the onboarding seeding to drive the first-run flow itself. */
	firstVisit: boolean;
};

export const test = base.extend<Fixtures>({
	firstVisit: [false, { option: true }],

	page: async ({ page, firstVisit }, use) => {
		if (!firstVisit) await skipOnboarding(page);
		await use(page);
	},
});

export { expect };

/**
 * Wait for the indexer to catch up with the chain.
 *
 * The app reads the indexer, not the chain, so an assertion made the moment a
 * block lands is an assertion against a read model that has not been told yet.
 * Polling the API is what the app itself effectively does.
 */
export async function waitForIndexer(
	check: () => Promise<boolean>,
	{ timeout = 60_000, interval = 1_000 } = {},
) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await check().catch(() => false)) return;
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error(`the indexer did not catch up within ${timeout}ms`);
}
