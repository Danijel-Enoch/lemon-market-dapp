import type { Locator, Page } from "@playwright/test";
import { ALICE_ADDRESS, CONFIG, connectWallet, expect, test, waitForIndexer } from "../fixtures";

/**
 * The depositor's whole relationship with a vault.
 *
 * Deposit, hold, queue an exit — as real transactions on the fork, read back
 * through the indexer. The assertions are deliberately about *values* rather
 * than about buttons having been clicked: a deposit that leaves the share
 * balance unchanged, or a redemption request that never appears in the queue,
 * is the failure worth catching, and both look like a successful click.
 */
test.describe("depositing", () => {
	let vaultUrl: string;
	let vaultAddress: string;

	test.beforeAll(async ({ request }) => {
		const { vaults } = await (await request.get(`${CONFIG.webUrl}/api/vaults`)).json();
		// A vault with a share price and some history, so the maths on the page
		// is about a real position rather than about an empty one.
		const vault = vaults.find((v: { depositorCount: number }) => v.depositorCount > 0) ?? vaults[0];
		vaultAddress = vault.address;
		vaultUrl = `/vaults/${vault.address}`;
	});

	test("a vault page states its terms before asking for money", async ({ page }) => {
		await page.goto(vaultUrl);

		// The three things that decide whether depositing is a good idea.
		await expect(page.getByText(/share price/i).first()).toBeVisible();
		await expect(page.getByText(/3–7 days|3-7 days/i).first()).toBeVisible();
		await expect(page.getByRole("heading", { name: "Deposit", exact: true })).toBeVisible();
	});

	test("without a wallet it explains rather than offering a dead button", async ({ page }) => {
		await page.goto(vaultUrl);
		await expect(page.getByText(/connect a wallet to deposit/i)).toBeVisible();
	});

	test("a deposit mints shares, and the position shows up", async ({ userPage }) => {
		await userPage.goto(vaultUrl);
		await connectWallet(userPage);

		const panel = depositPanel(userPage);
		const before = await supplyOf(userPage, vaultAddress);

		await panel.getByPlaceholder("0.00").fill("25");

		// USDC needs an allowance first. The panel shows one button or the other,
		// never both, so this is a two-step flow only when it has to be — and
		// which one it is depends on an allowance read that may not have landed
		// the instant the amount was typed. Waiting for either button to settle
		// before branching is what keeps this from sampling the wrong one.
		const approve = panel.getByRole("button", { name: /^Approve USDC$/ });
		const deposit = panel.getByRole("button", { name: /^Deposit$/ });
		await expect(approve.or(deposit)).toBeVisible();

		if (await approve.isVisible().catch(() => false)) {
			await approve.click();
			await expect(deposit).toBeEnabled({ timeout: 60_000 });
		}

		await expect(deposit).toBeEnabled({ timeout: 30_000 });
		await deposit.click();

		// The chain has it; wait for the read model to agree.
		await waitForIndexer(async () => (await supplyOf(userPage, vaultAddress)) > before);

		// And the depositor's own page reflects it. Asserted through the API's
		// own numbers rather than against a formatted string: the display rounds,
		// and a test that pins the rendering breaks on a formatting change while
		// saying nothing about whether the deposit worked.
		const holding = await holdingOf(userPage, vaultAddress);
		expect(holding, "the deposit did not produce a holding").toBeTruthy();
		expect(BigInt(holding?.shares ?? "0")).toBeGreaterThan(0n);

		await userPage.goto("/portfolio");
		// The portfolio is wallet-gated, and a fresh navigation has to reconnect
		// before it renders anything but the prompt.
		await connectWallet(userPage);
		await expect(userPage.getByRole("heading", { name: /^Holdings$/ })).toBeVisible();
		// The empty state must be gone — a wallet that just deposited has a position.
		await expect(userPage.getByText(/no vault shares yet/i)).toBeHidden();
	});

	/**
	 * The first deposit into a vault, which is a two-transaction flow.
	 *
	 * This is a regression test with a specific bug behind it: the confirmation
	 * handler fired for the *approval* as well as the deposit and cleared the
	 * amount field, so a first-time depositor approved exactly what they had
	 * typed and was then left looking at an empty box and a disabled "Deposit"
	 * button, with nothing on screen saying why. The allowance being for the
	 * exact amount made it worse — retyping a different number meant approving
	 * a second time.
	 *
	 * The allowance is revoked first so this path is taken on every run, not
	 * only against a wallet that happens never to have used the vault.
	 */
	test("the first deposit into a vault survives its own approval step", async ({ userPage }) => {
		await userPage.goto(vaultUrl);
		await connectWallet(userPage);

		await setAllowanceToZero(userPage, vaultAddress);
		// Reload rather than waiting on the panel's poll: react-query pauses
		// interval refetching for a backgrounded document, and a headless page
		// is not reliably foregrounded.
		await userPage.reload();
		await connectWallet(userPage);

		const panel = depositPanel(userPage);
		await panel.getByPlaceholder("0.00").fill("5");

		const approve = panel.getByRole("button", { name: /^Approve USDC$/ });
		await expect(approve).toBeVisible({ timeout: 30_000 });
		await approve.click();

		// The approval confirms and the panel offers the deposit. The amount the
		// user typed — and just approved — has to still be there.
		const deposit = panel.getByRole("button", { name: /^Deposit$/ });
		await expect(deposit).toBeVisible({ timeout: 60_000 });
		await expect(panel.getByPlaceholder("0.00")).toHaveValue("5");
		await expect(deposit).toBeEnabled({ timeout: 30_000 });

		const before = await supplyOf(userPage, vaultAddress);
		await deposit.click();
		await waitForIndexer(async () => (await supplyOf(userPage, vaultAddress)) > before);

		// And *now* the field clears, because the deposit is actually done.
		await expect(panel.getByPlaceholder("0.00")).toHaveValue("", { timeout: 30_000 });
	});

	test("a withdrawal is queued, not paid, and the countdown is stated", async ({ userPage }) => {
		await userPage.goto(vaultUrl);
		await connectWallet(userPage);

		const holding = await holdingOf(userPage, vaultAddress);
		test.skip(!holding || BigInt(holding.shares) === 0n, "this wallet holds no shares here");

		const panel = withdrawPanel(userPage);
		await expect(panel).toBeVisible();

		const escrowedBefore = await pendingSharesOf(userPage, vaultAddress);

		await panel.getByPlaceholder("0.00").fill("1");
		const request = panel.getByRole("button", { name: /^Request withdrawal$/ });
		await expect(request).toBeEnabled();
		await request.click();

		// It lands in the queue rather than paying out. Asserted on the escrowed
		// *shares* rather than on the number of requests: a second request from
		// the same wallet merges into the first — deliberately, so a one-wei
		// request cannot ripen for three days and then carry a large top-up out
		// with it — so the queue's length does not grow.
		await waitForIndexer(
			async () => (await pendingSharesOf(userPage, vaultAddress)) > escrowedBefore,
		);

		await userPage.reload();
		await expect(userPage.getByText(/day|hour|agent may act|queued/i).first()).toBeVisible();
	});

	test("the vault refuses a deposit larger than the wallet holds", async ({ userPage }) => {
		await userPage.goto(vaultUrl);
		await connectWallet(userPage);

		await depositPanel(userPage).getByPlaceholder("0.00").fill("999999999");
		await expect(userPage.getByText(/more USDC than this wallet holds/i)).toBeVisible();
	});

	test("the vault refuses a withdrawal larger than the shares held", async ({ userPage }) => {
		await userPage.goto(vaultUrl);
		await connectWallet(userPage);

		const panel = withdrawPanel(userPage);
		await panel.getByPlaceholder("0.00").fill("999999999");
		await expect(userPage.getByText(/more than you hold/i)).toBeVisible();
		await expect(panel.getByRole("button", { name: /^Request withdrawal$/ })).toBeDisabled();
	});
});

