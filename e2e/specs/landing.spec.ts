import { expect, test } from "../fixtures";

/**
 * The front door.
 *
 * The assertions worth making here are about honesty rather than layout: the
 * page quotes live protocol figures and links into the app, and the failure
 * mode that matters is a landing page that keeps rendering plausible numbers
 * after the indexer behind it has stopped answering.
 */
test.describe("landing page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("leads with what the product does", async ({ page }) => {
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			"Earn from stocks and crypto",
		);
		// The mechanism, not only the pitch. A headline about earning with no
		// explanation of the hedge underneath it is the failure mode here.
		await expect(page.getByText(/hedges the same size/i).first()).toBeVisible();
		// And the half of the trade a pitch is tempted to leave out.
		await expect(page.getByText(/no upside either/i).first()).toBeVisible();
	});

	test("states the risks rather than burying them", async ({ page }) => {
		const risks = page.getByRole("heading", { name: /not the same as no risk/i });
		await expect(risks).toBeVisible();

		// The four that actually apply to a basis vault. A landing page that
		// lists none of them is the failure this test exists for.
		for (const phrase of [
			/funding can turn negative/i,
			/illiquid/i,
			/liquidation price/i,
			/custodial/i,
		]) {
			await expect(page.getByText(phrase).first()).toBeVisible();
		}
	});

	test("quotes live protocol figures, not placeholders", async ({ page, request }) => {
		const stats = await (await request.get("/api/vaults/stats")).json();

		const vaultCount = page.locator("dt", { hasText: /^Vaults$/ }).locator("xpath=../dd");
		await expect(vaultCount).toHaveText(String(stats.vaultCount));

		const depositors = page.locator("dt", { hasText: /^Depositors$/ }).locator("xpath=../dd");
		await expect(depositors).toHaveText(String(stats.depositors));
	});

	test("routes into the app", async ({ page }) => {
		await page
			.getByRole("link", { name: /browse vaults/i })
			.first()
			.click();
		await expect(page).toHaveURL(/\/vaults$/);
		await expect(page.getByRole("heading", { name: "Vaults", level: 1 })).toBeVisible();
	});

	test("the brand returns to the landing page from inside the app", async ({ page }) => {
		await page.goto("/activity");
		await page
			.getByRole("link", { name: /lemon markets/i })
			.first()
			.click();
		await expect(page).toHaveURL(/\/$/);
	});

	test("featured vaults only show a yield they have actually measured", async ({
		page,
		request,
	}) => {
		const { vaults } = await (await request.get("/api/vaults")).json();
		const measured = vaults.filter((v: { apy7d?: { apy: number | null } }) => v.apy7d?.apy != null);
		test.skip(measured.length === 0, "no vault on this chain has a 7d track record yet");

		const shelf = page.getByRole("heading", { name: /what the vaults have actually paid/i });
		await expect(shelf).toBeVisible();

		// A dash is what an unmeasurable vault renders. None of them belong here.
		const cards = page.locator('a[href^="/vaults/0x"]');
		const count = Math.min(await cards.count(), 3);
		for (let i = 0; i < count; i++) {
			await expect(cards.nth(i)).not.toContainText("—");
		}
	});
});
