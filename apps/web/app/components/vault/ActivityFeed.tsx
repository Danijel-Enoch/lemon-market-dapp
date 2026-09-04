import type { Activity } from "@lemon/client";
import { formatDateTime, formatRelative, formatUsd, toBigInt } from "@lemon/client";
import { cn } from "@lemon/ui";
import {
	ArrowDownLeft,
	ArrowLeftRight,
	ArrowUpRight,
	BadgeCheck,
	CircleHelp,
	Coins,
	ExternalLink,
	ShieldAlert,
	TrendingDown,
	TrendingUp,
} from "lucide-react";

/**
 * Everything the agent did, on every chain, open to anyone.
 *
 * This is the page that makes the rest of the product checkable. A vault moves
 * user money across Base and Solana and back, and none of those steps are
 * visible from any single explorer — so the feed's job is to lay the whole trail
 * out in one place and hand the reader a link to each leg on the chain it
 * actually happened on.
 *
 * The design follows from one honest admission: these rows are the agent's own
 * account of itself. The contract cannot verify a Pacifica fill from Base. So
 * every row shows its verification state rather than presenting all of them as
 * equally established — checked, contradicted, or not yet looked at.
 */

const KIND_ICONS: Record<string, typeof ArrowUpRight> = {
	SPOT_BUY: TrendingUp,
	SPOT_SELL: TrendingDown,
	PERP_OPEN: ArrowDownLeft,
	PERP_CLOSE: ArrowUpRight,
	PERP_REBALANCE: ArrowLeftRight,
	BRIDGE_OUT: ArrowUpRight,
	BRIDGE_IN: ArrowDownLeft,
	VENUE_DEPOSIT: ArrowDownLeft,
	VENUE_WITHDRAW: ArrowUpRight,
	FUNDING_SETTLED: Coins,
};

const KIND_NAMES = [
	"SPOT_BUY",
	"SPOT_SELL",
	"PERP_OPEN",
	"PERP_CLOSE",
	"PERP_REBALANCE",
	"BRIDGE_OUT",
	"BRIDGE_IN",
	"VENUE_DEPOSIT",
	"VENUE_WITHDRAW",
	"FUNDING_SETTLED",
] as const;

export const ACTIVITY_FILTERS = [
	{ value: "", label: "Everything" },
	{ value: "0", label: "Spot buys" },
	{ value: "1", label: "Spot sells" },
	{ value: "2", label: "Shorts opened" },
	{ value: "3", label: "Shorts closed" },
	{ value: "5", label: "Bridges out" },
	{ value: "6", label: "Bridges in" },
	{ value: "9", label: "Funding" },
];

export const CHAIN_FILTERS = [
	{ value: "", label: "All chains" },
	{ value: "0", label: "Base" },
	{ value: "1", label: "Solana" },
];

export function ActivityFeed({
	activity,
	showVault = false,
	emptyMessage = "The agent has not done anything yet.",
}: {
	activity: Activity[];
	showVault?: boolean;
	emptyMessage?: string;
}) {
	if (activity.length === 0) {
		return (
			<div className="rounded-[var(--pon-r-lg,16px)] border border-dashed border-[var(--pon-line)] px-5 py-10 text-center text-sm text-[var(--pon-fg-3)]">
				{emptyMessage}
			</div>
		);
	}

	return (
		<ul className="divide-y divide-[var(--pon-line)] overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
			{activity.map((row) => (
				<ActivityRow key={row.id} row={row} showVault={showVault} />
			))}
		</ul>
	);
}