// --- helpers ---------------------------------------------------------------

/** Both panels use the same placeholder, so they are addressed by their own hook. */
const depositPanel = (page: Page): Locator => page.getByTestId("deposit-panel");
const withdrawPanel = (page: Page): Locator => page.getByTestId("withdraw-panel");

/**
 * Revoke this wallet's USDC allowance for the vault, through the page's own
 * wallet, so the next deposit has to take the approval path.
 */
async function setAllowanceToZero(page: Page, vault: string) {
	const from = ALICE_ADDRESS;
	// approve(address,uint256) — selector, then the two 32-byte words.
	const data = `0x095ea7b3${vault.replace(/^0x/, "").toLowerCase().padStart(64, "0")}${"0".repeat(64)}`;

	await page.evaluate(
		async ({ from, to, data }) => {
			const eth = (window as unknown as { ethereum: { request: (a: unknown) => Promise<string> } })
				.ethereum;
			await eth.request({ method: "eth_sendTransaction", params: [{ from, to, data }] });
		},
		{ from, to: CONFIG.usdc, data },
	);

	// Wait for it to be mined before anything reads the allowance back. The fork
	// mines on a two-second block time.
	await page.waitForTimeout(5_000);
}

/** The vault's total share supply, as the indexer reports it. */
async function supplyOf(page: Page, vault: string): Promise<bigint> {
	const res = await page.request.get(`${CONFIG.webUrl}/api/vaults/${vault}`);
	if (!res.ok()) return 0n;
	const body = await res.json();
	return BigInt(body.totalSupply ?? 0);
}

/** This wallet's holding in one vault, or undefined. */
async function holdingOf(page: Page, vault: string): Promise<{ shares: string } | undefined> {
	const owner = ALICE_ADDRESS;
	const res = await page.request.get(`${CONFIG.webUrl}/api/vaults/portfolio/${owner}`);
	if (!res.ok()) return undefined;
	const body = await res.json();
	// `holdings[].vault` is the whole vault object, not its address.
	return body.holdings?.find(
		(h: { vault: { address: string } }) => h.vault.address.toLowerCase() === vault.toLowerCase(),
	);
}

/** Shares this wallet has escrowed in the vault's withdrawal queue. */
async function pendingSharesOf(page: Page, vault: string): Promise<bigint> {
	const res = await page.request.get(`${CONFIG.webUrl}/api/vaults/portfolio/${ALICE_ADDRESS}`);
	if (!res.ok()) return 0n;
	const body = await res.json();
	const row = body.pendingWithdrawals?.find(
		(w: { vault: string }) => w.vault.toLowerCase() === vault.toLowerCase(),
	);
	return BigInt(row?.pendingShares ?? 0);
}
