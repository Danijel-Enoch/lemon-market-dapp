import { ponder } from "ponder:registry";
import schema from "ponder:schema";
import { ACTIVITY_KINDS } from "@lemon/contracts";
import { KNOWN_TICKERS } from "@lemon/core";
import { hexToString, zeroAddress } from "viem";

/**
 * Event handlers.
 *
 * Two rules run through all of them.
 *
 * First, live vault state (`totalAssets`, `pricePerShare`, …) is read back from
 * the contract rather than recomputed from event fields. Reimplementing the
 * share maths here would create a second implementation that has to agree with
 * the first forever, and the day they disagree the UI shows a balance the vault
 * will not honour. The contract is the authority; this is a cache of it.
 *
 * Second, nothing is inferred. If an event does not carry a fact, the column
 * stays null rather than being filled with a plausible guess — a null renders as
 * "unknown", and a guess renders as a number people act on.
 *
 * Third, every row carries `context.chain.id`, and every key that names a vault
 * names the chain too. The contracts are registered once across all chains, so
 * one handler body serves all of them and there is no per-chain copy to keep in
 * step — but that also means `event.log.address` alone is ambiguous. Vault
 * addresses are `CREATE`-derived from factories deployed at matching nonces, so
 * the same address on two chains is the likely case rather than the unlikely
 * one, and a key without the chain would have one chain's events overwrite the
 * other's rows. The schema's composite keys are what make that a type error
 * here rather than a silent corruption in production.
 */

let tickerByHash: Map<string, string> | null = null;

/**
 * Recover a ticker from its hash by rainbow table.
 *
 * `marketId` is `keccak256(ticker)` on-chain, so the ticker cannot be read back
 * from it. Hashing is one-way, and the alternative is an extra contract call per
 * vault to read a string the vault does not store either. The universe of
 * tickers is a couple of dozen and known, so precomputing the hashes is exact
 * where it matches — and where it does not, the column stays null and the UI
 * falls back to the vault's own name rather than inventing a symbol.
 *
 * The candidate list is `KNOWN_TICKERS` from `@lemon/core` rather than one kept
 * here. A local copy is the same list in a second place, and this one silently
 * fell five tickers behind the token registry — long enough for a funded SNDK
 * vault to index with a null ticker and be skipped by the venue seeder, which is
 * a null here surfacing three services away as "No venue configuration exists".
 * A miss is invisible by construction, so the list has to come from the same
 * place the rest of the app curates tickers.
 */
