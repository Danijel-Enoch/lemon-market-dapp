import { expect, test } from "../fixtures";

/**
 * The first visit, driven for real.
 *
 * Every other spec seeds localStorage so the browser is a returning one — the
 * intro is a four-slide takeover that would otherwise sit in front of the thing
 * under test. This file opts out and exercises it, because "the intro appears
 * exactly once, on the right page, and can be dismissed" is a claim that would
 * otherwise never be checked at all.
 */
test.use({ firstVisit: true });

test.describe("first run", () => {
	test("the intro does not ambush the landing page", async ({ page }) => {
		await page.goto("/");
		// Someone still reading the pitch has not asked to be walked around an
		// app they have not entered. The intro belongs on the board.
		await expect(page.getByRole("dialog", { name: /welcome to lemon/i })).toBeHidden();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Earn the funding rate");
	});

	test("the intro explains the trade before the app asks for anything", async ({ page }) => {
		await page.goto("/vaults");

		const intro = page.getByRole("dialog", { name: /welcome to lemon/i });
		await expect(intro).toBeVisible();

		// It is reachable by keyboard and by pointer, and it says how much is left.
		await expect(intro.getByRole("button", { name: /go to slide 1/i })).toBeVisible();

		// The last slide is the risk slide, not a call to action — an intro that
		// only sells is the one people stop trusting when funding flips negative.
		for (let i = 0; i < 8; i++) {
			const next = intro.getByRole("button", { name: /^Next$/ });
			if (!(await next.isVisible().catch(() => false))) break;
			await next.click();
		}
		await expect(intro.getByRole("button", { name: /show me the markets/i })).toBeVisible();
		await expect(intro.getByText(/risk|liquidat|negative/i).first()).toBeVisible();
	});

	test("skipping is remembered, so it appears exactly once", async ({ page }) => {
		await page.goto("/vaults");

		const intro = page.getByRole("dialog", { name: /welcome to lemon/i });
		await expect(intro).toBeVisible();
		await intro.getByRole("button", { name: /^Skip$/ }).click();
		await expect(intro).toBeHidden();

		// The board is now usable...
		await expect(page.getByRole("heading", { name: "Vaults", level: 1 })).toBeVisible();

		// ...and a reload does not bring it back. An intro that cannot remember
		// being dismissed is worse than no intro.
		await page.reload();
		await expect(intro).toBeHidden();
		await expect(page.getByRole("heading", { name: "Vaults", level: 1 })).toBeVisible();
	});

	test("finishing the intro hands over to the walkthrough on the board", async ({ page }) => {
		await page.goto("/vaults");

		const intro = page.getByRole("dialog", { name: /welcome to lemon/i });
		await expect(intro).toBeVisible();

		for (let i = 0; i < 8; i++) {
			const next = intro.getByRole("button", { name: /^Next$/ });
			if (!(await next.isVisible().catch(() => false))) break;
			await next.click();
		}
		await intro.getByRole("button", { name: /show me the markets/i }).click();
		await expect(intro).toBeHidden();

		// The tour spotlights elements on the board itself, so the board has to
		// be underneath it rather than replaced by it.
		await expect(page.getByRole("heading", { name: "Vaults", level: 1 })).toBeVisible();
		await expect(page).toHaveURL(/\/vaults$/);
	});
});
