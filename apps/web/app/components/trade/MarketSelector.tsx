import { MarketLogo } from "@app/components/common/MarketLogo";
import { useMarkets, useSpotTokens } from "@app/hooks/useMarketData";
import { marketsApi } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import type { AssetClass, MarketWithEconomics } from "@lemon/core";
import { formatFundingApr, formatUsd } from "@lemon/core";
import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Search, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

/**
 * Market picker, built to the Avantis pair-menu specification.
 *
 * The structure is theirs verbatim: a search pill, a horizontally scrolling
 * filter row that opens on "All" and toggles back to it when the active chip is
 * pressed again, a sticky-header table on desktop, and a stacked row list below
 * lg. Column titles, the empty state and the sort affordances are reproduced as
 * written.
 *
 * Two of their seven columns are dropped rather than faked. Avantis serves
 * 24H CHANGE and 24H VOLUME from its own indexer; Lemon's market feed exposes
 * neither, and a column of dashes is worse than a column that carries real
 * information. NET RATE and MAX LEVERAGE take those slots — both are already
 * part of the Avantis trade vocabulary, and both come off data we actually have.
 */

/* ------------------------------------------------------------------ filters */

type Filter = "all" | "favourites" | "upside" | "commodities" | "crypto" | "forex" | "equities";

/** Chip order and labels as Avantis lists them. */
const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "favourites", label: "Favorites" },
	{ value: "upside", label: "Upside Perps" },
	{ value: "commodities", label: "Commodities" },
	{ value: "crypto", label: "Crypto" },
	{ value: "forex", label: "Forex" },
	{ value: "equities", label: "Equities" },
];

const CLASS_FOR: Partial<Record<Filter, AssetClass[]>> = {
	commodities: ["commodity", "metal"],
	crypto: ["crypto"],
	forex: ["fx"],
	equities: ["equity"],
};

/* ---------------------------------------------------------------- favourites */

const FAV_KEY = "lemon.favourite-markets";

function useFavourites() {
	const [favourites, setFavourites] = useState<string[]>([]);

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(FAV_KEY);
			if (raw) setFavourites(JSON.parse(raw) as string[]);
		} catch {
			// A corrupt or blocked store just means no favourites.
		}
	}, []);

	const toggle = useCallback((symbol: string) => {
		setFavourites((current) => {
			const next = current.includes(symbol)
				? current.filter((item) => item !== symbol)
				: [...current, symbol];
			try {
				window.localStorage.setItem(FAV_KEY, JSON.stringify(next));
			} catch {
				// Non-fatal: the toggle still applies for this session.
			}
			return next;
		});
	}, []);

	return { favourites, toggle };
}

/* -------------------------------------------------------------------- sorting */

type SortKey = "netRate" | "leverage" | "oi";

/* ------------------------------------------------------------------- pieces */

/** Long/short split, the same read as Avantis' MARKET SENTIMENT column. */
function Sentiment({ market }: { market: MarketWithEconomics }) {
	const total = market.longOpenInterest + market.shortOpenInterest;
	const longPercent = total > 0 ? (market.longOpenInterest / total) * 100 : 50;

	return (
		<div className="flex items-center gap-2">
			<div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--trade-short)]/40">
				<div
					className="h-full rounded-full bg-[var(--trade-long)]"
					style={{ width: `${longPercent}%` }}
				/>
			</div>
			<span className="font-fono t-micro text-[var(--ink-2)]">
				{total > 0 ? `${longPercent.toFixed(0)}%` : "—"}
			</span>
		</div>
	);
}

function Incentives({ market, hasSpot }: { market: MarketWithEconomics; hasSpot: boolean }) {
	const tags: string[] = [];
	if (market.isUpside) tags.push("Upside");
	if (hasSpot) tags.push("Spot");
	if (market.closeOnly) tags.push("Close only");

	if (tags.length === 0) return <span className="t-micro text-[var(--ink-2)]">—</span>;

	return (
		<span className="flex flex-wrap gap-1">
			{tags.map((tag) => (
				<span
					key={tag}
					className="rounded-sm bg-lime-500/10 px-1.5 py-px t-micro font-medium text-lime-400"
				>
					{tag}
				</span>
			))}
		</span>
	);
}

