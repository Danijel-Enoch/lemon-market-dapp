import { MarketLogo } from "@app/components/common/MarketLogo";
import { useMarkets, useSpotTokens } from "@app/hooks/useMarketData";
import { marketsApi } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import type { AssetClass, MarketWithEconomics } from "@lemon/core";
import { formatFundingApr, formatUsd } from "@lemon/core";
import { isLayer1Or2 } from "@lemon/registry";
import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Search, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

/**
 * Market picker.
 *
 * The structure is the reference pair menu: a search well, a horizontally
 * scrolling filter row that opens on "All" and toggles back to it when the
 * active chip is pressed again, a sticky-header table on desktop, and a stacked
 * row list below lg.
 *
 * Dressed in Pons: the trigger and the panel are hairline-framed cards, filters
 * are Pons chips that invert to a lime fill when selected, and every figure is
 * tabular.
 *
 * Two of the reference's seven columns are dropped rather than faked. It serves
 * 24H CHANGE and 24H VOLUME from its own indexer; Lemon's market feed exposes
 * neither, and a column of dashes is worse than a column that carries real
 * information. NET RATE and MAX LEVERAGE take those slots — both come off data
 * we actually have.
 */

/* ------------------------------------------------------------------ filters */

type Filter =
	| "all"
	| "favourites"
	| "spot"
	| "layer1"
	| "crypto"
	| "equities"
	| "forex"
	| "metals"
	| "commodities"
	| "indices";

/** Chip order and labels, as the reference lists them. */
const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "favourites", label: "Favorites" },
	// Two cross-cutting filters, sitting before the asset classes because they
	// answer questions the class list cannot: "what can I also hold?" and
	// "which of these are chains?"
	{ value: "spot", label: "Spot" },
	{ value: "layer1", label: "L1 / L2" },
	{ value: "crypto", label: "Crypto" },
	{ value: "equities", label: "Equities" },
	{ value: "forex", label: "Forex" },
	{ value: "metals", label: "Metals" },
	{ value: "commodities", label: "Commodities" },
	{ value: "indices", label: "Indices" },
];

const CLASS_FOR: Partial<Record<Filter, AssetClass[]>> = {
	crypto: ["crypto"],
	equities: ["equity"],
	forex: ["fx"],
	metals: ["metal"],
	commodities: ["commodity"],
	indices: ["index"],
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

/** Long/short split — the MARKET SENTIMENT read. */
function Sentiment({ market }: { market: MarketWithEconomics }) {
	const total = market.longOpenInterest + market.shortOpenInterest;

	// Pacifica publishes total open interest without a side breakdown. Drawing a
	// bar from no data would read as balanced positioning rather than absence.
	if (total <= 0) return <span className="t-micro text-[var(--pon-fg-3)]">—</span>;

	const longPercent = (market.longOpenInterest / total) * 100;
	return (
		<div className="flex items-center gap-2">
			<div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--pon-down)]/50">
				<div
					className="h-full rounded-full bg-[var(--pon-up)]"
					style={{ width: `${longPercent}%` }}
				/>
			</div>
			<span className="font-fono t-micro text-[var(--pon-fg-3)]">{longPercent.toFixed(0)}%</span>
		</div>
	);
}

function Incentives({ market, hasSpot }: { market: MarketWithEconomics; hasSpot: boolean }) {
	const tags: string[] = [];
	if (hasSpot) tags.push("Spot");
	if (market.closeOnly) tags.push("Close only");

	if (tags.length === 0) return <span className="t-micro text-[var(--pon-fg-3)]">—</span>;

	return (
		<span className="flex flex-wrap gap-1">
			{tags.map((tag) => (
				<span
					key={tag}
					className="rounded-[var(--pon-r-sm)] border border-[var(--pon-lime)] bg-[var(--pon-lime-dim)] px-2 py-0.5 text-[10px] font-semibold text-[var(--pon-lime)]"
				>
					{tag}
				</span>
			))}
		</span>
	);
}

