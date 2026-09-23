/**
 * Correct one market's hedge now, without waiting for the agent.
 *
 * The agent already knows how to do this. `rebalancePlan` tries the perp leg,
 * falls back to selling spot when Pacifica refuses an order that small, and
 * `venue.rebalance` places whichever one it picked. What the agent cannot do is
 * act on a build it is not running: a vault stranded by a half-executed unwind
 * sits unhedged until the process is redeployed, and "redeploy the agent" is a
 * slow answer to "this position is carrying naked delta right now".
 *
 * So this is the same decision and the same order, placed by hand. It shares
 * the agent's wiring rather than copying it — `resolveVenue` from
 * `apps/agent/src/runtime.ts` builds the identical adapter against the identical
 * market list, so the token this sells is the token the agent would have sold.
 *
 * **What it deliberately does not do.** It does not report NAV, settle the
 * redemption queue, publish funding, or touch the cooldowns. It places one
 * order and prints what happened. Every one of those other things is the
 * agent's job on its own schedule, and doing them from a script is how two
 * writers end up differencing the same watermark.
 *
 * **Reading is free, trading is not.** The default is a dry run: it observes
 * both venues, prints each market's drift and the plan for it, and places
 * nothing. `--commit` places the order — a real swap, spending real funds,
 * irreversible. Read the dry run first.
 *
 * **Sell-only, like the policy it borrows.** An excess of spot is corrected by
 * selling spot. An over-large short would have to *buy* spot, which spends
 * capital that the agent's deployment path sizes and funds properly, so this
 * refuses it and says so rather than half-doing it.
 *
 * **One chain per run.** `AGENT_CHAIN_ID` decides which chain's RPC, USDC and
 * token registry are used, exactly as it does for the agent process. A vault
 * that custodies elsewhere is refused by name rather than half-resolved.
 *
 * Usage:
 *   bun run scripts/rebalance-hedge.ts --vault 0x86fe…37d5              # dry run, every market
 *   bun run scripts/rebalance-hedge.ts --vault 0x86fe…37d5 --market NVDA
 *   bun run scripts/rebalance-hedge.ts --vault 0x86fe…37d5 --market NVDA --commit
 */

import { createLogger, type LogLevel } from "@lemon/core";
import { prisma } from "@lemon/db";
import { NearMpcClient } from "@lemon/near-mpc";
import { createPublicClient, createWalletClient, http, type PublicClient } from "viem";
import { resolveAgentChain } from "../apps/agent/src/chain";
import { driftBps, rebalancePlan } from "../apps/agent/src/policy";
import { type IndexedVault, resolveVenue } from "../apps/agent/src/runtime";
import { createSolanaExecutor } from "../apps/agent/src/solana";
import { VaultClient } from "../apps/agent/src/vault";
import { agentWalletFor } from "../apps/agent/src/wallet";
import type { MarketObservation } from "../apps/agent/src/worker";

const logger = createLogger("rebalance-hedge");
const log = (level: LogLevel, message: string, extra?: unknown) =>
	logger.emit(level, message, extra);

/** The vault's configuration row, in the shape this script reads it. */
interface VaultRow {
	address: string;
	chainId: number;
	ticker: string;
	riskTier: string;
	perpSymbol: string;
	agentPath: string;
	agentEvmAddress: string;
	agentEnabled: boolean;
	spotTokenSymbol: string;
}

