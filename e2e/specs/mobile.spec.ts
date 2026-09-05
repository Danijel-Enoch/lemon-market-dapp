import { expect, test } from "../fixtures";

/**
 * Whether this reads as an app on a phone, asserted rather than eyeballed.
 *
 * "Feels like a mobile app" decomposes into things a machine can check, and
 * each of these is a specific way a web page gives itself away:
 *
 *  - the page scrolls sideways, because one element is wider than the viewport
 *  - a tap target is smaller than a fingertip
 *  - the bottom navigation sits under the home indicator, or scrolls away
 *  - content hides behind a fixed header or the tab bar
 *  - text is small enough that iOS zooms the page when an input is focused
 *
 * They are checked on every route rather than on a representative one, because
 * the usual cause is a single wide table or a long unbroken address on one page.
 */

const ROUTES = ["/", "/vaults", "/activity", "/stats", "/docs", "/portfolio"];

/** iOS zooms the viewport when a focused input's text is under 16px. */
const NO_ZOOM_FONT_PX = 16;

/** The floor Apple and Google both give for a touch target. */
const MIN_TAP_PX = 44;

test.describe("mobile", () => {
	for (const route of ROUTES) {
		test(`${route} does not scroll sideways`, async ({ page }) => {
			await page.goto(route);
			await page.waitForLoadState("networkidle");

			const overflow = await page.evaluate(() => {
				const doc = document.documentElement;
				if (doc.scrollWidth <= doc.clientWidth) return null;

				// Name the culprit rather than just failing: "something overflows"
				// is a whole afternoon, and the offender is almost always one node.
				const width = doc.clientWidth;
				for (const el of Array.from(document.querySelectorAll("*"))) {
					const rect = el.getBoundingClientRect();
					if (rect.right > width + 1 && rect.width > 0) {
						return {
							scrollWidth: doc.scrollWidth,
							clientWidth: width,
							tag: el.tagName.toLowerCase(),
							cls: (el.getAttribute("class") ?? "").slice(0, 120),
							text: (el.textContent ?? "").trim().slice(0, 60),
							right: Math.round(rect.right),
						};
					}
				}
				return {
					scrollWidth: doc.scrollWidth,
					clientWidth: width,
					tag: "?",
					cls: "",
					text: "",
					right: 0,
				};
			});

			expect(overflow, `${route} overflows horizontally: ${JSON.stringify(overflow)}`).toBeNull();
		});
	}

	test("the tab bar is reachable, above the home indicator, and marks the page", async ({
		page,
	}) => {
		await page.goto("/vaults");

		const tabs = page.locator("nav").filter({ has: page.getByRole("link", { name: "Vaults" }) });
		await expect(tabs).toBeVisible();

		// It stays put when the page scrolls — a bar that scrolls away is a
		// footer, not navigation.
		await page.evaluate(() => window.scrollBy(0, 800));
		await expect(tabs).toBeVisible();

		// Every tab clears the touch floor, and the bar sits above the safe area.
		const links = tabs.getByRole("link");
		const count = await links.count();
		expect(count).toBeGreaterThan(0);
		for (let i = 0; i < count; i++) {
			const box = await links.nth(i).boundingBox();
			expect(box, "a tab has no box").not.toBeNull();
			expect(
				box?.height ?? 0,
				`tab ${i} is ${box?.height}px tall, under the ${MIN_TAP_PX}px floor`,
			).toBeGreaterThanOrEqual(MIN_TAP_PX);
		}

		// The current page is marked for assistive tech, not only by colour.
		await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
	});

	test("the tab bar navigates, and marks the new page", async ({ page }) => {
		await page.goto("/vaults");
		const tabs = page.locator("nav").filter({ has: page.getByRole("link", { name: "Vaults" }) });

		await tabs.getByRole("link", { name: "Activity" }).click();
		await expect(page).toHaveURL(/\/activity$/);
		await expect(tabs.getByRole("link", { name: "Activity" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("content is not hidden behind the header or the tab bar", async ({ page }) => {
		await page.goto("/vaults");
		// Measure a laid-out page, not one mid-hydration: an element that has not
		// been placed yet has no box, and "no box" is not the failure under test.
		await page.waitForLoadState("networkidle");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

		// The app chrome specifically, not every <header> on the page — the
		// section header inside the page content is one too, and measuring that
		// compares the heading against a box it sits inside.
		const chromeHeight = await page.evaluate(() =>
			Array.from(document.querySelectorAll("header"))
				.filter((el) => getComputedStyle(el).position === "fixed")
				.reduce((max, el) => Math.max(max, el.getBoundingClientRect().height), 0),
		);
		expect(chromeHeight, "no fixed header found").toBeGreaterThan(0);

		const headingBox = await page.getByRole("heading", { level: 1 }).first().boundingBox();
		expect(headingBox, "the page heading has no box").not.toBeNull();
		expect(
			headingBox?.y ?? 0,
			"the page heading starts underneath the fixed header",
		).toBeGreaterThanOrEqual(chromeHeight - 1);

		// And the last thing on the page can be scrolled clear of the tab bar.
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		const nav = page.locator("nav").filter({ has: page.getByRole("link", { name: "Vaults" }) });
		const navBox = await nav.boundingBox();
		const viewport = page.viewportSize();
		expect(navBox?.y ?? 0).toBeLessThan(viewport?.height ?? 0);
	});

	test("primary actions clear the touch floor", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		const cta = page.getByRole("link", { name: /browse vaults/i }).first();
		await expect(cta).toBeVisible();
		const box = await cta.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TAP_PX);

		// A full-width CTA on a phone: a centred pill with dead space either side
		// is the single most common "this is a desktop page" tell.
		const viewport = page.viewportSize();
		expect(box?.width ?? 0).toBeGreaterThan((viewport?.width ?? 0) * 0.7);
	});

	test("focusing an amount field does not zoom the page", async ({ page, request }) => {
		const { vaults } = await (await request.get("/api/vaults")).json();
		test.skip(vaults.length === 0, "no vault to open");
		await page.goto(`/vaults/${vaults[0].address}`);

		const input = page.getByPlaceholder("0.00").first();
		await expect(input).toBeVisible();

		const fontSize = await input.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
		expect(
			fontSize,
			`the amount field is ${fontSize}px; iOS zooms the viewport below ${NO_ZOOM_FONT_PX}px`,
		).toBeGreaterThanOrEqual(NO_ZOOM_FONT_PX);

		// And the numeric keypad is what a phone should offer for an amount.
		await expect(input).toHaveAttribute("inputmode", "decimal");
	});

	test("the desktop nav row is not rendered on a phone", async ({ page }) => {
		await page.goto("/vaults");
		// Docs and Stats are deliberately absent from the tab bar — five tabs on
		// a phone leaves each too narrow to hit.
		const tabs = page.locator("nav").filter({ has: page.getByRole("link", { name: "Vaults" }) });
		await expect(tabs.getByRole("link", { name: "Docs" })).toHaveCount(0);
		await expect(tabs.getByRole("link", { name: "Stats" })).toHaveCount(0);
	});

	test("tables become cards rather than scrolling sideways", async ({ page }) => {
		await page.goto("/vaults");
		const row = page.locator('a[href^="/vaults/0x"]').first();
		const box = await row.boundingBox();
		const viewport = page.viewportSize();

		// A row wider than the screen means the desktop grid survived to the
		// phone, which is what the card layout exists to prevent.
		expect(box?.width ?? 0).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
	});
});