function ActivityRow({ row, showVault }: { row: Activity; showVault: boolean }) {
	const kindName = KIND_NAMES[row.kind] ?? "SPOT_BUY";
	const Icon = KIND_ICONS[kindName] ?? ArrowLeftRight;
	const pnl = toBigInt(row.pnlAssets);
	const notional = toBigInt(row.notionalAssets);

	return (
		<li className="px-4 py-3.5 sm:px-5">
			<div className="flex items-start gap-3">
				<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--pon-line-2)] bg-[var(--pon-surface)]">
					<Icon className="size-4 text-[var(--pon-fg-2)]" />
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
						<span className="font-medium text-[var(--pon-fg-0)]">{row.kindLabel}</span>
						<span className="text-sm text-[var(--pon-fg-2)]">{row.symbol}</span>
						<ChainChip label={row.chainLabel} />
						{showVault && (
							<span className="text-xs text-[var(--pon-fg-4)]">{row.vault.slice(0, 8)}…</span>
						)}
					</div>

					<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--pon-fg-2)]">
						{notional > 0n && <span className="tabular-nums">{formatUsd(notional)}</span>}
						{pnl !== 0n && (
							<span
								className={cn(
									"tabular-nums",
									pnl > 0n ? "text-[var(--pon-up)]" : "text-[var(--pon-down)]",
								)}
							>
								{pnl > 0n ? "+" : ""}
								{formatUsd(pnl)}
							</span>
						)}
						{toBigInt(row.feeAssets) > 0n && (
							<span className="text-xs text-[var(--pon-fg-4)] tabular-nums">
								{formatUsd(row.feeAssets)} fee
							</span>
						)}
					</div>

					<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
						<time
							className="text-xs text-[var(--pon-fg-4)]"
							dateTime={new Date(row.occurredAt * 1000).toISOString()}
							title={formatDateTime(row.occurredAt)}
						>
							{formatRelative(row.occurredAt)}
						</time>

						{/*
						 * The lag between the venue and the report is a real
						 * signal — a growing gap means the agent is falling
						 * behind — so it is shown rather than hidden by
						 * displaying only one of the two times.
						 */}
						{row.reportedAt - row.occurredAt > 300 && (
							<span
								className="text-xs text-[var(--pon-fg-4)]"
								title={`Reported on-chain at ${formatDateTime(row.reportedAt)}`}
							>
								reported {Math.round((row.reportedAt - row.occurredAt) / 60)}m later
							</span>
						)}

						<VerificationChip row={row} />

						{row.explorerUrl ? (
							<a
								href={row.explorerUrl}
								target="_blank"
								rel="noreferrer noopener"
								className="inline-flex items-center gap-1 text-xs text-[var(--pon-fg-3)] underline decoration-dotted underline-offset-2 hover:text-[var(--pon-lime)]"
							>
								View on {row.chainLabel}
								<ExternalLink className="size-3" />
							</a>
						) : (
							<span
								className="text-xs text-[var(--pon-fg-4)]"
								title="This venue identifies the fill by an order id rather than a transaction, so there is no explorer page to link to."
							>
								venue order {truncateRef(row.txRef)}
							</span>
						)}
					</div>
				</div>
			</div>
		</li>
	);
}

function ChainChip({ label }: { label: string }) {
	return (
		<span
			className={cn(
				"rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
				label === "Base"
					? "bg-[var(--pon-accent-2)]/15 text-[var(--pon-accent-2)]"
					: "bg-[var(--pon-purple)]/15 text-[var(--pon-purple)]",
			)}
		>
			{label}
		</span>
	);
}

/**
 * Checked, contradicted, or not yet looked at.
 *
 * The middle state is the one worth having. "Not verified" and "verified as
 * wrong" are very different claims, and collapsing them into one grey badge
 * would throw away the only signal that actually catches a lying agent.
 */
function VerificationChip({ row }: { row: Activity }) {
	if (row.verified === true) {
		return (
			<span
				className="inline-flex items-center gap-1 text-xs text-[var(--pon-up)]"
				title={row.verificationNote ?? "Checked against the chain this names."}
			>
				<BadgeCheck className="size-3.5" /> Verified
			</span>
		);
	}

	if (row.verified === false) {
		return (
			<span
				className="inline-flex items-center gap-1 text-xs font-medium text-[var(--pon-down)]"
				title={row.verificationNote ?? "The transaction named here does not support this claim."}
			>
				<ShieldAlert className="size-3.5" /> Does not check out
			</span>
		);
	}

	return (
		<span
			className="inline-flex items-center gap-1 text-xs text-[var(--pon-fg-4)]"
			title="Reported by the agent and not yet checked against the chain it names."
		>
			<CircleHelp className="size-3.5" /> Unverified
		</span>
	);
}

function truncateRef(txRef: string): string {
	const hex = txRef.startsWith("0x") ? txRef.slice(2) : txRef;
	try {
		// Venue order ids are ASCII packed into bytes, so they are readable.
		const bytes = hex.match(/.{2}/g)?.map((b) => Number.parseInt(b, 16)) ?? [];
		const text = new TextDecoder().decode(Uint8Array.from(bytes)).replace(/\0+$/, "");
		if (/^[\x20-\x7e]+$/.test(text)) return text.slice(0, 24);
	} catch {
		// Fall through to the hex form.
	}
	return `${hex.slice(0, 10)}…`;
}
