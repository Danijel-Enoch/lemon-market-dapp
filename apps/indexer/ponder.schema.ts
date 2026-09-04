import { index, onchainTable, primaryKey, relations } from "ponder";

/**
 * The read model.
 *
 * Everything here is derived from events, so it is disposable — drop the
 * database and a resync rebuilds it exactly. That is the point: nothing the app
 * shows about a vault is a number the operator typed in somewhere, which is what
 * makes "you can check this yourself" true rather than a slogan.
 *
 * Amounts are USDC (6dp) unless the field says shares (18dp). Both are stored as
 * `bigint` and formatted at the edge; a float here would round someone's balance.
 */

export const vault = onchainTable(
	"vault",
	(t) => ({
		address: t.hex().primaryKey(),
		marketId: t.hex().notNull(),
		/** The plain ticker, decoded from `marketId` where we can match it. */
		ticker: t.text(),
		name: t.text().notNull(),
		symbol: t.text().notNull(),
		agentWallet: t.hex().notNull(),

		/** 0 = CONSERVATIVE, 1 = LEVERAGED. See `@lemon/contracts`. */
		riskTier: t.integer().notNull(),
		targetLeverageBps: t.integer().notNull(),
		maxLeverageBps: t.integer().notNull(),

		// --- live state, updated on every event that moves it ---------------
		totalAssets: t.bigint().notNull().default(0n),
		totalSupply: t.bigint().notNull().default(0n),
		idleAssets: t.bigint().notNull().default(0n),
		deployedAssets: t.bigint().notNull().default(0n),
		claimableAssets: t.bigint().notNull().default(0n),
		/** Assets per whole share, in USDC units. 1_000_000 = $1.00. */
		pricePerShare: t.bigint().notNull().default(1_000_000n),
		highWaterMarkPps: t.bigint().notNull().default(1_000_000n),
		lastObservedLeverageBps: t.integer().notNull().default(10_000),
		lastNavReportAt: t.integer(),

		totalPendingRedeemShares: t.bigint().notNull().default(0n),
		/** Requests queued and not yet fulfilled. The number the agent owes work on. */
		pendingRequestCount: t.integer().notNull().default(0),

		/** Lifetime flows, so a vault's history survives everyone withdrawing. */
		lifetimeDeposited: t.bigint().notNull().default(0n),
		lifetimeWithdrawn: t.bigint().notNull().default(0n),
		lifetimeFeeShares: t.bigint().notNull().default(0n),
		cumulativeNotional: t.bigint().notNull().default(0n),
		cumulativeVenueFees: t.bigint().notNull().default(0n),
		activityCount: t.integer().notNull().default(0),
		depositorCount: t.integer().notNull().default(0),

		paused: t.boolean().notNull().default(false),
		emergencyExit: t.boolean().notNull().default(false),

		createdAt: t.integer().notNull(),
		createdBlock: t.bigint().notNull(),
		updatedAt: t.integer().notNull(),
	}),
	(table) => ({
		marketIdx: index().on(table.marketId),
		agentIdx: index().on(table.agentWallet),
	}),
);

/**
 * A holder's position in one vault.
 *
 * `shares` deliberately excludes anything escrowed in the redemption queue —
 * those have left the balance and are tracked on the request. Adding them back
 * here would show a user shares they have already committed to selling.
 */
export const position = onchainTable(
	"position",
	(t) => ({
		vault: t.hex().notNull(),
		owner: t.hex().notNull(),
		shares: t.bigint().notNull().default(0n),
		/** USDC actually paid in, less what has been taken out. The cost basis. */
		netDeposited: t.bigint().notNull().default(0n),
		depositedTotal: t.bigint().notNull().default(0n),
		withdrawnTotal: t.bigint().notNull().default(0n),
		firstSeenAt: t.integer().notNull(),
		updatedAt: t.integer().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.vault, table.owner] }),
		ownerIdx: index().on(table.owner),
	}),
);

/**
 * One user's place in the withdrawal queue.
 *
 * Requests merge under a single ERC-7540 id, so there is one row per
 * (vault, controller) rather than one per call — which matches the contract, and
 * matches what the UI has to show: a single "you asked to withdraw X, expect it
 * by Y" rather than a list of partial requests the user never thinks of separately.
 */
export const redeemRequest = onchainTable(
	"redeem_request",
	(t) => ({
		vault: t.hex().notNull(),
		controller: t.hex().notNull(),

		pendingShares: t.bigint().notNull().default(0n),
		claimableShares: t.bigint().notNull().default(0n),
		claimableAssets: t.bigint().notNull().default(0n),
		claimedShares: t.bigint().notNull().default(0n),
		claimedAssets: t.bigint().notNull().default(0n),

		requestedAt: t.integer().notNull(),
		/** Earliest the agent may fulfil. Enforced on-chain. */
		eligibleAt: t.integer().notNull(),
		/** The agent's SLA. Not enforced on-chain, which is why it is monitored here. */
		fulfillBy: t.integer().notNull(),
		fulfilledAt: t.integer(),
		updatedAt: t.integer().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.vault, table.controller] }),
		controllerIdx: index().on(table.controller),
		/** The agent's work queue: what is ripe, oldest first. */
		dueIdx: index().on(table.eligibleAt),
	}),
);

