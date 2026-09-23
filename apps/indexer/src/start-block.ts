/**
 * Where each chain's backfill begins, and why getting it wrong is silent.
 *
 * A factory source with no start block is not a slow indexer — it is an indexer
 * that never arrives. Ponder begins at block 0 and walks forward in `eth_getLogs`
 * ranges looking for a contract that will not exist for tens of millions of
 * blocks, so every request is answered correctly, finds nothing, and costs a
 * request against whatever endpoint is configured. On a free endpoint the
 * visible result is the one this module exists to prevent:
 *
 *   INFO  Started backfill indexing chain=base block_range=[0,51694394]
 *   INFO  Updated backfill indexing progress progress=0.0%
 *   INFO  Updated backfill indexing progress progress=0.0%
 *
 * repeated until someone reads far enough up the log to notice the `0` in the
 * first line. Nothing errors, nothing retries in a way that looks wrong, and the
 * app simply serves no vaults. A chain that *is* configured correctly finishes
 * the same backfill in seconds, which is what makes the broken one so hard to
 * spot beside it.
 *
 * So this is checked at startup and refused, rather than warned about. A warning
 * is one more line in a log that is already producing one every five seconds.
 */

/**
 * The variables this reads, passed in rather than read, so it can be tested.
 *
 * The index signature is what lets `process.env` be handed over as-is instead of
 * cast — every name below is optional, and TypeScript rejects a whole
 * `ProcessEnv` against a type of nothing but optional properties.
 */
export interface StartBlockEnv {
	VAULT_FACTORY_START_BLOCK?: string;
	VAULT_FACTORY_ALLOW_GENESIS_SCAN?: string;
	[name: string]: string | undefined;
}

/**
 * The deliberate escape hatch.
 *
 * Block 0 is a correct answer on a local chain, where the factory is deployed a
 * few blocks in and the whole history is minutes old. Refusing that outright
 * would break `anvil` for the sake of a mainnet mistake, so the check is
 * overridable — by a variable whose name cannot be set for any other reason.
 */
export const GENESIS_SCAN_OVERRIDE = "VAULT_FACTORY_ALLOW_GENESIS_SCAN";

/**
 * Empty is absent.
 *
 * Compose writes `VAULT_FACTORY_START_BLOCK_BASE: ${VAULT_FACTORY_START_BLOCK_BASE:-}`
 * for an unset variable, and an empty string is not nullish — so a `??` chain
 * reads it as a deliberate choice, skips the fallback, and hands `Number("")`
 * — zero — to Ponder. Trimming first is what makes "unset" mean the same thing
 * however the variable reached the process.
 */
function trimmed(value: string | undefined): string | undefined {
	const text = value?.trim();
	return text ? text : undefined;
}

/**
 * One chain's start block, or a refusal naming the variable that is wrong.
 *
 * `VAULT_FACTORY_START_BLOCK` without a suffix still means Base, so an `.env`
 * from before the per-chain split keeps working unchanged — and is consulted
 * only when the suffixed name is genuinely absent rather than merely empty.
 *
 * A value that is not a block number is rejected here rather than passed on.
 * `Number("mainnet")` is `NaN`, and a `NaN` start block reaches Ponder as a
 * range whose comparisons are all false — which is a stranger failure than the
 * typo deserves, and one that names neither the variable nor the chain.
 */
export function resolveStartBlock(envSuffix: string, env: StartBlockEnv): number {
	const suffixed = `VAULT_FACTORY_START_BLOCK_${envSuffix}`;
	const candidates: [string, string | undefined][] = [[suffixed, env[suffixed]]];
	if (envSuffix === "BASE") {
		candidates.push(["VAULT_FACTORY_START_BLOCK", env.VAULT_FACTORY_START_BLOCK]);
	}

	for (const [name, value] of candidates) {
		const raw = trimmed(value);
		if (raw === undefined) continue;

		const startBlock = Number(raw);
		if (!Number.isInteger(startBlock) || startBlock < 0) {
			throw new Error(
				`${name} is "${raw}", which is not a block number. Set it to the block the factory was deployed in, or leave it unset.`,
			);
		}
		return startBlock;
	}

	return 0;
}

/** Just enough of a source to say which chain is misconfigured and how to fix it. */
export interface StartBlockSource {
	/** The chain's key, as it appears in Ponder's logs. */
	name: string;
	envSuffix: string;
	startBlock: number;
}

/**
 * Refuse to start a backfill from genesis on a chain that has a factory.
 *
 * Only sources that reached this point are checked, which is the whole
 * distinction: a chain with no factory address configured is never built into a
 * source, and the zero-address placeholder the config falls back to when
 * *nothing* is configured is not one either. Both of those are block 0 and
 * neither is a mistake. A configured factory with no start block always is.
 */
export function assertStartBlocks(sources: readonly StartBlockSource[], env: StartBlockEnv): void {
	const override = trimmed(env[GENESIS_SCAN_OVERRIDE])?.toLowerCase();
	if (override === "true" || override === "1") return;

	const fromGenesis = sources.filter(({ startBlock }) => startBlock === 0);
	if (fromGenesis.length === 0) return;

	throw new Error(
		[
			`Refusing to index from genesis: ${fromGenesis.map(({ name }) => name).join(", ")}.`,
			"",
			"A factory address is configured for each of those chains but its start block is not,",
			"so the backfill would begin at block 0 — millions of blocks before the factory existed.",
			"That is hours of eth_getLogs finding nothing, and it reads as an indexer stuck at 0.0%",
			"rather than as a missing variable.",
			"",
			"Set each one to the block its factory was deployed in:",
			...fromGenesis.map(({ envSuffix }) => `  VAULT_FACTORY_START_BLOCK_${envSuffix}=<block>`),
			"",
			`To index from genesis deliberately — a local chain, say — set ${GENESIS_SCAN_OVERRIDE}=true.`,
		].join("\n"),
	);
}
