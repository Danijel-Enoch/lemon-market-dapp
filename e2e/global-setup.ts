import { CONFIG } from "./fixtures";

/**
 * Check the stack is up, and warm it.
 *
 * Both apps are Vite dev servers, so the first request to a route pays for
 * compiling it — comfortably more than a per-assertion timeout on a cold admin
 * console. Without this the first spec to touch each app fails on a cold start
 * and the rest pass, which reads as a flaky suite rather than as a slow one.
 *
 * The reachability check is separate from the warm-up because the two failures
 * need different sentences. A stack that is not running is an operator mistake
 * with a one-line fix; a stack that is running and slow is not a failure at all.
 */
async function reachable(url: string, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
			if (res.ok) return true;
		} catch {
			// Not up yet.
		}
		await new Promise((r) => setTimeout(r, 1_000));
	}
	return false;
}

export default async function globalSetup() {
	const problems: string[] = [];

	if (!(await reachable(`${CONFIG.webUrl}/`, 20_000))) {
		problems.push(`the public app is not answering on ${CONFIG.webUrl}`);
	}
	if (!(await reachable(`${CONFIG.adminUrl}/`, 20_000))) {
		problems.push(`the operator console is not answering on ${CONFIG.adminUrl}`);
	}

	// The suite asserts against indexed data throughout, so an unreachable
	// indexer would fail almost every spec with a message about a missing
	// heading rather than about the indexer.
	const stats = await fetch(`${CONFIG.webUrl}/api/vaults/stats`)
		.then((r) => r.json())
		.catch(() => null);
	if (!stats || typeof stats.vaultCount !== "number") {
		problems.push(
			`the indexer is not serving vault data through ${CONFIG.webUrl}/api/vaults/stats`,
		);
	}

	if (!CONFIG.factory) {
		problems.push("no VAULT_FACTORY_ADDRESS in .env/.env.fork — has fork:up been run?");
	}

	if (problems.length > 0) {
		throw new Error(
			[
				"The e2e stack is not ready:",
				...problems.map((p) => `  - ${p}`),
				"",
				"Bring it up with:",
				"  bun run fork:up",
				"  bun run dev:fork admin        # web :3002, admin :3004, indexer :42069",
			].join("\n"),
		);
	}

	// Warm every route the suite visits, in both apps, so no assertion is the
	// one that pays for compiling a page.
	await Promise.all([
		...["/", "/vaults", "/portfolio", "/activity", "/stats", "/docs"].map((p) =>
			fetch(`${CONFIG.webUrl}${p}`).catch(() => null),
		),
		fetch(`${CONFIG.adminUrl}/`).catch(() => null),
	]);

	console.log(
		`e2e: ${stats.vaultCount} vaults, ${stats.depositors} depositors on ${CONFIG.chainName}`,
	);
}
