import { CONFIG, connectWallet, expect, signInAsAdmin, test, waitForIndexer } from "../fixtures";

/**
 * The operator console, driven the way an operator drives it.
 *
 * Creating a vault is the one write path the whole system is arranged around,
 * and it is genuinely a three-party transaction: the server derives an agent
 * wallet from NEAR, the operator's own wallet deploys the vault naming it, and
 * the server then records the venue configuration the agent needs. Any of the
 * three can fail on its own, and the failures look identical from the outside —
 * a vault that exists and never trades.
 *
 * So this spec follows the whole chain to the end: through the UI, onto the
 * fork, back through the indexer, and out the other side on the public app.
 */
test.describe("operator console", () => {
	test("is closed until an address is proved, not merely connected", async ({ adminPage }) => {
		await adminPage.goto(CONFIG.adminUrl);

		// Before anything: no session, so the console says so rather than
		// rendering an empty dashboard.
		await expect(adminPage.getByText(/this dashboard is for protocol operators/i)).toBeVisible();

		// Connecting a wallet alone must not open it. The API gates on a session
		// cookie that only a signature can mint, and a console that unlocked on
		// connection alone would be trusting a value the browser chose.
		await connectWallet(adminPage);
		await expect(adminPage.getByTestId("admin-sign-in")).toBeVisible();
		await expect(adminPage.getByText(/this dashboard is for protocol operators/i)).toBeVisible();

		// Signing is what opens it.
		await adminPage.getByTestId("admin-sign-in").click();
		await expect(adminPage.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
	});

	test("shows the vaults it operates, with agent health", async ({ adminPage }) => {
		await signInAsAdmin(adminPage);

		const response = await adminPage.request.get(`${CONFIG.adminUrl}/api/vaults`);
		const { vaults } = await response.json();
		expect(vaults.length).toBeGreaterThan(0);

		// Every vault the API knows about is on the page. A vault with no venue
		// configuration has no ticker — it was deployed outside this dashboard,
		// or its record was refused — and the console falls back to its share
		// symbol rather than dropping the row, which is the behaviour that
		// matters: an unconfigured vault is exactly the one an operator needs to
		// see.
		for (const vault of vaults) {
			const label = vault.ticker ?? vault.symbol;
			await expect(adminPage.getByRole("link", { name: label, exact: true })).toBeVisible();
		}
	});

	/**
	 * The whole creation path, end to end.
	 *
	 * Skipped rather than failed when there is no creatable market: the list is
	 * a live liquidity probe against real Base pools, and "no market can be
	 * vaulted right now" is a true answer about the world rather than a broken
	 * console. Failing on it would make the suite red for reasons no change to
	 * this repo could fix.
	 */
	test("creates a vault, and the new vault reaches the public app", async ({ adminPage }) => {
		await signInAsAdmin(adminPage);

		await adminPage.getByRole("tab", { name: "Create", exact: true }).click();

		// The list is a live liquidity probe against real Base pools, so it takes
		// seconds rather than milliseconds. Waiting for either outcome — rows or
		// the empty state — rather than sleeping is what keeps this from being a
		// race that skips itself on a slow day.
		await settleMarketList(adminPage);

		/**
		 * A market with neither tier taken.
		 *
		 * A row whose conservative vault already exists still offers "Create
		 * vault" — for the *other* tier — and the dialog opens on the
		 * conservative one, where it correctly refuses. Picking such a row would
		 * test the refusal, which has its own case below, rather than creation.
		 */
		const freshRow = adminPage
			.locator("li")
			.filter({ has: adminPage.getByRole("button", { name: /^Create vault$/ }) })
			.filter({ hasNotText: /Conservative vault|Leveraged vault/ })
			.first();

		test.skip(
			(await freshRow.count()) === 0,
			"every routable market on this chain already has a vault",
		);

		await freshRow.getByRole("button", { name: /^Create vault$/ }).click();

		// Everything from here is scoped to the dialog. The market list behind it
		// has its own "Create vault" button on every row, so an unscoped locator
		// matches fifteen elements and clicks none of them.
		const dialog = adminPage.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// Step one: derive. Nothing is created, and this is the only moment
		// anyone looks at the wallet about to be handed the whole position.
		await dialog.getByRole("button", { name: /derive agent wallet/i }).click();
		await expect(dialog.getByText(/this wallet will hold the position/i)).toBeVisible({
			timeout: 60_000,
		});
		await expect(dialog.getByText("Agent (Base)")).toBeVisible();

		// Step two: the operator's own wallet deploys it. This is a real
		// transaction against the fork.
		await dialog.getByRole("button", { name: /^Create vault$/ }).click();

		// Step three: the venue configuration is recorded, and only then is it done.
		await expect(dialog.getByText(/^Vault created$/)).toBeVisible({ timeout: 90_000 });
		await dialog.getByRole("button", { name: /^Done$/ }).click();

		// The chain is the source of truth, so ask it how many vaults exist and
		// wait for the indexer to agree.
		const countAfter = await vaultCount(adminPage);
		await waitForIndexer(async () => {
			const res = await adminPage.request.get(`${CONFIG.webUrl}/api/vaults`);
			const { vaults } = await res.json();
			return Array.isArray(vaults) && vaults.length === countAfter;
		});

		// And the depositor-facing board shows it. A vault the operator can see
		// and a depositor cannot is not a created vault.
		await adminPage.goto(`${CONFIG.webUrl}/vaults`);
		const rows = adminPage.locator('a[href^="/vaults/0x"]');
		await expect(rows).toHaveCount(countAfter);
	});

	test("refuses a second vault for a market and tier that already has one", async ({
		adminPage,
	}) => {
		await signInAsAdmin(adminPage);
		await adminPage.getByRole("tab", { name: "Create", exact: true }).click();
		await settleMarketList(adminPage);

		// A market whose tier is already vaulted carries the badge. Restricted to
		// visible rows: the same markup renders inside the collapsed "cannot be
		// vaulted right now" disclosure, where the row's button is not in the
		// accessibility tree at all and the locator waits for it forever.
		const takenRow = adminPage
			.locator("li")
			.filter({ has: adminPage.getByText("Conservative vault") })
			.filter({ visible: true })
			.first();
		test.skip(
			(await takenRow.count()) === 0,
			"no market on this chain has a conservative vault yet",
		);

		const button = takenRow.getByRole("button").last();
		await expect(button).toBeVisible();

		// A market with both tiers taken is refused by the row itself.
		if (!(await button.isEnabled())) {
			await expect(button).toHaveText(/both tiers exist/i);
			return;
		}

		// Otherwise the row opens, and the dialog refuses the tier that is taken
		// while leaving the other one available.
		await button.click();
		const dialog = adminPage.getByRole("dialog");
		await dialog.getByRole("tab", { name: "No leverage" }).click();
		await expect(dialog.getByText(/already exists/i)).toBeVisible();
		await expect(dialog.getByRole("button", { name: /derive agent wallet/i })).toBeDisabled();
	});

	test("watches agent gas, because running out of it looks like a broken agent", async ({
		adminPage,
	}) => {
		await signInAsAdmin(adminPage);
		await adminPage.getByRole("tab", { name: /^Gas/ }).click();
		await expect(adminPage.getByRole("heading", { name: /agent gas/i })).toBeVisible();

		// Reading each agent's balance is an RPC round trip per vault on two
		// chains, one of them Solana devnet, so the panel is legitimately empty
		// for a while. Wait for it to reach one of its two settled states.
		const baseLabel = adminPage.getByText("Base", { exact: true }).first();
		const empty = adminPage.getByText(/no agents to check/i);
		await expect(baseLabel.or(empty)).toBeVisible({ timeout: 60_000 });

		if (await empty.isVisible().catch(() => false)) return;

		// Both wallets per vault. The Solana one is shown with its address and no
		// button on purpose — a Base wallet cannot send SOL, and a button that
		// opens a wallet which then cannot sign is worse than none.
		await expect(adminPage.getByText("Solana", { exact: true }).first()).toBeVisible();
	});

	test("records why each agent did what it did", async ({ adminPage }) => {
		await signInAsAdmin(adminPage);
		await adminPage.getByRole("tab", { name: /agent log/i }).click();
		// Either there are runs, or the page says there are none — not a blank panel.
		await expect(adminPage.getByText(/no runs|reason|decision|nothing/i).first()).toBeVisible({
			timeout: 20_000,
		});
	});
});

/**
 * Wait for the Create tab to finish probing.
 *
 * Resolves on rows, on the "nothing can be vaulted" empty state, or on the
 * missing-factory warning — the three things the tab can legitimately end up
 * showing. Anything else is a hang worth failing on.
 */
async function settleMarketList(page: import("@playwright/test").Page) {
	await expect(
		page
			.getByRole("button", { name: /^Create vault$|^Both tiers exist$|^Unavailable$/ })
			.first()
			.or(page.getByText(/no market can be vaulted right now/i))
			.or(page.getByText(/no factory address configured/i)),
	).toBeVisible({ timeout: 90_000 });
}

/** How many vaults the factory has actually deployed, read from the chain. */
async function vaultCount(page: import("@playwright/test").Page): Promise<number> {
	const res = await page.request.post(CONFIG.rpcUrl, {
		data: {
			jsonrpc: "2.0",
			id: 1,
			method: "eth_call",
			// `vaultCount()`
			params: [{ to: CONFIG.factory, data: "0xa7c6a100" }, "latest"],
		},
	});
	const { result } = await res.json();
	return Number(BigInt(result));
}