/**
 * The public activity feed — every action the agent took, on any chain.
 *
 * Verification of these rows against the chains they name lives in the API's own
 * database rather than here, and the reason is that this one is disposable: a
 * resync drops and rebuilds every table from events. Verdicts are not derivable
 * from Base events — they are the result of round trips to Solana and to
 * explorers — so storing them here would mean silently discarding the entire
 * audit history on any reindex. See `apps/api/src/services/activity-verify.ts`.
 */
export const activity = onchainTable(
	"activity",
	(t) => ({
		id: t.text().primaryKey(),
		vault: t.hex().notNull(),
		sequence: t.bigint().notNull(),

		/** Index into `ACTIVITY_KINDS` in `@lemon/contracts`. */
		kind: t.integer().notNull(),
		/** Index into `CHAINS`: 0 Base, 1 Solana, 2 NEAR. */
		chain: t.integer().notNull(),
		symbol: t.text().notNull(),

		baseAmount: t.bigint().notNull(),
		notionalAssets: t.bigint().notNull(),
		pnlAssets: t.bigint().notNull(),
		feeAssets: t.bigint().notNull(),

		/** The venue transaction, hex-encoded. 32 bytes on an EVM chain, 64 on Solana. */
		txRef: t.hex().notNull(),
		/** When it happened at the venue. */
		occurredAt: t.integer().notNull(),
		/** When it was reported on Base. The gap is the reporting lag. */
		reportedAt: t.integer().notNull(),
		reportTxHash: t.hex().notNull(),
		reportBlock: t.bigint().notNull(),
	}),
	(table) => ({
		vaultIdx: index().on(table.vault, table.occurredAt),
		kindIdx: index().on(table.kind),
	}),
);

/**
 * The share-price series.
 *
 * A point per NAV report, which is what every yield figure in the app is
 * computed from. Storing the series rather than a running APY means the number
 * shown over any window is derived from the same prices a user can re-derive —
 * and a bad report can be seen as a spike instead of being smeared into an
 * average nobody can decompose.
 */
export const navPoint = onchainTable(
	"nav_point",
	(t) => ({
		id: t.text().primaryKey(),
		vault: t.hex().notNull(),
		timestamp: t.integer().notNull(),
		block: t.bigint().notNull(),
		totalAssets: t.bigint().notNull(),
		deployedAssets: t.bigint().notNull(),
		totalSupply: t.bigint().notNull(),
		pricePerShare: t.bigint().notNull(),
		leverageBps: t.integer().notNull(),
		/** When the agent read the venues, which precedes the report. */
		observedAt: t.integer().notNull(),
	}),
	(table) => ({
		seriesIdx: index().on(table.vault, table.timestamp),
	}),
);

/** Capital crossing the vault boundary, in either direction. */
export const agentTransfer = onchainTable(
	"agent_transfer",
	(t) => ({
		id: t.text().primaryKey(),
		vault: t.hex().notNull(),
		/** "WITHDRAW" (vault to agent) or "RETURN" (agent to vault). */
		direction: t.text().notNull(),
		amount: t.bigint().notNull(),
		deployedAfter: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
		txHash: t.hex().notNull(),
		block: t.bigint().notNull(),
	}),
	(table) => ({
		vaultIdx: index().on(table.vault, table.timestamp),
	}),
);

/** Fee accruals, so the operator's take is auditable rather than inferred from dilution. */
export const feeAccrual = onchainTable(
	"fee_accrual",
	(t) => ({
		id: t.text().primaryKey(),
		vault: t.hex().notNull(),
		managementShares: t.bigint().notNull(),
		performanceShares: t.bigint().notNull(),
		highWaterMarkAfter: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
		txHash: t.hex().notNull(),
	}),
	(table) => ({
		vaultIdx: index().on(table.vault, table.timestamp),
	}),
);

/** Deposits and claims, for a user's own history. */
export const flow = onchainTable(
	"flow",
	(t) => ({
		id: t.text().primaryKey(),
		vault: t.hex().notNull(),
		owner: t.hex().notNull(),
		/** "DEPOSIT" or "WITHDRAW". */
		direction: t.text().notNull(),
		assets: t.bigint().notNull(),
		shares: t.bigint().notNull(),
		timestamp: t.integer().notNull(),
		txHash: t.hex().notNull(),
	}),
	(table) => ({
		ownerIdx: index().on(table.owner, table.timestamp),
		vaultIdx: index().on(table.vault, table.timestamp),
	}),
);

export const vaultRelations = relations(vault, ({ many }) => ({
	positions: many(position),
	requests: many(redeemRequest),
	activities: many(activity),
	navPoints: many(navPoint),
}));

export const positionRelations = relations(position, ({ one }) => ({
	vault: one(vault, { fields: [position.vault], references: [vault.address] }),
}));

export const redeemRequestRelations = relations(redeemRequest, ({ one }) => ({
	vault: one(vault, { fields: [redeemRequest.vault], references: [vault.address] }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
	vault: one(vault, { fields: [activity.vault], references: [vault.address] }),
}));

export const navPointRelations = relations(navPoint, ({ one }) => ({
	vault: one(vault, { fields: [navPoint.vault], references: [vault.address] }),
}));