async function tickerFor(marketId: string, keccak: (s: string) => string): Promise<string | null> {
	if (!tickerByHash) {
		tickerByHash = new Map();
		for (const ticker of KNOWN_TICKERS) {
			tickerByHash.set(keccak(ticker).toLowerCase(), ticker);
		}
	}
	return tickerByHash.get(marketId.toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

ponder.on("VaultFactory:VaultCreated", async ({ event, context }) => {
	const { keccak256, toBytes } = await import("viem");
	const ticker = await tickerFor(event.args.marketId, (s) => keccak256(toBytes(s)));
	const limits = await readLimits(context, event.args.vault);

	await context.db.insert(schema.vault).values({
		chainId: context.chain.id,
		address: event.args.vault,
		marketId: event.args.marketId,
		ticker,
		name: event.args.name,
		symbol: event.args.symbol,
		agentWallet: event.args.agentWallet,
		riskTier: Number(event.args.tier),
		targetLeverageBps: Number(event.args.targetLeverageBps),
		maxLeverageBps: Number(event.args.maxLeverageBps),
		managementFeeBps: limits?.managementFeeBps ?? null,
		performanceFeeBps: limits?.performanceFeeBps ?? null,
		maxDeployedBps: limits?.maxDeployedBps ?? null,
		createdAt: Number(event.block.timestamp),
		createdBlock: event.block.number,
		updatedAt: Number(event.block.timestamp),
	});
});

/**
 * The three numbers from `limits()` a depositor's expected yield depends on.
 *
 * Read once at creation and again whenever the operator changes them, rather
 * than on every `syncVault`. They move approximately never, and `syncVault`
 * already makes nine calls per event — a tenth for a value that has not changed
 * since the vault was deployed is a permanent cost for a one-off read.
 *
 * `cache: "immutable"` is doing real work here, not just saving a round trip.
 * Ponder otherwise pins every read to the block of the event being handled, and
 * a `VaultCreated` block is thousands of blocks behind the chain head by the
 * time a backfill reaches it — so the call needs archive state. Against a node
 * that has pruned it the read fails with `BlockOutOfRangeError` and Ponder
 * retries it eight times with a backoff, which turns a missing column into a
 * two-minute stall per vault. `"immutable"` reads at `latest` instead, where
 * the state always exists.
 *
 * The trade is that a reindex sees today's limits rather than the ones the
 * vault was created with. That is the more useful answer anyway: these feed a
 * projection of what a depositor will be charged, which is a question about now
 * — and `LimitsUpdated` keeps them current from here on regardless.
 *
 * `limits()` is Solidity's generated getter for a public struct, so it comes
 * back as a flat tuple in declaration order rather than as an object. Indices
 * 0, 1 and 4 are the management fee, the performance fee and the deployment
 * ceiling; the rest are timing and NAV bounds this does not need.
 *
 * Returns null rather than throwing. A failed read must not stop the vault from
 * being indexed at all — the columns stay null and the projection says it
 * cannot be computed, which is true.
 */
async function readLimits(
	context: IndexingContext,
	address: `0x${string}`,
): Promise<{ managementFeeBps: number; performanceFeeBps: number; maxDeployedBps: number } | null> {
	try {
		const raw = (await context.client.readContract({
			abi: context.contracts.LemonVault.abi,
			address,
			functionName: "limits",
			args: [],
			cache: "immutable",
		})) as readonly (number | bigint)[];

		return {
			managementFeeBps: Number(raw[0]),
			performanceFeeBps: Number(raw[1]),
			maxDeployedBps: Number(raw[4]),
		};
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Vault state
// ---------------------------------------------------------------------------

/**
 * Re-read the vault and cache what it says.
 *
 * Six calls where a computation would do, on purpose. `totalAssets` alone
 * depends on the token balance, the reported NAV and the claimable set, and any
 * one of those can move in a transaction this handler is not watching.
 */
/**
 * Ponder's context type is generated per-schema and is not nameable from a
 * helper declared outside an indexing function, so it is taken loosely here.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above.
type IndexingContext = any;

/**
 * A row id for the log-shaped tables, scoped to its chain.
 *
 * A transaction hash is unique on one chain and says nothing across several:
 * nothing stops two chains producing the same 32 bytes, and more practically
 * `<hash>-<logIndex>` carried no chain at all, so a collision would silently
 * drop one of the two rows on insert. The chain id is a prefix rather than a
 * suffix so the ids sort by chain, which is what makes a `like '8453-%'` scan
 * over the table usable when debugging.
 */
// biome-ignore lint/suspicious/noExplicitAny: Ponder's event type is per-source.
function flowId(context: IndexingContext, event: any): string {
	return `${context.chain.id}-${event.transaction.hash}-${event.log.logIndex}`;
}

async function syncVault(context: IndexingContext, address: `0x${string}`, timestamp: bigint) {
	const { client, contracts } = context;
	const abi = contracts.LemonVault.abi;
	const read = (functionName: string, args: unknown[] = []) =>
		client.readContract({ abi, address, functionName, args });

	const [
		totalAssets,
		totalSupply,
		deployedAssets,
		claimableAssets,
		pricePerShare,
		highWaterMarkPps,
		pendingShares,
		leverage,
		lastNavAt,
	] = await Promise.all([
		read("totalAssets"),
		read("totalSupply"),
		read("deployedAssets"),
		read("claimableAssets"),
		read("pricePerShare"),
		read("highWaterMarkPps"),
		read("totalPendingRedeemShares"),
		read("lastObservedLeverageBps"),
		read("lastNavReportAt"),
	]);

	await context.db.update(schema.vault, { chainId: context.chain.id, address }).set({
		totalAssets: totalAssets as bigint,
		totalSupply: totalSupply as bigint,
		deployedAssets: deployedAssets as bigint,
		claimableAssets: claimableAssets as bigint,
		// Idle is derived rather than read: the token balance is a separate call
		// and this identity is guaranteed by `totalAssets` in the contract.
		idleAssets: (totalAssets as bigint) + (claimableAssets as bigint) - (deployedAssets as bigint),
		pricePerShare: pricePerShare as bigint,
		highWaterMarkPps: highWaterMarkPps as bigint,
		totalPendingRedeemShares: pendingShares as bigint,
		lastObservedLeverageBps: Number(leverage),
		lastNavReportAt: Number(lastNavAt),
		updatedAt: Number(timestamp),
	});
}

ponder.on("LemonVault:Deposit", async ({ event, context }) => {
	const vaultAddress = event.log.address;
	const owner = event.args.owner;
	const assets = event.args.assets;
	const shares = event.args.shares;
	const now = Number(event.block.timestamp);

	const existing = await context.db.find(schema.position, {
		chainId: context.chain.id,
		vault: vaultAddress,
		owner,
	});

	await context.db
		.insert(schema.position)
		.values({
			chainId: context.chain.id,
			vault: vaultAddress,
			owner,
			shares,
			netDeposited: assets,
			depositedTotal: assets,
			firstSeenAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate((row) => ({
			shares: row.shares + shares,
			netDeposited: row.netDeposited + assets,
			depositedTotal: row.depositedTotal + assets,
			updatedAt: now,
		}));

	await context.db.insert(schema.flow).values({
		id: flowId(context, event),
		chainId: context.chain.id,
		vault: vaultAddress,
		owner,
		direction: "DEPOSIT",
		assets,
		shares,
		timestamp: now,
		txHash: event.transaction.hash,
	});

	await context.db
		.update(schema.vault, { chainId: context.chain.id, address: vaultAddress })
		.set((row) => ({
			lifetimeDeposited: row.lifetimeDeposited + assets,
			// Counted on first deposit only, so a returning depositor is not a new one.
			depositorCount: existing ? row.depositorCount : row.depositorCount + 1,
		}));

	await syncVault(context, vaultAddress, event.block.timestamp);
});

/**
 * A queued exit.
 *
 * `RedeemQueued` carries the deadlines, so it is the one this listens to rather
 * than the bare ERC-7540 `RedeemRequest` — both fire, and reacting to each would
 * double-count the shares.
 */
ponder.on("LemonVault:RedeemQueued", async ({ event, context }) => {
	const vaultAddress = event.log.address;
	const controller = event.args.controller;
	const now = Number(event.block.timestamp);

	await context.db
		.insert(schema.redeemRequest)
		.values({
			chainId: context.chain.id,
			vault: vaultAddress,
			controller,
			pendingShares: event.args.shares,
			requestedAt: now,
			eligibleAt: Number(event.args.eligibleAt),
			fulfillBy: Number(event.args.fulfillBy),
			updatedAt: now,
		})
		.onConflictDoUpdate((row) => ({
			pendingShares: row.pendingShares + event.args.shares,
			// Deliberately overwritten. A top-up restarts the clock on-chain, and
			// showing the old date would tell the user to expect money on a day
			// the contract will refuse to release it.
			requestedAt: now,
			eligibleAt: Number(event.args.eligibleAt),
			fulfillBy: Number(event.args.fulfillBy),
			updatedAt: now,
		}));

	// Shares have left the holder's balance for escrow.
	await context.db
		.update(schema.position, { chainId: context.chain.id, vault: vaultAddress, owner: controller })
		.set((row) => ({ shares: row.shares - event.args.shares, updatedAt: now }))
		.catch(() => undefined);

	await context.db
		.update(schema.vault, { chainId: context.chain.id, address: vaultAddress })
		.set((row) => ({
			pendingRequestCount: row.pendingRequestCount + 1,
		}));

	await syncVault(context, vaultAddress, event.block.timestamp);
});

ponder.on("LemonVault:RedeemFulfilled", async ({ event, context }) => {
	const vaultAddress = event.log.address;
	const now = Number(event.block.timestamp);

	await context.db
		.update(schema.redeemRequest, {
			chainId: context.chain.id,
			vault: vaultAddress,
			controller: event.args.controller,
		})
		.set((row) => ({
			pendingShares: row.pendingShares - event.args.shares,
			claimableShares: row.claimableShares + event.args.shares,
			claimableAssets: row.claimableAssets + event.args.assets,
			fulfilledAt: now,
			updatedAt: now,
		}));

	await syncVault(context, vaultAddress, event.block.timestamp);
});

ponder.on("LemonVault:RedeemClaimed", async ({ event, context }) => {
	const vaultAddress = event.log.address;
	const now = Number(event.block.timestamp);

	await context.db
		.update(schema.redeemRequest, {
			chainId: context.chain.id,
			vault: vaultAddress,
			controller: event.args.controller,
		})
		.set((row) => ({
			claimableShares: row.claimableShares - event.args.shares,
			claimableAssets: row.claimableAssets - event.args.assets,
			claimedShares: row.claimedShares + event.args.shares,
			claimedAssets: row.claimedAssets + event.args.assets,
			updatedAt: now,
		}));

	await context.db
		.update(schema.position, {
			chainId: context.chain.id,
			vault: vaultAddress,
			owner: event.args.controller,
		})
		.set((row) => ({
			netDeposited:
				row.netDeposited > event.args.assets ? row.netDeposited - event.args.assets : 0n,
			withdrawnTotal: row.withdrawnTotal + event.args.assets,
			updatedAt: now,
		}))
		.catch(() => undefined);

	await context.db.insert(schema.flow).values({
		id: flowId(context, event),
		chainId: context.chain.id,
		vault: vaultAddress,
		owner: event.args.controller,
		direction: "WITHDRAW",
		assets: event.args.assets,
		shares: event.args.shares,
		timestamp: now,
		txHash: event.transaction.hash,
	});

	await context.db
		.update(schema.vault, { chainId: context.chain.id, address: vaultAddress })
		.set((row) => ({
			lifetimeWithdrawn: row.lifetimeWithdrawn + event.args.assets,
		}));

	await syncVault(context, vaultAddress, event.block.timestamp);
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

ponder.on("LemonVault:NavReported", async ({ event, context }) => {
	const vaultAddress = event.log.address;
	const now = Number(event.block.timestamp);

	const current = await context.db.find(schema.vault, {
		chainId: context.chain.id,
		address: vaultAddress,
	});

	await context.db.insert(schema.navPoint).values({
		id: `${context.chain.id}-${vaultAddress}-${event.block.number}-${event.log.logIndex}`,
		chainId: context.chain.id,
		vault: vaultAddress,
		timestamp: now,
		block: event.block.number,
		totalAssets: event.args.totalAssets,
		deployedAssets: event.args.deployedAssets,
		totalSupply: current?.totalSupply ?? 0n,
		pricePerShare: event.args.pricePerShare,
		leverageBps: Number(event.args.leverageBps),
		observedAt: Number(event.args.observedAt),
	});

	await syncVault(context, vaultAddress, event.block.timestamp);
});

ponder.on("LemonVault:AgentWithdrew", async ({ event, context }) => {
	await context.db.insert(schema.agentTransfer).values({
		id: flowId(context, event),
		chainId: context.chain.id,
		vault: event.log.address,
		direction: "WITHDRAW",
		amount: event.args.amount,
		deployedAfter: event.args.deployedAssets,
		timestamp: Number(event.block.timestamp),
		txHash: event.transaction.hash,
		block: event.block.number,
	});
	await syncVault(context, event.log.address, event.block.timestamp);
});

ponder.on("LemonVault:AgentReturned", async ({ event, context }) => {
	await context.db.insert(schema.agentTransfer).values({
		id: flowId(context, event),
		chainId: context.chain.id,
		vault: event.log.address,
		direction: "RETURN",
		amount: event.args.amount,
		deployedAfter: event.args.deployedAssets,
		timestamp: Number(event.block.timestamp),
		txHash: event.transaction.hash,
		block: event.block.number,
	});
	await syncVault(context, event.log.address, event.block.timestamp);
});

/**
 * The public feed.
 *
 * No verification happens here. Checking a Solana signature is an RPC round trip
 * to another chain, and doing it inline would couple Base indexing throughput to
 * a third party's uptime — one slow Solana node would stall the whole indexer.
 * Verdicts are produced by a separate pass and stored outside this database, so
 * a reindex cannot discard them.
 */
/**
 * `FUNDING_SETTLED`'s index in the contract's `ActivityKind`.
 *
 * Derived from the shared list rather than written as `9`, so adding a kind
 * ahead of it in the enum cannot silently start totalling bridge transfers as
 * funding.
 */
const FUNDING_SETTLED = ACTIVITY_KINDS.indexOf("FUNDING_SETTLED");

ponder.on("LemonVault:ActivityReported", async ({ event, context }) => {
	const vaultAddress = event.log.address;

	await context.db.insert(schema.activity).values({
		// The chain leads the id because the API's verification table keys on this
		// exact string, and `<vault>-<sequence>` is not unique once two chains can
		// produce the same vault address — two different actions would share one
		// verdict row, each overwriting the other's.
		id: `${context.chain.id}-${vaultAddress}-${event.args.sequence}`,
		chainId: context.chain.id,
		vault: vaultAddress,
		sequence: event.args.sequence,
		kind: Number(event.args.kind),
		chain: Number(event.args.chain),
		symbol: decodeSymbol(event.args.symbol),
		baseAmount: event.args.baseAmount,
		notionalAssets: event.args.notionalAssets,
		pnlAssets: event.args.pnlAssets,
		feeAssets: event.args.feeAssets,
		txRef: event.args.txRef,
		occurredAt: Number(event.args.occurredAt),
		reportedAt: Number(event.block.timestamp),
		reportTxHash: event.transaction.hash,
		reportBlock: event.block.number,
	});

	// Funding is the one activity whose P&L is the vault's return rather than a
	// side effect of moving capital, so it is totalled on its own. Summing
	// `pnlAssets` across every kind instead would mix it with realised trading
	// P&L from closes and answer a different question — and a rebalance that
	// booked a small loss would read as the strategy earning less funding.
	const funding = Number(event.args.kind) === FUNDING_SETTLED;
	const occurredAt = Number(event.args.occurredAt);

	await context.db
		.update(schema.vault, { chainId: context.chain.id, address: vaultAddress })
		.set((row) => ({
			activityCount: row.activityCount + 1,
			cumulativeNotional: row.cumulativeNotional + event.args.notionalAssets,
			cumulativeVenueFees: row.cumulativeVenueFees + event.args.feeAssets,
			cumulativeFunding: funding
				? row.cumulativeFunding + event.args.pnlAssets
				: row.cumulativeFunding,
			fundingSettlementCount: funding ? row.fundingSettlementCount + 1 : row.fundingSettlementCount,
			// The earliest funding seen, not the first one indexed. Reports arrive in
			// sequence order, but each is stamped with the settlement it came from —
			// and a vault whose agent caught up after an outage reports several at
			// once, oldest last.
			firstFundingAt: funding
				? Math.min(row.firstFundingAt ?? occurredAt, occurredAt)
				: row.firstFundingAt,
		}));
});

/** `bytes32` symbols are right-padded with zeros, which `hexToString` would keep. */
function decodeSymbol(raw: `0x${string}`): string {
	try {
		return hexToString(raw, { size: 32 }).replace(/\0+$/, "");
	} catch {
		return raw;
	}
}

ponder.on("LemonVault:FeesAccrued", async ({ event, context }) => {
	await context.db.insert(schema.feeAccrual).values({
		id: flowId(context, event),
		chainId: context.chain.id,
		vault: event.log.address,
		managementShares: event.args.managementShares,
		performanceShares: event.args.performanceShares,
		highWaterMarkAfter: event.args.newHighWaterMark,
		timestamp: Number(event.block.timestamp),
		txHash: event.transaction.hash,
	});

	await context.db
		.update(schema.vault, { chainId: context.chain.id, address: event.log.address })
		.set((row) => ({
			lifetimeFeeShares:
				row.lifetimeFeeShares + event.args.managementShares + event.args.performanceShares,
		}));
});

// ---------------------------------------------------------------------------
// Share transfers, guardian actions
// ---------------------------------------------------------------------------

/**
 * Shares moving between wallets.
 *
 * Mints, burns, and the escrow leg of a redemption are all skipped — each is
 * already accounted by the handler for the event that caused it, and counting
 * the `Transfer` as well would double it.
 */
ponder.on("LemonVault:Transfer", async ({ event, context }) => {
	const { from, to, value } = event.args;
	const vaultAddress = event.log.address;
	const now = Number(event.block.timestamp);

	if (from === zeroAddress || to === zeroAddress) return;
	if (from === vaultAddress || to === vaultAddress) return;
	if (value === 0n) return;

	await context.db
		.update(schema.position, { chainId: context.chain.id, vault: vaultAddress, owner: from })
		.set((row) => ({ shares: row.shares - value, updatedAt: now }))
		.catch(() => undefined);

	await context.db
		.insert(schema.position)
		.values({
			chainId: context.chain.id,
			vault: vaultAddress,
			owner: to,
			shares: value,
			firstSeenAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate((row) => ({ shares: row.shares + value, updatedAt: now }));
});

ponder.on("LemonVault:Paused", async ({ event, context }) => {
	await context.db
		.update(schema.vault, { chainId: context.chain.id, address: event.log.address })
		.set({ paused: true, updatedAt: Number(event.block.timestamp) });
});

ponder.on("LemonVault:Unpaused", async ({ event, context }) => {
	await context.db
		.update(schema.vault, { chainId: context.chain.id, address: event.log.address })
		.set({ paused: false, updatedAt: Number(event.block.timestamp) });
});

ponder.on("LemonVault:EmergencyExitSet", async ({ event, context }) => {
	await context.db
		.update(schema.vault, { chainId: context.chain.id, address: event.log.address })
		.set({ emergencyExit: event.args.enabled, updatedAt: Number(event.block.timestamp) });
});

/**
 * The operator changed the vault's terms.
 *
 * Taken from the event rather than re-read, because the event is the record: a
 * read at this block would agree, but a read is a second source that can
 * disagree with the log a user is auditing against. The struct arrives whole
 * here, so it is addressed by field rather than by tuple index.
 */
ponder.on("LemonVault:LimitsUpdated", async ({ event, context }) => {
	const limits = event.args.limits;
	await context.db
		.update(schema.vault, { chainId: context.chain.id, address: event.log.address })
		.set({
			managementFeeBps: Number(limits.managementFeeBps),
			performanceFeeBps: Number(limits.performanceFeeBps),
			maxDeployedBps: Number(limits.maxDeployedBps),
			updatedAt: Number(event.block.timestamp),
		});
});
