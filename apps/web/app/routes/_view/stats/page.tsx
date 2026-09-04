import {
	formatPercent,
	formatUsd,
	formatUsdCompact,
	toBigInt,
	useProtocolStats,
	useVaults,
} from "@lemon/client";
import { cn, PageHeader, Skeleton, StatCard } from "@lemon/ui";
import { AlertTriangle } from "lucide-react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Stats — Lemon" },
	{
		name: "description",
		content:
			"Protocol-wide numbers: deposits, capital deployed, fees taken, withdrawal queue health, and every vault's realised return. All derived from chain events.",
	},
];

/**
 * The protocol, in numbers.
 *
 * Everything here comes from the same indexed events the rest of the app reads,
 * and the awkward figures are on the page next to the flattering ones — fees
 * taken, withdrawals overdue, vaults that have stopped reporting. A stats page
 * that shows only TVL and yield is marketing; the point of this one is that
 * someone deciding whether to deposit can see what is going wrong as easily as
 * what is going right.
 */
export default function StatsPage() {
	const { data: stats, isLoading } = useProtocolStats();
	const { data: vaultData } = useVaults();

	if (isLoading || !stats) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-28 w-full rounded-[var(--pon-r-lg,16px)]" />
				<Skeleton className="h-48 w-full rounded-[var(--pon-r-lg,16px)]" />
			</div>
		);
	}

	const vaults = vaultData?.vaults ?? [];
	const netFlow = toBigInt(stats.lifetimeDeposited) - toBigInt(stats.lifetimeWithdrawn ?? "0");
	const deployedPct =
		toBigInt(stats.tvl) === 0n
			? 0
			: (Number(toBigInt(stats.deployed)) / Number(toBigInt(stats.tvl))) * 100;

	// Grouped for the mix breakdown. The API already classifies each vault.
	const byGroup = new Map<string, bigint>();
	for (const v of vaults) {
		byGroup.set(v.assetGroup, (byGroup.get(v.assetGroup) ?? 0n) + toBigInt(v.totalAssets));
	}

	/**
	 * The indexer and the app deploy separately, so this page can be newer than
	 * the payload it is handed. Reading a missing field straight off the object
	 * white-screens the whole page over a number that was simply not sent yet —
	 * so every field the page added is read through a default.
	 */
	const queue = stats.queue ?? { pending: 0, ripe: 0, overdue: 0 };
	const staleVaults = stats.staleVaults ?? 0;
	const pausedVaults = stats.pausedVaults ?? 0;
	const perVault = stats.vaults ?? [];
	const problems = queue.overdue + staleVaults + pausedVaults;

	return (
		<div className="space-y-6 md:space-y-8">
			<PageHeader
				eyebrow="Protocol"
				title="Stats"
				description="Everything the vaults have done, derived from chain events. The uncomfortable numbers are here too — overdue withdrawals, vaults that have stopped reporting, and what the protocol has taken in fees."
			/>

			{/* Anything wrong goes first. Burying it under TVL would be the whole
			    problem with a stats page. */}
			{problems > 0 && (
				<div className="flex gap-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/10 p-4">
					<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--pon-amber)]" />
					<div className="text-sm text-[var(--pon-fg-2)]">
						<p className="font-medium text-[var(--pon-fg-0)]">Not everything is healthy</p>
						<ul className="mt-1 space-y-0.5">
							{queue.overdue > 0 && (
								<li>
									{queue.overdue} withdrawal
									{queue.overdue === 1 ? " is" : "s are"} past the 7-day deadline.
								</li>
							)}
							{staleVaults > 0 && (
								<li>
									{staleVaults} vault{staleVaults === 1 ? " has" : "s have"} not reported a
									valuation recently, so deposits and withdrawals there are on hold.
								</li>
							)}
							{pausedVaults > 0 && (
								<li>
									{pausedVaults} vault{pausedVaults === 1 ? " is" : "s are"} paused by an operator.
								</li>
							)}
						</ul>
					</div>
				</div>
			)}

			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<StatCard label="Total deposits" value={formatUsdCompact(stats.tvl)} />
				<StatCard
					label="Deployed"
					value={formatUsdCompact(stats.deployed)}
					delta={`${deployedPct.toFixed(0)}% of capital at work`}
				/>
				<StatCard label="Vaults" value={String(stats.vaultCount)} />
				<StatCard label="Depositors" value={String(stats.depositors)} />
			</div>

			<section className="grid gap-5 lg:grid-cols-2">
				{/* --- flows --------------------------------------------------- */}
				<Panel title="Flows" hint="Everything users have put in and taken out, ever.">
					<Row label="Deposited" value={formatUsd(stats.lifetimeDeposited)} />
					<Row label="Withdrawn" value={formatUsd(stats.lifetimeWithdrawn ?? "0")} />
					<Row label="Net" value={formatUsd(netFlow)} tone={netFlow >= 0n ? "up" : "down"} />
					<Row
						label="Idle in vaults"
						value={formatUsd(stats.idle)}
						hint="Held back so a ripe withdrawal does not have to wait on an unwind."
					/>
				</Panel>

				{/* --- what it costs -------------------------------------------- */}
				<Panel
					title="What it costs"
					hint="The protocol's take and the venues', both already reflected in every share price."
				>
					<Row
						label="Protocol fees"
						value={formatUsd(stats.feeValueUsd ?? "0")}
						hint="2% a year on assets plus 20% of gains above each vault's high-water mark, held as shares in the insurance fund."
					/>
					<Row
						label="Venue fees"
						value={formatUsd(stats.cumulativeVenueFees ?? "0")}
						hint="Paid to Kyber and Pacifica on the agents' trades."
					/>
					<Row
						label="Notional traded"
						value={formatUsd(stats.cumulativeNotional ?? "0")}
						hint="Total size the agents have put through the venues."
					/>
				</Panel>

				{/* --- the queue ------------------------------------------------ */}
				<Panel
					title="Withdrawal queue"
					hint="Requests take 3 to 7 days while an agent unwinds. Overdue is the number that matters."
				>
					<Row label="Pending" value={String(queue.pending)} />
					<Row
						label="Ready for the agent"
						value={String(queue.ripe)}
						hint="Past the 3-day floor, so the agent may now fulfil them."
					/>
					<Row
						label="Overdue"
						value={String(queue.overdue)}
						tone={queue.overdue > 0 ? "down" : undefined}
					/>
				</Panel>

				{/* --- mix ------------------------------------------------------ */}
				<Panel title="Mix" hint="Where the deposits sit, by what the vault trades.">
					{[...byGroup.entries()]
						.sort((a, b) => (b[1] > a[1] ? 1 : -1))
						.map(([group, total]) => (
							<Row
								key={group}
								label={group === "rwa" ? "RWA" : group[0].toUpperCase() + group.slice(1)}
								value={formatUsd(total)}
							/>
						))}
					<Row
						label="No leverage / leveraged"
						value={`${stats.conservativeCount} / ${stats.leveragedCount}`}
					/>
				</Panel>
			</section>

			{/* --- per vault --------------------------------------------------- */}
			<section className="space-y-3">
				<div>
					<h2 className="font-medium text-[var(--pon-fg-0)]">Every vault</h2>
					<p className="mt-0.5 text-sm text-[var(--pon-fg-3)]">
						Realised over 30 days — the change in each vault's own share price, annualised. A dash
						means too little history to measure, which is not the same as zero.
					</p>
				</div>

				<div className="overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
					<div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-[var(--pon-line)] px-5 py-3 text-[11px] font-medium tracking-wide text-[var(--pon-fg-3)] uppercase md:grid">
						<div>Vault</div>
						<div className="text-right">Share price</div>
						<div className="text-right">30d realised</div>
						<div className="text-right">Deposits</div>
					</div>
					<ul className="divide-y divide-[var(--pon-line)]">
						{perVault.map((v) => (
							<li key={v.address}>
								<Link
									to={`/vaults/${v.address}`}
									className="grid grid-cols-2 gap-3 px-5 py-3.5 hover:bg-[var(--pon-surface)] md:grid-cols-[2fr_1fr_1fr_1fr] md:gap-4"
								>
									<div className="min-w-0">
										<span className="font-medium text-[var(--pon-fg-0)]">
											{v.ticker ?? v.address.slice(0, 10)}
										</span>
										<span className="ml-2 text-xs text-[var(--pon-fg-4)]">
											{v.riskTier === 0 ? "1x" : "levered"}
										</span>
										<p className="mt-0.5 text-xs text-[var(--pon-fg-3)] md:hidden">
											{formatUsdCompact(v.totalAssets)} · {v.depositorCount} depositor
											{v.depositorCount === 1 ? "" : "s"}
										</p>
									</div>
									<div className="hidden text-right tabular-nums text-[var(--pon-fg)] md:block">
										{formatUsd(v.pricePerShare, 4)}
									</div>
									<div className="text-right">
										<span
											className={cn(
												"tabular-nums",
												(v.apy30d?.apy ?? 0) > 0
													? "text-[var(--pon-up)]"
													: (v.apy30d?.apy ?? 0) < 0
														? "text-[var(--pon-down)]"
														: "text-[var(--pon-fg-4)]",
											)}
										>
											{formatPercent(v.apy30d?.apy ?? null, 1)}
										</span>
									</div>
									<div className="hidden text-right tabular-nums text-[var(--pon-fg)] md:block">
										{formatUsdCompact(v.totalAssets)}
									</div>
								</Link>
							</li>
						))}
					</ul>
				</div>
			</section>

			<p className="text-xs leading-relaxed text-[var(--pon-fg-4)]">
				Every figure on this page is derived from events on Base and served from a public indexer.
				Nothing here is a number an operator typed in — you can recompute all of it from the same
				source.
			</p>
		</div>
	);
}

function Panel({
	title,
	hint,
	children,
}: {
	title: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
			<h2 className="font-medium text-[var(--pon-fg-0)]">{title}</h2>
			{hint && <p className="mt-0.5 text-xs text-[var(--pon-fg-3)]">{hint}</p>}
			<dl className="mt-4 space-y-2 text-sm">{children}</dl>
		</div>
	);
}

function Row({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: string;
	hint?: string;
	tone?: "up" | "down";
}) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<dt className={cn("text-[var(--pon-fg-3)]", hint && "cursor-help")} title={hint}>
				{label}
			</dt>
			<dd
				className={cn(
					"text-right font-medium tabular-nums",
					tone === "up"
						? "text-[var(--pon-up)]"
						: tone === "down"
							? "text-[var(--pon-down)]"
							: "text-[var(--pon-fg-0)]",
				)}
			>
				{value}
			</dd>
		</div>
	);
}