/** Sortable column button — the title paired with a direction glyph. */
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
			className={cn(
				"flex h-fit items-center p-0 text-[11px] uppercase tracking-[0.05em] text-[var(--pon-fg-3)] transition-colors hover:text-[var(--pon-fg)]",
				className,
			)}
		>
			{label}
			<Icon className={cn("ml-1.5 size-3.5", active && "text-[var(--pon-lime)]")} aria-hidden />
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
			if (token.perpSymbol && (token.buyable || token.sellable)) set.add(token.perpSymbol);
		}
		return set;
	}, [spot]);

	const rows = useMemo(() => {
		const term = query.trim().toLowerCase();

		const filtered = (data?.markets ?? []).filter((market) => {
			if (filter === "favourites" && !favourites.includes(market.symbol)) return false;
			// Markets you can also hold outright — the ones a carry can be built
			// from, and the only ones where "Spot" in the chart tab does anything.
			if (filter === "spot" && !spotSymbols.has(market.symbol)) return false;
			if (filter === "layer1" && !isLayer1Or2(market.base)) return false;
			const classes = CLASS_FOR[filter];
			if (classes && !classes.includes(market.assetClass)) return false;

			if (!term) return true;
			// Match the display pair, the base and the quote.
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
			const delta = value(a) - value(b);
			return sort.direction === "asc" ? delta : -delta;
		});
	}, [data, filter, query, favourites, sort, spotSymbols]);

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

	const priceFor = (market: MarketWithEconomics) => prices?.prices[market.symbol]?.price ?? null;

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger asChild>
				<button
					type="button"
					className="flex min-w-[190px] items-center justify-between gap-3 rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-3.5 py-2.5 transition-colors hover:border-[var(--pon-line-2)] md:h-[58px]"
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
							<span className="font-display text-[15px] font-bold leading-5 text-[var(--pon-fg)]">
								{current.symbol.replace("/", "")}
							</span>
							<span className="mt-0.5 t-micro text-[var(--pon-fg-3)]">{current.base}</span>
						</span>
					</span>
					<ChevronDown size={16} className="shrink-0 text-[var(--pon-fg-2)]" aria-hidden />
				</button>
			</Popover.Trigger>

			<Popover.Portal>
				<Popover.Content
					align="start"
					sideOffset={6}
					className="z-50 w-[min(96vw,1040px)] overflow-hidden rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)]"
				>
					{/* Search pill. */}
					<div className="mx-4 mt-4 flex items-center gap-2.5 rounded-[var(--pon-r-md)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-3.5 py-3 transition-colors focus-within:border-[var(--pon-lime)]">
						<Search size={15} className="shrink-0 text-[var(--pon-fg-3)]" aria-hidden />
						<input
							ref={searchRef}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search markets"
							aria-label="Search markets"
							className="w-full bg-transparent text-sm text-[var(--pon-fg)] outline-none placeholder:text-[var(--pon-fg-3)]"
						/>
						<span className="shrink-0 rounded-[6px] border border-[var(--pon-line)] px-1.5 py-0.5 t-micro text-[var(--pon-fg-3)]">
							⌘K
						</span>
					</div>

					{/* Filter chips — one scrolling row, never wrapping. */}
					<div className="w-full overflow-x-auto whitespace-nowrap px-4 py-3 scrollbar-hide">
						{FILTERS.map((chip) => (
							<button
								key={chip.value}
								type="button"
								onClick={() => pick(chip.value)}
								className={cn(
									"mr-1.5 rounded-full border px-3.5 py-1.5 text-xs transition-colors",
									filter === chip.value
										? "border-[var(--pon-lime)] bg-[var(--pon-lime)] font-semibold text-[var(--pon-on-lime)]"
										: "border-[var(--pon-line)] bg-transparent text-[var(--pon-fg-2)] hover:border-[var(--pon-fg-3)]",
								)}
							>
								{chip.label}
							</button>
						))}
					</div>

					{rows.length === 0 ? (
						<div className="m-auto mt-10 flex flex-col items-center gap-3 pb-12 text-center">
							<Search size={22} className="text-[var(--pon-fg-3)]" aria-hidden />
							<p className="text-[15px] font-semibold text-[var(--pon-fg)]">No results.</p>
							<p className="text-[12.5px] text-[var(--pon-fg-3)]">Try something else.</p>
						</div>
					) : (
						<>
							{/* Desktop: sticky-header table, 388px of scroll. */}
							<div
								className="relative hidden w-full overflow-auto overscroll-contain scrollbar-hide lg:block"
								style={{ height: 388 }}
							>
								<table className="min-w-full">
									<thead className="sticky -top-[0.5px] z-10 w-full border-y border-[var(--pon-line)] bg-[var(--pon-surface)] p-0">
										<tr className="w-full p-0">
											<th
												className="h-fit px-3 pb-2.5 pt-1 text-left text-[11px] font-normal uppercase tracking-[0.05em] text-[var(--pon-fg-3)]"
												style={{ width: 256 }}
											>
												PAIR
											</th>
											<th
												className="h-fit px-3 pb-2.5 pt-1 text-left text-[11px] font-normal uppercase tracking-[0.05em] text-[var(--pon-fg-3)]"
												style={{ width: 148 }}
											>
												PRICE
											</th>
											<th className="h-fit px-3 pb-2.5 pt-1 text-left" style={{ width: 132 }}>
												<SortHeader
													label="NET RATE"
													active={sort.key === "netRate"}
													direction={sort.direction}
													onClick={() => sortBy("netRate")}
												/>
											</th>
											<th className="h-fit px-3 pb-2.5 pt-1 text-left" style={{ width: 130 }}>
												<SortHeader
													label="MAX LEVERAGE"
													active={sort.key === "leverage"}
													direction={sort.direction}
													onClick={() => sortBy("leverage")}
												/>
											</th>
											<th className="h-fit px-3 pb-2.5 pt-1 text-left" style={{ width: 147 }}>
												<SortHeader
													label="OPEN INTEREST"
													active={sort.key === "oi"}
													direction={sort.direction}
													onClick={() => sortBy("oi")}
												/>
											</th>
											<th
												className="h-fit px-3 pb-2.5 pt-1 text-left text-[11px] font-normal uppercase tracking-[0.05em] text-[var(--pon-fg-3)]"
												style={{ width: 162 }}
											>
												MARKET SENTIMENT
											</th>
											<th
												className="h-fit px-3 pb-2.5 pt-1 text-left text-[11px] font-normal uppercase tracking-[0.05em] text-[var(--pon-fg-3)]"
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
													key={market.symbol}
													onClick={() => choose(market.symbol)}
													className={cn(
														"cursor-pointer border-b border-[var(--pon-line)] transition-colors hover:bg-[var(--pon-bg-2)]",
														market.symbol === current.symbol && "bg-[var(--pon-lime-dim)]",
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
																			? "fill-[var(--pon-lime)] text-[var(--pon-lime)]"
																			: "fill-[var(--pon-line-2)] text-[var(--pon-line-2)]",
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
																<span className="block truncate text-[13px] font-semibold text-[var(--pon-fg)]">
																	{market.symbol.replace("/", "")}
																</span>
																<span className="block truncate t-micro text-[var(--pon-fg-3)]">
																	{market.base}
																</span>
															</span>
														</span>
													</td>
													<td className="px-3 py-2.5 font-fono text-sm text-[var(--pon-fg)]">
														{price !== null ? formatUsd(price) : "-"}
													</td>
													<td className="px-3 py-2.5">
														{market.isOpen ? (
															<span
																className={cn(
																	"font-fono text-sm",
																	market.fundingShortPercentPerHour >= 0
																		? "text-[var(--pon-up)]"
																		: "text-[var(--pon-down)]",
																)}
															>
																{formatFundingApr(market.fundingShortPercentPerHour)}
															</span>
														) : (
															<span className="t-micro font-semibold text-[var(--pon-down)]">
																Market Closed
															</span>
														)}
													</td>
													<td className="px-3 py-2.5">
														<span className="font-fono rounded-full border border-[var(--pon-line)] bg-[var(--pon-surface-2)] px-2.5 py-0.5 text-xs text-[var(--pon-fg)]">
															{market.maxLeverage}x
														</span>
													</td>
													<td className="px-3 py-2.5 font-fono text-sm text-[var(--pon-fg)]">
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
											key={market.symbol}
											className="relative flex w-full items-center justify-between border-t border-[var(--pon-line)] px-4 py-3"
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
																? "fill-[var(--pon-lime)] text-[var(--pon-lime)]"
																: "fill-[var(--pon-line-2)] text-[var(--pon-line-2)]",
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
												<span className="text-[13px] font-semibold text-[var(--pon-fg)]">
													{market.symbol.replace("/", "")}
												</span>
												{!market.isOpen ? (
													<p className="t-micro font-semibold text-[var(--pon-down)]">
														Market Closed
													</p>
												) : (
													<div className="font-fono rounded-full border border-[var(--pon-line)] bg-[var(--pon-surface-2)] px-2.5 py-0.5 t-micro text-[var(--pon-fg)]">
														{market.maxLeverage}x
													</div>
												)}
											</div>
											<div className="pointer-events-none relative z-10 flex flex-col items-end">
												<span className="font-fono text-sm text-[var(--pon-fg)]">
													{price !== null ? formatUsd(price) : "-"}
												</span>
												<span
													className={cn(
														"font-fono t-micro",
														market.fundingShortPercentPerHour >= 0
															? "text-[var(--pon-up)]"
															: "text-[var(--pon-down)]",
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
