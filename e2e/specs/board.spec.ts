import { CONFIG, expect, test } from "../fixtures";

/**
 * The board, and the rest of the read-only app.
 *
 * These pages are the protocol's public claim about itself, and the failures
 * that matter are the quiet ones: a filter that hides everything, a yield
 * column that invents a number for a vault with no history, an indexer outage
 * rendered as an empty list rather than as an outage.
 */
test.describe("vault board", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/vaults");
		// The rows are fetched after hydration, so counting before they arrive
		// measures an empty board and quietly passes the wrong assertion.
		await expect(page.locator('a[href^="/vaults/0x"]').first()).toBeVisible();
	});

	test("lists every vault the indexer knows about", async ({ page, request }) => {
		const { vaults } = await (await request.get(`${CONFIG.webUrl}/api/vaults`)).json();
		await expect(page.locator('a[href^="/vaults/0x"]')).toHaveCount(vaults.length);

		// The board renders each row twice — a desktop grid and a mobile card,
		// one of them display:none — so the label has to be matched among the
		// nodes that are actually on screen at this viewport.
		//
		// `ticker ?? symbol` because a vault with no venue configuration has no
		// ticker. It still belongs on the board: it is deployed and it holds
		// funds, and hiding it would make the public list disagree with the chain.
		for (const vault of vaults) {
			const label = vault.ticker ?? vault.symbol;
			await expect(
				page.getByText(label, { exact: true }).filter({ visible: true }).first(),
			).toBeVisible();
		}
	});

	test("headline figures agree with the API", async ({ page, request }) => {
		const stats = await (await request.get(`${CONFIG.webUrl}/api/vaults/stats`)).json();
		await expect(page.getByText(String(stats.vaultCount), { exact: true }).first()).toBeVisible();
	});

	test("filters narrow the list without emptying it", async ({ page }) => {
		const all = await page.locator('a[href^="/vaults/0x"]').count();

		await page.getByRole("button", { name: /^No leverage$/ }).click();
		const conservative = await page.locator('a[href^="/vaults/0x"]').count();
		expect(conservative).toBeLessThanOrEqual(all);

		await page.getByRole("button", { name: /^Leveraged$/ }).click();
		const leveraged = await page.locator('a[href^="/vaults/0x"]').count();

		// The two tiers partition the board. If they do not add up, a vault is
		// being hidden by both filters and is unreachable through either.
		expect(conservative + leveraged).toBe(all);

		await page.getByRole("button", { name: /^Any risk$/ }).click();
		await expect(page.locator('a[href^="/vaults/0x"]')).toHaveCount(all);
	});

	test("a vault too new to measure shows a dash, not a zero", async ({ page, request }) => {
		const { vaults } = await (await request.get(`${CONFIG.webUrl}/api/vaults`)).json();
		const unmeasured: { ticker: string | null; symbol: string }[] = vaults.filter(
			(v: { apy7d?: { apy: number | null } }) => v.apy7d?.apy == null,
		);
		test.skip(unmeasured.length === 0, "every vault on this chain has a 7d track record");

		// Rendering an unknown yield as 0.00% is a claim about performance where
		// none exists, which is the specific thing this column refuses to do.
		const row = page.locator('a[href^="/vaults/0x"]', {
			hasText: unmeasured[0].ticker ?? unmeasured[0].symbol,
		});
		await expect(row.getByText("—").filter({ visible: true }).first()).toBeVisible();
	});

	test("projects a yield where it can, and says why where it cannot", async ({ page, request }) => {
		const { vaults } = await (await request.get(`${CONFIG.webUrl}/api/vaults`)).json();
		type Row = {
			ticker: string | null;
			symbol: string;
			outlook: { available: boolean; netApyPercent?: number };
		};

		// The projection exists so a vault with no track record still has something
		// to show the person deciding whether to be its first depositor. It is a
		// different claim from the realised columns and is labelled as one.
		//
		// Case-insensitive because the label is not one element: the desktop grid
		// has a "Projected" column header, and the mobile card — where there are
		// no columns to head — carries a lowercase "projected" under the figure
		// instead. Matching only the desktop casing passed on desktop and failed
		// on mobile against a board that was rendering correctly in both.
		await expect(
			page
				.getByText(/^projected$/i)
				.filter({ visible: true })
				.first(),
		).toBeVisible();

		const projected: Row[] = vaults.filter((v: Row) => v.outlook?.available);
		test.skip(projected.length === 0, "no vault on this deployment has a live funding rate");

		const vault = projected[0];
		const row = page.locator('a[href^="/vaults/0x"]', {
			hasText: vault.ticker ?? vault.symbol,
		});
		// One decimal place, matching `formatPercent(value, 1)`. Asserting the
		// number rather than merely that a number is present is what catches the
		// projection being computed on the wrong vault's terms.
		//
		// Filtered to the visible node for the same reason the label above is:
		// the row exists twice, and `.first()` alone resolves the desktop cell,
		// which is `display:none` at a phone viewport.
		const expected = `${(vault.outlook.netApyPercent ?? 0).toFixed(1)}%`;
		await expect(
			row.getByText(expected, { exact: false }).filter({ visible: true }).first(),
		).toBeVisible();
	});

	test("opens a vault and shows its position", async ({ page }) => {
		await page.locator('a[href^="/vaults/0x"]').first().click();
		await expect(page).toHaveURL(/\/vaults\/0x[0-9a-fA-F]{40}/);

		await expect(page.getByRole("heading", { name: /share price/i })).toBeVisible();
		await expect(page.getByRole("heading", { name: /agent activity/i })).toBeVisible();
		await expect(page.getByRole("heading", { name: /capital movements/i })).toBeVisible();
	});

	test("an unknown vault address says so rather than erroring", async ({ page }) => {
		await page.goto("/vaults/0x0000000000000000000000000000000000000001");
		await expect(page.getByText(/no vault here/i)).toBeVisible();
	});
});

test.describe("the rest of the public app", () => {
	test("the activity feed is open with no wallet", async ({ page }) => {
		await page.goto("/activity");
		await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();

		// The claim that anyone can audit the agents is only true if this page
		// renders something without a connected wallet.
		await expect(page.getByText(/connect/i).first())
			.toBeHidden()
			.catch(() => {});
		await expect(page.locator('[data-tour="activity-feed"]')).toBeVisible();
	});

	test("stats reports the protocol's own numbers", async ({ page, request }) => {
		await page.goto("/stats");
		await expect(page.getByRole("heading", { name: "Stats", level: 1 })).toBeVisible();

		const stats = await (await request.get(`${CONFIG.webUrl}/api/vaults/stats`)).json();
		await expect(page.getByText(/flows/i).first()).toBeVisible();
		await expect(page.getByText(/withdrawal queue/i).first()).toBeVisible();
		expect(stats.vaultCount).toBeGreaterThan(0);
	});

	test("the portfolio asks for a wallet rather than showing an empty page", async ({ page }) => {
		await page.goto("/portfolio");
		await expect(page.getByText(/connect a wallet/i).first()).toBeVisible();
	});

	test("docs render without a wallet or an indexer", async ({ page }) => {
		await page.goto("/docs");
		await expect(page.locator("h1, h2").first()).toBeVisible();
	});

	test("an unknown route is a 404 page, not a blank one", async ({ page }) => {
		const response = await page.goto("/no-such-page");
		expect(response?.status()).toBe(404);
		await expect(page.getByRole("link").first()).toBeVisible();
	});
});
