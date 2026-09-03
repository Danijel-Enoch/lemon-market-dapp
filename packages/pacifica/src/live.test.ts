import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import { PacificaClient } from "./client";
import {
	associatedTokenAddress,
	PACIFICA_CENTRAL_STATE,
	PACIFICA_PROGRAM_ID,
	PACIFICA_VAULT,
	USDC_MINT,
} from "./deposit";

/**
 * Read-only smoke tests against the real Pacifica API.
 *
 * These assert the shapes the rest of the app relies on, so a breaking change
 * upstream fails here rather than in the UI. They are opt-in because they need
 * network: run with PACIFICA_LIVE=1.
 */
const live = process.env.PACIFICA_LIVE === "1";
const suite = live ? describe : describe.skip;

suite("pacifica live API", () => {
	const client = new PacificaClient({ timeoutMs: 25_000 });

	test("markets carry the fields the terminal needs", async () => {
		const markets = await client.markets();
		expect(markets.length).toBeGreaterThan(0);

		const sol = markets.find((market) => market.symbol === "SOL");
		expect(sol).toBeDefined();
		expect(typeof sol?.max_leverage).toBe("number");
		expect(Number(sol?.lot_size)).toBeGreaterThan(0);
		expect(Number(sol?.tick_size)).toBeGreaterThan(0);
		expect(Number(sol?.min_order_size)).toBeGreaterThan(0);
	}, 30_000);

	test("prices expose mark, funding and the 24h reference", async () => {
		const prices = await client.prices();
		expect(prices.length).toBeGreaterThan(0);

		const row = prices[0];
		expect(Number(row.mark)).toBeGreaterThan(0);
		expect(Number.isFinite(Number(row.funding))).toBe(true);
		expect(Number.isFinite(Number(row.volume_24h))).toBe(true);
		// yesterday_price is what makes a real 24h change column possible.
		expect(Number(row.yesterday_price)).toBeGreaterThan(0);
	}, 30_000);

	test("every priced symbol is a listed market", async () => {
		const [markets, prices] = await Promise.all([client.markets(), client.prices()]);
		const listed = new Set(markets.map((market) => market.symbol));
		const orphans = prices.filter((price) => !listed.has(price.symbol)).map((p) => p.symbol);
		expect(orphans).toEqual([]);
	}, 40_000);

	test("orderbook returns bids below asks", async () => {
		const book = await client.orderbook("SOL");
		const [bids, asks] = book.l;
		expect(bids.length).toBeGreaterThan(0);
		expect(asks.length).toBeGreaterThan(0);
		expect(Number(bids[0].p)).toBeLessThan(Number(asks[0].p));
	}, 30_000);

	test("bridge info names a custody program per asset", async () => {
		const assets = await client.bridgeInfo();
		expect(assets.length).toBeGreaterThan(0);
		for (const asset of assets) {
			expect(asset.bridge_program.length).toBeGreaterThan(30);
			expect(asset.decimals).toBeGreaterThan(0);
		}
	}, 30_000);

	test("an unknown account is reported, not silently empty", async () => {
		// A well-formed but unused address: the API should answer cleanly either
		// way, and must not hang or return a malformed envelope.
		const address = "11111111111111111111111111111111";
		try {
			const info = await client.accountInfo(address);
			expect(info).toBeDefined();
		} catch (error) {
			expect((error as Error).name).toBe("PacificaError");
		}
	}, 30_000);
});

/**
 * On-chain checks for the deposit path.
 *
 * The program, state and vault addresses are hard-coded constants copied from
 * Pacifica's SDK, and a wrong one means a deposit that either fails or lands
 * somewhere unrecoverable. These confirm them against mainnet.
 */
suite("pacifica solana custody program", () => {
	const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";

	async function accountInfo(address: string) {
		const response = await fetch(rpcUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "getAccountInfo",
				params: [address, { encoding: "jsonParsed" }],
			}),
		});
		const body = (await response.json()) as {
			result?: {
				value?: {
					executable?: boolean;
					owner?: string;
					data?: { parsed?: { info?: { mint?: string; owner?: string } } };
				} | null;
			};
		};
		return body.result?.value;
	}

	test("the custody program is deployed and executable", async () => {
		const account = await accountInfo(PACIFICA_PROGRAM_ID.toBase58());
		expect(account?.executable).toBe(true);
	}, 30_000);

	test("central state is owned by the custody program", async () => {
		const account = await accountInfo(PACIFICA_CENTRAL_STATE.toBase58());
		expect(account?.owner).toBe(PACIFICA_PROGRAM_ID.toBase58());
	}, 30_000);

	/**
	 * The vault is the central state's USDC associated token account, so
	 * deriving it independently proves the ATA seeds this package uses are the
	 * canonical ones — the same derivation the depositor's account relies on.
	 */
	test("the vault is the ATA this package derives for the state authority", async () => {
		const account = await accountInfo(PACIFICA_VAULT.toBase58());
		expect(account?.data?.parsed?.info?.mint).toBe(USDC_MINT.toBase58());

		const authority = account?.data?.parsed?.info?.owner as string;
		expect(authority).toBe(PACIFICA_CENTRAL_STATE.toBase58());
		expect(associatedTokenAddress(new PublicKey(authority), USDC_MINT).toBase58()).toBe(
			PACIFICA_VAULT.toBase58(),
		);
	}, 30_000);
});