/** Units at the 1e18 basis both legs are compared in, as a readable decimal. */
function units(value: bigint): string {
	return (Number(value) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

/**
 * What this script would do about one market, in the agent's own words.
 *
 * `rebalancePlan` is the agent's function, not a reimplementation of it: the
 * side it names here is the side the agent would trade, checked against the
 * same venue floors and the same economic floor. A disagreement between this
 * output and the agent's next tick would mean one of them is reading a stale
 * market, which is worth knowing and is why the drift is printed alongside.
 */
function describe(market: MarketObservation, thresholdBps: number) {
	const drift = driftBps(market.spotUnits, market.perpUnits);
	const plan = rebalancePlan(market);

	const lines = [
		`  ${market.ticker}  spot ${units(market.spotUnits)} ${market.symbol} / short ${units(
			market.perpUnits,
		)} ${market.perpSymbol}`,
		`        ${(drift / 100).toFixed(2)}% off neutral (threshold ${(thresholdBps / 100).toFixed(
			2,
		)}%)`,
	];

	if (!plan.ok) {
		lines.push(`        no correction: ${plan.why}`);
		return { drift, plan, lines };
	}

	lines.push(
		plan.side === "PERP"
			? `        would trade ${plan.correctionUsd} on the PERP leg`
			: `        would SELL ${plan.correctionUsd} of ${market.symbol} spot down to meet the short`,
	);
	return { drift, plan, lines };
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const commit = args.includes("--commit");
	const vaultArg = args.includes("--vault") ? args[args.indexOf("--vault") + 1] : undefined;
	const marketArg = args.includes("--market") ? args[args.indexOf("--market") + 1] : undefined;

	if (!vaultArg) {
		console.error(
			"A vault is required: --vault 0x…\n" +
				"This places orders against one vault's position; there is no 'every vault' mode on purpose.",
		);
		process.exitCode = 1;
		return;
	}

	const wanted = vaultArg.toLowerCase();
	const row = (await prisma.vaultConfig.findFirst({
		where: { address: wanted },
	})) as unknown as VaultRow | null;

	if (!row) {
		console.error(`No vault configured at ${wanted}.`);
		process.exitCode = 1;
		return;
	}

	const nearAccountId = process.env.NEAR_ACCOUNT_ID?.trim();
	const nearPrivateKey = process.env.NEAR_PRIVATE_KEY?.trim();
	if (!nearAccountId || !nearPrivateKey) {
		throw new Error(
			"NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY are required: the agent wallet is MPC-derived and there is no local key to sign with.",
		);
	}
	const feePayerSecret = process.env.SOLANA_FEE_PAYER_SECRET?.trim();
	if (!feePayerSecret) {
		throw new Error(
			"SOLANA_FEE_PAYER_SECRET is required: the agent's Solana wallet holds USDC and no SOL, so it cannot pay its own fees.",
		);
	}

	const mpc = new NearMpcClient({
		accountId: nearAccountId,
		privateKey: nearPrivateKey,
		rpcUrl: process.env.NEAR_RPC_URL?.trim(),
		contractId: process.env.NEAR_MPC_CONTRACT_ID?.trim(),
	});
	await mpc.verifyRootKeys();

	const chain = resolveAgentChain();

	// The chain comes from `AGENT_CHAIN_ID`, not from the vault — the agent runs
	// one process per chain and this borrows its wiring, so the environment
	// decides which RPC, which USDC and which token registry are in play. A vault
	// from the other chain would otherwise fail much later and much less clearly:
	// `resolveVenue` would find no market whose spot token is curated here and
	// report "nothing to trade", which reads as a misconfigured vault rather than
	// a misconfigured shell.
	if (row.chainId !== chain.id) {
		console.error(
			`${row.address} custodies on chain ${row.chainId}, but AGENT_CHAIN_ID resolves to ${chain.name} (${chain.id}).\n` +
				`Re-run with AGENT_CHAIN_ID=${row.chainId}.`,
		);
		process.exitCode = 1;
		return;
	}

	const transport = http(chain.rpcUrls.default.http[0]);
	const publicClient = createPublicClient({ chain, transport });

	// Given the address the vault names, so a path that derives to anything else
	// fails here rather than producing a signature the vault rejects — the same
	// check the agent makes every tick.
	const wallet = agentWalletFor(mpc, row.agentPath, row.agentEvmAddress as `0x${string}`);
	const walletClient = createWalletClient({ account: wallet.account, chain, transport });
	const vault = new VaultClient(publicClient, walletClient, row.address as `0x${string}`);
	const solana = createSolanaExecutor({
		rpcUrl: process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com",
		feePayerSecret,
		mpc,
	});

	// Shaped the way the indexer serves it, because that is what `resolveVenue`
	// takes. Only the fields it actually reads are meaningful here.
	const indexed: IndexedVault = {
		address: row.address as `0x${string}`,
		chainId: row.chainId,
		ticker: row.ticker,
		symbol: row.spotTokenSymbol,
		riskTier: 0,
		paused: false,
		agentWallet: row.agentEvmAddress as `0x${string}`,
		agentPath: row.agentPath,
		agentEnabled: row.agentEnabled,
	};

	const resolved = await resolveVenue({
		indexed,
		vault,
		wallet,
		walletClient,
		publicClient: publicClient as PublicClient,
		solana,
		log,
	});

	if (!resolved) {
		console.error(
			`${row.address} has no venue the agent can trade — no configuration row, or no market with a spot token on ${chain.name}.`,
		);
		process.exitCode = 1;
		return;
	}

	const { venue, rebalanceDriftBps } = resolved;

	console.log(
		commit
			? `Correcting ${row.address} on ${chain.name}. This places real orders.`
			: `Dry run over ${row.address} on ${chain.name}. Nothing is placed; pass --commit to trade.`,
	);

	const observation = await venue.observe();
	const markets = marketArg
		? observation.markets.filter((m) => m.ticker.toUpperCase() === marketArg.toUpperCase())
		: observation.markets;

	if (markets.length === 0) {
		console.error(
			marketArg
				? `${row.address} has no market called ${marketArg}. It trades: ${observation.markets
						.map((m) => m.ticker)
						.join(", ")}.`
				: `${row.address} has no markets to correct.`,
		);
		process.exitCode = 1;
		return;
	}

	let placed = 0;
	for (const market of markets) {
		const { plan, lines } = describe(market, rebalanceDriftBps);
		console.log(lines.join("\n"));

		if (!plan.ok) continue;
		if (!commit) {
			console.log("        dry run — nothing placed");
			continue;
		}

		// The leg being moved is the one given a target, so the target is always
		// the leg staying put: a perp correction is sized against the holding, a
		// spot correction against the short. Same rule as the worker's.
		const targetUnits = plan.side === "PERP" ? market.spotUnits : market.perpUnits;
		try {
			const activity = await venue.rebalance({
				market: market.ticker,
				targetUnits,
				side: plan.side,
			});
			placed += 1;
			console.log(
				`        placed on the ${plan.side} leg — ${activity.length} activity row(s) produced`,
			);
			// Printed rather than published. `reportActivity` is the agent's write
			// and it batches these onto the vault's feed on its next tick; a second
			// writer racing it here is how a feed ends up with duplicates.
			for (const entry of activity) {
				console.log(`          ${entry.kind} ${entry.txRef ?? ""}`.trimEnd());
			}
		} catch (error) {
			console.error(`        FAILED: ${error instanceof Error ? error.message : String(error)}`);
			process.exitCode = 1;
		}
	}

	console.log(
		commit
			? `\n${placed} correction(s) placed. The agent reports the activity on its next tick.`
			: "\nNothing was placed. Re-run with --commit to trade the plan above.",
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
