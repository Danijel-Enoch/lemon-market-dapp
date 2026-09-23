import { ACTIVITY_FILTERS, ActivityFeed, CHAIN_FILTERS } from "@app/components/vault/ActivityFeed";
import { useAllActivity } from "@lemon/client";
import { ChipGroup, PageHeader, Skeleton } from "@lemon/ui";
import { useState } from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Activity — Lemon" },
	{
		name: "description",
		content:
			"Every trade, bridge and transfer made by every vault agent, across Base and Solana. Open to anyone, linked to the chain it happened on.",
	},
];

/**
 * The protocol-wide ledger.
 *
 * The vault detail page shows one agent's trail; this shows all of them. It
 * exists because the interesting questions are usually comparative — is every
 * agent bridging at the same time, has one stopped reporting, did the whole
 * protocol take a loss on the same funding flip — and none of those are visible
 * one vault at a time.
 *
 * No wallet, no session, no filtering by address. This is the page to send
 * someone who asks what the protocol is doing with the money.
 */
export default function ActivityPage() {
	const [kindFilter, setKindFilter] = useState("");
	const [chainFilter, setChainFilter] = useState("");

	const { data, isLoading } = useAllActivity({
		kind: kindFilter || undefined,
		chain: chainFilter || undefined,
	});

	return (
		<div className="space-y-6 md:space-y-8">
			<PageHeader
				eyebrow="Public ledger"
				title="Activity"
				description="Every action taken by every vault agent, on every chain it touches. Spot fills on Base, perp orders on Pacifica, and the bridges between them — each linked to the transaction it came from, so you can check it rather than take our word for it."
			/>

			<div className="flex flex-wrap gap-2">
				<ChipGroup
					options={ACTIVITY_FILTERS}
					value={kindFilter}
					onChange={setKindFilter}
					aria-label="Filter by action"
				/>
				<ChipGroup
					options={CHAIN_FILTERS}
					value={chainFilter}
					onChange={setChainFilter}
					aria-label="Filter by chain"
				/>
			</div>

			{isLoading ? (
				<div className="space-y-2">
					{[0, 1, 2, 3, 4].map((i) => (
						<Skeleton key={i} className="h-20 w-full rounded-[var(--pon-r-lg,16px)]" />
					))}
				</div>
			) : (
				<div data-tour="activity-feed">
					<ActivityFeed
						activity={data?.activity ?? []}
						showVault
						emptyMessage={
							kindFilter || chainFilter
								? "Nothing matches those filters."
								: "No agent has traded yet."
						}
					/>
				</div>
			)}

			<section className="t-body rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] p-5 text-[var(--pon-fg-2)]">
				<h2 className="t-h3 text-[var(--pon-fg-0)]">What "verified" means here</h2>
				<p className="mt-3">
					Each row is something an agent reported to its vault contract on Base. The contract cannot
					check a Solana fill from Base, so these are the agent's own account of itself — and we say
					so on every row rather than presenting them all as established fact.
				</p>
				<p className="mt-3">
					What makes them checkable anyway is the reference. Each names a real transaction on a
					public chain, so it can be fetched and compared against what was claimed. A row marked{" "}
					<span className="font-mono text-[13px] text-[var(--pon-up)]">verified</span> has been; one
					marked{" "}
					<span className="font-mono text-[13px] text-[var(--pon-down)]">does not check out</span>{" "}
					has been and disagrees. An unverified row has not been checked yet, which is not the same
					as being wrong.
				</p>
			</section>
		</div>
	);
}
