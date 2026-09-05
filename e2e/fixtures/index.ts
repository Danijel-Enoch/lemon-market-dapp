import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { ALICE_PK, DEPLOYER_PK, installWallet } from "./wallet";

export { ALICE_ADDRESS, DEPLOYER_ADDRESS } from "./wallet";

/**
 * Configuration is read from the same overlay the app reads.
 *
 * `fork-up.sh` writes `.env.fork` with the addresses it just deployed, and
 * `dev:fork` loads it on top of `.env`. Reading it here rather than hardcoding
 * anything means the suite follows a fresh fork automatically — the factory
 * address changes on every `fork:up`, and a test pinned to yesterday's is a
 * test that fails for the least interesting possible reason.
 */
function loadEnv(): Record<string, string> {
	const root = join(import.meta.dirname, "..", "..");
	const out: Record<string, string> = {};
	for (const file of [".env", ".env.fork"]) {
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
	rpcUrl: env.VITE_CHAIN_RPC_URL ?? env.BASE_RPC_URL ?? "http://127.0.0.1:8545",
	chainId: Number(env.VITE_CHAIN_ID ?? env.CHAIN_ID ?? 8453),
	chainName: env.VITE_CHAIN_NAME ?? "Base Fork (local)",
	factory: env.VITE_VAULT_FACTORY_ADDRESS ?? env.VAULT_FACTORY_ADDRESS ?? "",
	usdc: env.USDC_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
	conservativeVault: env.FORK_VAULT_CONSERVATIVE ?? "",
	leveragedVault: env.FORK_VAULT_LEVERAGED ?? "",
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

type Fixtures = {
	/** A page whose wallet is the deployer — the seeded admin. */
	adminPage: Page;
	/** A page whose wallet is Alice — an ordinary depositor holding USDC. */
	userPage: Page;
	/** Opt out of the onboarding seeding to drive the first-run flow itself. */
	firstVisit: boolean;
};

export const test = base.extend<Fixtures>({
	firstVisit: [false, { option: true }],

	page: async ({ page, firstVisit }, use) => {
		if (!firstVisit) await skipOnboarding(page);
		await use(page);
	},

	adminPage: async ({ page }, use) => {
		await installWallet(page, {
			privateKey: DEPLOYER_PK,
			rpcUrl: CONFIG.rpcUrl,
			chainId: CONFIG.chainId,
			chainName: CONFIG.chainName,
		});
		await use(page);
	},

	userPage: async ({ page }, use) => {
		await installWallet(page, {
			privateKey: ALICE_PK,
			rpcUrl: CONFIG.rpcUrl,
			chainId: CONFIG.chainId,
			chainName: CONFIG.chainName,
		});
		await use(page);
	},
});

export { expect };

/**
 * Connect through RainbowKit's own modal rather than around it.
 *
 * Calling `connect()` on the wagmi config directly would skip the part most
 * likely to be broken — whether the connect button opens the modal, whether the
 * modal lists an installed wallet, and whether choosing it wires up. So the
 * test clicks what a person clicks.
 */
export async function connectWallet(page: Page, buttonName = "Connect") {
	const connect = page.getByRole("button", { name: buttonName, exact: true }).first();

	// The connected state looks different in the two apps — the console uses
	// RainbowKit's own button, the public app builds its own out of
	// `ConnectButton.Custom` — so both shapes count as "already connected".
	const connected = page
		.getByTestId("rk-account-button")
		.or(page.getByRole("button", { name: /^0x[0-9a-fA-F]{2}/ }))
		.first();

	/**
	 * Wait for one of them before deciding which case this is.
	 *
	 * Until RainbowKit has mounted it renders an `aria-hidden`, zero-opacity
	 * placeholder, so there is a window in which *neither* button is visible.
	 * Treating that as "already connected" — which is what checking the connect
	 * button alone does — silently skips the connection, and the failure
	 * surfaces much later as a deposit panel that says "Connect a wallet".
	 */
	await expect(connect.or(connected)).toBeVisible({ timeout: 30_000 });

	// wagmi restores a previous session on load, so a page reached later in a
	// test may already be connected and have no connect button at all.
	if (await connected.isVisible().catch(() => false)) return;

	await connect.click();

	// RainbowKit renders its list in a portal; the wallet is announced over
	// EIP-6963 as MetaMask, so that is the entry the shim shows up under.
	const modal = page.locator('[data-testid="rk-connect-modal"], [role="dialog"]').first();
	await expect(modal).toBeVisible();
	await modal.getByText("MetaMask", { exact: false }).first().click();

	// The modal closes on its own once the connector resolves. Waiting for the
	// connect button to go too is what distinguishes a connection from a
	// dismissal — the modal closes either way.
	await expect(modal).toBeHidden({ timeout: 30_000 });
	await expect(connect).toBeHidden({ timeout: 30_000 });
}

/**
 * Sign in to the operator console: connect, then prove the address.
 *
 * These are two steps in the UI because they are two steps in reality — the
 * session cookie the admin API gates on can only be minted by a signature.
 */
export async function signInAsAdmin(page: Page) {
	await page.goto(CONFIG.adminUrl);
	await connectWallet(page);

	const signIn = page.getByTestId("admin-sign-in");
	if (await signIn.isVisible().catch(() => false)) {
		await signIn.click();
		await expect(signIn).toBeHidden({ timeout: 20_000 });
	}
}

/**
 * Wait for Ponder to catch up with a transaction that has already landed.
 *
 * The app reads the indexer, not the chain, so a test that asserts immediately
 * after a receipt is asserting against a read model that has not been told yet.
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
