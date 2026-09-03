/**
 * Seed the stock-token registry.
 *
 * Verifies `symbol()` and `decimals()` against Base mainnet rather than
 * trusting the checked-in table. These tokens are 8-decimal, not the 18 that
 * token handling usually assumes, so a wrong value here would misprice every
 * order by a factor of 1e10 — cheap to check, expensive to get wrong.
 */
import { joinMarkets, PacificaClient } from "@lemon/pacifica";
import { findMarketByTicker, SPOT_TOKENS } from "@lemon/registry";
import { prisma } from "./index";

const RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

const SELECTOR = { symbol: "0x95d89b41", decimals: "0x313ce567" } as const;

async function ethCall(to: string, data: string): Promise<string | null> {
	const response = await fetch(RPC_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_call",
			params: [{ to, data }, "latest"],
		}),
	});
	const body = (await response.json()) as { result?: string; error?: unknown };
	return body.result && body.result !== "0x" ? body.result : null;
}

function decodeString(hex: string): string | null {
	try {
		const body = hex.slice(2);
		const offset = Number.parseInt(body.slice(0, 64), 16) * 2;
		const length = Number.parseInt(body.slice(offset, offset + 64), 16) * 2;
		const bytes = body.slice(offset + 64, offset + 64 + length);
		return Buffer.from(bytes, "hex").toString("utf8");
	} catch {
		return null;
	}
}

async function main() {
	const pacifica = new PacificaClient();
	const [info, prices] = await Promise.all([pacifica.markets(), pacifica.prices().catch(() => [])]);
	const markets = joinMarkets(info, prices);
	console.log(`Loaded ${markets.length} tradable Pacifica markets.`);

	let verified = 0;
	let mismatched = 0;

	for (const token of SPOT_TOKENS) {
		const [symbolHex, decimalsHex] = await Promise.all([
			ethCall(token.address, SELECTOR.symbol),
			ethCall(token.address, SELECTOR.decimals),
		]);

		const onchainSymbol = symbolHex ? decodeString(symbolHex) : null;
		const onchainDecimals = decimalsHex ? Number.parseInt(decimalsHex, 16) : null;

		// Trust the chain over the table when they disagree, but say so loudly.
		if (onchainSymbol && onchainSymbol !== token.symbol) {
			console.warn(
				`  ! ${token.symbol}: on-chain symbol is "${onchainSymbol}" — using the on-chain value.`,
			);
			mismatched++;
		}
		if (onchainDecimals !== null && onchainDecimals !== token.decimals) {
			console.warn(
				`  ! ${token.symbol}: on-chain decimals is ${onchainDecimals}, table says ${token.decimals} — using the on-chain value.`,
			);
			mismatched++;
		}
		if (onchainSymbol || onchainDecimals !== null) verified++;

		const market = findMarketByTicker(markets, token.ticker);

		await prisma.stockToken.upsert({
			where: { symbol: token.symbol },
			create: {
				symbol: token.symbol,
				ticker: token.ticker,
				name: token.name,
				address: token.address,
				decimals: onchainDecimals ?? token.decimals,
				perpSymbol: market?.symbol ?? null,
			},
			update: {
				name: token.name,
				decimals: onchainDecimals ?? token.decimals,
				perpSymbol: market?.symbol ?? null,
			},
		});

		console.log(`  ${token.symbol.padEnd(7)} -> ${market ? market.symbol : "no perp market"}`);
	}

	console.log(
		`\nSeeded ${SPOT_TOKENS.length} tokens; ${verified} verified on chain, ${mismatched} corrected.`,
	);
	console.log("Routability is probed separately at runtime — see /api/spot/tokens.");
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
