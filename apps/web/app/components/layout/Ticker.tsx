import { formatPercent, formatUsdCompact, useVaults } from "@lemon/client";

/**
 * The ticker strip.
 *
 * A single monospaced line running under the header, carrying what the vaults
 * have actually paid. It is the one piece of chrome on the page that moves,
 * and it earns that by being real: every item is a measured seven-day figure
 * read from the same indexer the board reads, not a marketing line on a loop.
 *
 * The track is duplicated because the marquee translates by exactly -50% —
 * with one copy the strip would run out and snap back. Hovering pauses it, so
 * a figure someone is trying to read stops moving.
 */

function Item({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex shrink-0 items-center gap-2 px-4 text-[11.5px] tracking-[-0.02em] text-[var(--pon-fg)]">
			{children}
		</span>
	);
}

function Marker() {
	return (
		<span className="inline-flex shrink-0 items-center bg-[var(--pon-ink)] px-2.5 py-[3px] text-[11px] tracking-[0.12em] text-[var(--pon-on-lime)] uppercase">
			Lemon wire
		</span>
	);
}

export function Ticker() {
	const { data } = useVaults();
	const vaults = data?.vaults ?? [];

	// Nothing measured yet is not an error — the strip falls back to what is
	// true of every vault regardless of its track record.
	const items: React.ReactNode[] = vaults.length
		? vaults.map((vault) => {
				const apy = vault.apy7d?.apy ?? null;
				const up = (apy ?? 0) >= 0;
				return (
					<Item key={vault.address}>
						<span className="font-bold">{vault.ticker ?? vault.symbol}</span>
						<span className="text-[var(--pon-fg-2)]">7d</span>
						<span className={up ? "text-[var(--pon-up)]" : "text-[var(--pon-down)]"}>
							{up ? "▲" : "▼"}
							{formatPercent(apy)}
						</span>
						<span className="text-[var(--pon-fg-3)]">
							{formatUsdCompact(vault.totalAssets)} deposited
						</span>
					</Item>
				);
			})
		: [
				<Item key="a">Every vault owns the asset and hedges it one-for-one.</Item>,
				<Item key="b">You are not long. You are not short. You are paid to be neither.</Item>,
				<Item key="c">Every fill, bridge and settlement is published on Base.</Item>,
			];

	// One track, rendered twice, translated by half its width.
	const track = (
		<span className="inline-flex items-center">
			{items.map((item, i) => (
				// The items are already keyed; this wrapper only needs position.
				// biome-ignore lint/suspicious/noArrayIndexKey: positional wrapper
				<span key={i} className="inline-flex items-center">
					<Marker />
					{item}
				</span>
			))}
		</span>
	);

	return (
		<div className="overflow-hidden border-b border-[var(--pon-line-2)] bg-[var(--pon-bg)] py-1.5">
			<div
				className="animate-scroll-ticker flex w-max items-center"
				style={{ ["--scroll-ticker-duration" as string]: "70s" }}
			>
				{track}
				<span aria-hidden>{track}</span>
			</div>
		</div>
	);
}