/** Sortable column button — Avantis pairs the title with a direction glyph. */
function SortHeader({
	label,
	active,
	direction,
	onClick,
	className,
}: {
	label: string;
	active: boolean;
	direction: "asc" | "desc";
	onClick: () => void;
	className?: string;
}) {
	const Icon = !active ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn("flex h-fit items-center p-0 text-xs text-[var(--ink-2)]", className)}
		>
			{label}
			<Icon className={cn("ml-2 size-4", active && "text-white")} aria-hidden />
		</button>
	);
}

/* ------------------------------------------------------------------ selector */

export function MarketSelector({
	current,
	onSelect,
}: {
	current: { symbol: string; base: string; assetClass: AssetClass; logoUrl: string | null };
	/** Omit to navigate; provide to keep selection local. */
	onSelect?: (symbol: string) => void;
}) {
	const navigate = useNavigate();
	const { data } = useMarkets();
	const { data: spot } = useSpotTokens();
	const { favourites, toggle } = useFavourites();

	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
		key: "oi",
		direction: "desc",
	});

	const searchRef = useRef<HTMLInputElement>(null);

	// The picker exists to be typed into, so focus follows the open state rather
	// than an autoFocus attribute that would also fire on first paint.
	useEffect(() => {
		if (open) searchRef.current?.focus();
	}, [open]);

	const { data: prices } = useQuery({
		queryKey: ["market-prices"],
		queryFn: () => marketsApi.prices(),
		refetchInterval: 10_000,
		enabled: open,
	});

	// Which underlyings also have a spot leg — surfaced under INCENTIVES so the
	// spot/perp toggle is never a surprise dead end.
	const spotSymbols = useMemo(() => {
		const set = new Set<string>();
		for (const token of spot?.tokens ?? []) {
			if (token.avantisSymbol && (token.buyable || token.sellable)) set.add(token.avantisSymbol);
		}
		return set;
	}, [spot]);

	const rows = useMemo(() => {
		const term = query.trim().toLowerCase();

		const filtered = (data?.markets ?? []).filter((market) => {
			if (filter === "favourites" && !favourites.includes(market.symbol)) return false;
			if (filter === "upside" && !market.isUpside) return false;
			const classes = CLASS_FOR[filter];
			if (classes && !classes.includes(market.assetClass)) return false;

			if (!term) return true;
			// Avantis matches the display pair, the base and the quote.
			return (
				market.symbol.toLowerCase().includes(term) ||
				market.base.toLowerCase().includes(term) ||
				market.quote.toLowerCase().includes(term)
			);
		});

		const value = (market: MarketWithEconomics) => {
			if (sort.key === "leverage") return market.maxLeverage;
			if (sort.key === "netRate") return market.fundingShortPercentPerHour;
			return market.openInterest;
		};

		return [...filtered].sort((a, b) => {
			// Upside markets float to the top of every view, as they do upstream.
			if (a.isUpside !== b.isUpside) return a.isUpside ? -1 : 1;
			const delta = value(a) - value(b);
			return sort.direction === "asc" ? delta : -delta;
		});
	}, [data, filter, query, favourites, sort]);

	function choose(symbol: string) {
		setOpen(false);
		setQuery("");
		if (onSelect) onSelect(symbol);
		else navigate(`/trade/${symbol.replace("/", "-")}`);
	}

	/** Pressing the active chip returns to All, matching the upstream toggle. */
	function pick(next: Filter) {
		setFilter((currentFilter) => (currentFilter === next ? "all" : next));
	}

	function sortBy(key: SortKey) {
		setSort((currentSort) =>
			currentSort.key === key
				? { key, direction: currentSort.direction === "asc" ? "desc" : "asc" }
				: { key, direction: "desc" },
		);
	}

	const priceFor = (market: MarketWithEconomics) =>
		prices?.prices[String(market.pairIndex)]?.price ?? null;

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger asChild>
				<button
					type="button"
					className="my-1 flex min-w-[176px] items-center justify-between gap-3 rounded bg-[var(--surface-3)] px-3 py-1.5 transition-colors hover:bg-[var(--surface-4)]"
				>
					<span className="flex w-fit items-center gap-3">
						<MarketLogo
							symbol={current.symbol}
							base={current.base}
							assetClass={current.assetClass}
							logoUrl={current.logoUrl}
							size={28}
						/>
						<span className="flex flex-col items-start leading-none">
							<span className="t-body font-medium leading-5 text-[var(--ink-1)]">
								{current.symbol.replace("/", "")}
							</span>
							<span className="t-caption text-[var(--ink-2)]">{current.base}</span>
						</span>
					</span>
					<ChevronDown size={16} className="shrink-0 text-[var(--ink-2)]" aria-hidden />
				</button>
			</Popover.Trigger>

			<Popover.Portal>
				<Popover.Content
					align="start"
					sideOffset={6}
					className="z-50 w-[min(96vw,1040px)] overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--surface-3)] shadow-2xl"
				>
					{/* Search pill. */}
					<div className="mx-4 mt-4 flex items-center gap-3 rounded-3xl bg-[var(--surface-4)] px-4 py-1.5">
						<Search size={16} className="shrink-0 text-[var(--ink-2)]" aria-hidden />
						<input
							ref={searchRef}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search"
							aria-label="Search markets"
							className="w-full bg-transparent py-1.5 text-sm text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-2)]"
						/>
					</div>

					{/* Filter chips — one scrolling row, never wrapping. */}
					<div className="w-full overflow-x-auto whitespace-nowrap px-4 py-3 scrollbar-hide">
						{FILTERS.map((chip) => (
							<button
								key={chip.value}
								type="button"
								onClick={() => pick(chip.value)}
								className={cn(
									"mr-2 rounded-full px-3 py-1.5 t-caption transition-colors",
									filter === chip.value
										? "bg-black text-white"
										: "bg-[var(--surface-4)] text-[var(--ink-2)] hover:text-[var(--ink-1)]",
								)}
							>
								{chip.label}
							</button>
						))}
					</div>

					{rows.length === 0 ? (
						<div className="m-auto mt-10 flex flex-col items-center gap-4 pb-10 text-sm text-[var(--ink-2)]">
							<Search width={30} height={30} className="text-[var(--surface-6)]" aria-hidden />
							<div className="flex flex-col items-center">
								<p>No results.</p>
								<p>Try something else</p>
							</div>
						</div>
					) : (
						<>
							{/* Desktop: sticky-header table, 388px of scroll. */}
							<div
								className="relative hidden w-full overflow-auto overscroll-contain scrollbar-hide lg:block"
								style={{ height: 388 }}
							>
								<table className="min-w-full">
									<thead className="sticky -top-[0.5px] z-10 w-full border-y border-[var(--line-soft)] bg-[var(--surface-3)] p-0">
										<tr className="w-full p-0">
											<th
												className="h-fit px-3 py-2 text-left text-xs font-medium text-[var(--ink-2)]"
												style={{ width: 256 }}
											>
												PAIR
											</th>
											<th
												className="h-fit px-3 py-2 text-left text-xs font-medium text-[var(--ink-2)]"
												style={{ width: 148 }}
											>
												PRICE
											</th>
											<th className="h-fit px-3 py-2 text-left" style={{ width: 132 }}>
												<SortHeader
													label="NET RATE"
													active={sort.key === "netRate"}
													direction={sort.direction}
													onClick={() => sortBy("netRate")}
												/>
											</th>
											<th className="h-fit px-3 py-2 text-left" style={{ width: 130 }}>
												<SortHeader
													label="MAX LEVERAGE"
													active={sort.key === "leverage"}
													direction={sort.direction}
													onClick={() => sortBy("leverage")}
												/>
											</th>
											<th className="h-fit px-3 py-2 text-left" style={{ width: 147 }}>
												<SortHeader
													label="OPEN INTEREST"
													active={sort.key === "oi"}
													direction={sort.direction}
													onClick={() => sortBy("oi")}
												/>
											</th>
											<th
												className="h-fit px-3 py-2 text-left text-xs font-medium text-[var(--ink-2)]"
												style={{ width: 162 }}
											>
												MARKET SENTIMENT
											</th>
											<th
												className="h-fit px-3 py-2 text-left text-xs font-medium text-[var(--ink-2)]"
												style={{ width: 170 }}
											>
												INCENTIVES
											</th>
										</tr>
									</thead>
									<tbody>
										{rows.map((market) => {
											const price = priceFor(market);
											const starred = favourites.includes(market.symbol);
											return (
												<tr
													key={market.pairIndex}
													onClick={() => choose(market.symbol)}
													className={cn(
														"cursor-pointer border-b border-[var(--line-soft)] transition-colors hover:bg-[var(--surface-4)]",
														market.symbol === current.symbol && "bg-[var(--surface-4)]",
													)}
												>
													<td className="px-3 py-2.5">
														<span className="flex items-center gap-2">
															<button
																type="button"
																aria-label={starred ? "Remove favourite" : "Add favourite"}
																onClick={(event) => {
																	event.stopPropagation();
																	toggle(market.symbol);
																}}
															>
																<Star
																	size={16}
																	className={cn(
																		starred
																			? "fill-[#FFD700] text-[#FFD700]"
																			: "fill-[var(--surface-6)] text-[var(--surface-6)]",
																	)}
																	aria-hidden
																/>
															</button>
															<MarketLogo
																symbol={market.symbol}
																base={market.base}
																assetClass={market.assetClass}
																logoUrl={market.logoUrl}
																size={24}
															/>
															<span className="min-w-0">
																<span className="block truncate text-sm text-[var(--ink-1)]">
																	{market.symbol.replace("/", "")}
																</span>
																<span className="block truncate t-micro text-[var(--ink-2)]">
																	{market.base}
																</span>
															</span>
														</span>
													</td>
													<td className="px-3 py-2.5 font-fono text-sm text-[var(--ink-1)]">
														{price !== null ? formatUsd(price) : "-"}
													</td>
													<td className="px-3 py-2.5">
														{market.isOpen ? (
															<span
																className={cn(
																	"font-fono text-sm",
																	market.fundingShortPercentPerHour >= 0
																		? "text-lime-400"
																		: "text-red-400",
																)}
															>
																{formatFundingApr(market.fundingShortPercentPerHour)}
															</span>
														) : (
															<span className="text-[11px] font-medium leading-[14px] text-[var(--destructive)]">
																Market Closed
															</span>
														)}
													</td>
													<td className="px-3 py-2.5">
														<span className="rounded-md bg-[var(--surface-5)] px-2 py-[2px] font-fono text-sm text-[var(--ink-1)]">
															{market.maxLeverage}x
														</span>
													</td>
													<td className="px-3 py-2.5 font-fono text-sm text-[var(--ink-1)]">
														{formatUsd(market.openInterest, { compact: true })}
													</td>
													<td className="px-3 py-2.5">
														<Sentiment market={market} />
													</td>
													<td className="px-3 py-2.5">
														<Incentives market={market} hasSpot={spotSymbols.has(market.symbol)} />
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>

							{/* Below lg: stacked rows, price over rate on the right. */}
							<div className="relative h-[65vh] overflow-y-scroll overscroll-contain scrollbar-hide lg:hidden">
								{rows.map((market) => {
									const price = priceFor(market);
									const starred = favourites.includes(market.symbol);
									return (
										<div
											key={market.pairIndex}
											className="relative flex w-full items-center justify-between border-t border-[var(--line-soft)] p-2"
										>
											{/* Sits under the content so the star stays clickable. */}
											<button
												type="button"
												onClick={() => choose(market.symbol)}
												className="absolute inset-0 z-0"
												aria-label={`Select ${market.symbol}`}
											/>
											<div className="relative z-10 flex items-center gap-2">
												<button
													type="button"
													aria-label={starred ? "Remove favourite" : "Add favourite"}
													onClick={(event) => {
														event.stopPropagation();
														toggle(market.symbol);
													}}
												>
													<Star
														size={16}
														className={cn(
															starred
																? "fill-[#FFD700] text-[#FFD700]"
																: "fill-[var(--surface-6)] text-[var(--surface-6)]",
														)}
														aria-hidden
													/>
												</button>
												<MarketLogo
													symbol={market.symbol}
													base={market.base}
													assetClass={market.assetClass}
													logoUrl={market.logoUrl}
													size={24}
												/>
												<span className="text-sm text-[var(--ink-1)]">
													{market.symbol.replace("/", "")}
												</span>
												{!market.isOpen ? (
													<p className="text-[11px] font-medium leading-[14px] text-[var(--destructive)]">
														Market Closed
													</p>
												) : (
													<div className="rounded-md bg-[var(--surface-5)] px-2 py-[2px] t-caption text-[var(--ink-1)]">
														{market.maxLeverage}x
													</div>
												)}
											</div>
											<div className="pointer-events-none relative z-10 flex flex-col items-end">
												<span className="font-fono text-sm text-[var(--ink-1)]">
													{price !== null ? formatUsd(price) : "-"}
												</span>
												<span
													className={cn(
														"font-fono t-micro",
														market.fundingShortPercentPerHour >= 0
															? "text-lime-400"
															: "text-red-400",
													)}
												>
													{formatFundingApr(market.fundingShortPercentPerHour)}
												</span>
											</div>
										</div>
									);
								})}
							</div>
						</>
					)}
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
