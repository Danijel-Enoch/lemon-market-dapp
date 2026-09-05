import { VaultTable } from "@app/components/vault/VaultTable";
import { formatUsdCompact, useProtocolStats, useVaults } from "@lemon/client";
import { ChipGroup, EmptyState, PageHeader, Skeleton, StatCard } from "@lemon/ui";
import { Vault as VaultIcon } from "lucide-react";
import { useState } from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Vaults — Lemon" },
	{
		name: "description",
		content:
			"Deposit USDC. Each vault owns a real asset on Base and hedges it one-for-one, so you earn what the market pays to hold it rather than a bet on the price. You hold a share token and can watch every trade the agent makes.",
	},
	{ property: "og:title", content: "Lemon — earn from stocks and crypto, no side taken" },
];

type TierFilter = "all" | "CONSERVATIVE" | "LEVERAGED";
type GroupFilter = "all" | "crypto" | "stocks" | "rwa" | "fx";

const TIER_FILTERS: { value: TierFilter; label: string }[] = [
	{ value: "all", label: "Any risk" },
	{ value: "CONSERVATIVE", label: "No leverage" },
	{ value: "LEVERAGED", label: "Leveraged" },
];

/**
 * The four things a vault can be about.
 *
 * Coarser than the underlying asset-class taxonomy on purpose — metals,
 * commodities and tokenized treasuries all sit under RWA, because splitting
 * them across three tabs would leave most of them empty most of the time.
 */
const GROUP_FILTERS: { value: GroupFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "crypto", label: "Crypto" },
	{ value: "stocks", label: "Stocks" },
	{ value: "rwa", label: "RWA" },
	{ value: "fx", label: "FX" },
];

export default function VaultBoardPage() {
	const [tier, setTier] = useState<TierFilter>("all");
	const [group, setGroup] = useState<GroupFilter>("all");
	const { data, isLoading, isError, error } = useVaults();
	const { data: stats } = useProtocolStats();

	const all = data?.vaults ?? [];
	const vaults = all.filter(
		(v) => (tier === "all" || v.tier === tier) && (group === "all" || v.assetGroup === group),
	);

	// Counts sit on the tabs so an empty one is visibly empty rather than
	// looking like a filter that failed.
	const countFor = (value: GroupFilter) =>
		value === "all" ? all.length : all.filter((v) => v.assetGroup === value).length;

	return (
		<div className="space-y-6 md:space-y-8">
			<PageHeader
				eyebrow="Fully hedged"
				title="Vaults"
				description="Deposit USDC and hold a share token. Each vault owns one asset on Base and hedges the same size against it, so what you earn is what that market pays to be held — not a call on where it goes. An agent runs it and publishes every trade below. Withdrawals take 3 to 7 days, because a real position has to be unwound to pay you."
			/>

			<div data-tour="board-headline" className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<StatCard label="Total deposits" value={formatUsdCompact(stats?.tvl ?? "0")} />
				<StatCard label="Deployed" value={formatUsdCompact(stats?.deployed ?? "0")} />
				<StatCard label="Vaults" value={String(stats?.vaultCount ?? 0)} />
				<StatCard label="Depositors" value={String(stats?.depositors ?? 0)} />
			</div>

			<div className="space-y-4">
				<div data-tour="board-filters" className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<ChipGroup
						options={GROUP_FILTERS.map((f) => ({
							value: f.value,
							label: `${f.label} ${countFor(f.value)}`,
						}))}
						value={group}
						onChange={(value) => setGroup(value as GroupFilter)}
						aria-label="Filter by asset type"
					/>
					<span className="hidden h-4 w-px bg-[var(--pon-line-2)] sm:block" />
					<ChipGroup
						options={TIER_FILTERS}
						value={tier}
						onChange={(value) => setTier(value as TierFilter)}
						aria-label="Filter by risk"
					/>
				</div>

				{isLoading ? (
					<div className="space-y-2">
						{[0, 1, 2].map((i) => (
							<Skeleton key={i} className="h-20 w-full rounded-[var(--pon-r-lg,16px)]" />
						))}
					</div>
				) : isError ? (
					<EmptyState
						icon={VaultIcon}
						title="Vault data is unavailable"
						description={
							// Naming the indexer is deliberate: this is almost always
							// an operator problem with a specific fix, and a generic
							// "something went wrong" sends them looking at the app.
							error instanceof Error
								? error.message
								: "The indexer could not be reached, so vault balances and history cannot be shown."
						}
					/>
				) : vaults.length === 0 ? (
					<EmptyState
						icon={VaultIcon}
						title={
							tier === "all" && group === "all" ? "No vaults yet" : "Nothing matches those filters"
						}
						description={
							tier === "all" && group === "all"
								? "An operator creates vaults from the admin dashboard, one per basis market."
								: "Clear a filter to see the rest of the board."
						}
					/>
				) : (
					<div data-tour="vault-row">
						<VaultTable vaults={vaults} />
					</div>
				)}
			</div>

			<section className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5 md:p-6">
				<h2 className="font-medium text-[var(--pon-fg-0)]">How a vault works</h2>
				<div className="mt-3 grid gap-4 text-sm leading-relaxed text-[var(--pon-fg-2)] md:grid-cols-3">
					<div>
						<p className="font-medium text-[var(--pon-fg)]">You deposit USDC</p>
						<p className="mt-1">
							Share tokens are minted immediately, at the vault's current price. That is the only
							step you take.
						</p>
					</div>
					<div>
						<p className="font-medium text-[var(--pon-fg)]">An agent owns and hedges it</p>
						<p className="mt-1">
							It buys the asset on Base and hedges the same size on Pacifica, so the two cancel and
							the price stops mattering. What it collects is the funding. Every move is published.
						</p>
					</div>
					<div>
						<p className="font-medium text-[var(--pon-fg)]">You withdraw when you like</p>
						<p className="mt-1">
							Requests are queued for 3 to 7 days while the agent closes your share of the position.
							Your shares keep earning until it does.
						</p>
					</div>
				</div>
				<p className="mt-4 text-xs leading-relaxed text-[var(--pon-fg-4)]">
					Taking no side is not the same as no risk. Funding can turn negative, the asset can become
					illiquid to sell, and a leveraged vault's hedge can be liquidated by a sharp move. The
					vault contract limits what the agent can do with your capital, but it cannot make the
					trade profitable.
				</p>
			</section>
		</div>
	);
}
