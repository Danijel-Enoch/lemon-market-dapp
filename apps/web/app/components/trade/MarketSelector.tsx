import { MarketLogo } from "@app/components/common/MarketLogo";
import { Input } from "@app/components/ui/input";
import { useMarkets, useSpotTokens } from "@app/hooks/useMarketData";
import { cn } from "@app/lib/utils";
import { ASSET_CLASS_LABELS, type AssetClass, formatFundingApr, formatUsd } from "@lemon/core";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

const FILTERS: (AssetClass | "all")[] = ["all", "crypto", "equity", "fx", "commodity", "metal"];

/**
 * Market picker: a dropdown filtered by asset class with a search box.
 *
 * The whole catalog is 93 markets across five classes, which is too many for
 * tabs alone and too few to need pagination — so filter chips plus type-ahead,
 * the pattern every perp exchange converges on.
 */
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
	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState<AssetClass | "all">("all");
	const [query, setQuery] = useState("");

	// Which underlyings also have a spot leg — shown as a badge so the
	// spot/perp toggle is never a surprise dead end.
	const spotSymbols = useMemo(() => {
		const set = new Set<string>();
		for (const token of spot?.tokens ?? []) {
			if (token.avantisSymbol && (token.buyable || token.sellable)) {
				set.add(token.avantisSymbol);
			}
		}
		return set;
	}, [spot]);

	const markets = useMemo(() => {
		const term = query.trim().toUpperCase();
		return (data?.markets ?? []).filter((market) => {
			if (filter !== "all" && market.assetClass !== filter) return false;
			if (!term) return true;
			return market.symbol.includes(term) || market.base.toUpperCase().includes(term);
		});
	}, [data, filter, query]);

	function choose(symbol: string) {
		setOpen(false);
		setQuery("");
		if (onSelect) onSelect(symbol);
		else navigate(`/trade/${symbol.replace("/", "-")}`);
	}

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger asChild>
				<button
					type="button"
					className="inline-flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 transition-colors hover:border-white/25"
				>
					<MarketLogo
						symbol={current.symbol}
						base={current.base}
						assetClass={current.assetClass}
						logoUrl={current.logoUrl}
						size={26}
					/>
					<span className="text-lg font-semibold">{current.symbol}</span>
					<ChevronDown size={16} className="text-gray-500" aria-hidden />
				</button>
			</Popover.Trigger>

			<Popover.Portal>
				<Popover.Content
					align="start"
					sideOffset={8}
					className="z-50 max-h-[70vh] w-[min(92vw,420px)] overflow-hidden rounded-xl border border-white/10 bg-[#13151b] shadow-2xl"
				>
					<div className="border-b border-white/10 p-3">
						<div className="relative">
							<Search
								size={14}
								className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
								aria-hidden
							/>
							<Input
								autoFocus
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search markets"
								className="pl-8"
							/>
						</div>

						<div className="mt-2 flex flex-wrap gap-1">
							{FILTERS.map((value) => (
								<button
									key={value}
									type="button"
									onClick={() => setFilter(value)}
									className={cn(
										"rounded px-2 py-1 text-xs transition-colors",
										value === filter
											? "bg-lime-500/15 text-lime-400"
											: "text-gray-500 hover:text-gray-300",
									)}
								>
									{value === "all" ? "All" : ASSET_CLASS_LABELS[value]}
								</button>
							))}
						</div>
					</div>

					<ul className="max-h-[52vh] overflow-y-auto p-1">
						{markets.length === 0 && (
							<li className="px-3 py-6 text-center text-sm text-gray-500">
								No markets match “{query}”.
							</li>
						)}
						{markets.map((market) => (
							<li key={market.pairIndex}>
								<button
									type="button"
									onClick={() => choose(market.symbol)}
									className={cn(
										"flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5",
										market.symbol === current.symbol && "bg-white/5",
									)}
								>
									<MarketLogo
										symbol={market.symbol}
										base={market.base}
										assetClass={market.assetClass}
										logoUrl={market.logoUrl}
										size={26}
									/>
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-1.5">
											<span className="truncate text-sm font-medium">{market.symbol}</span>
											{spotSymbols.has(market.symbol) && (
												<span className="rounded bg-lime-500/15 px-1 py-px text-[9px] font-medium uppercase text-lime-400">
													spot
												</span>
											)}
											{!market.isOpen && (
												<span className="rounded bg-gray-500/15 px-1 py-px text-[9px] uppercase text-gray-500">
													closed
												</span>
											)}
										</span>
										<span className="block text-[11px] text-gray-500">
											{market.maxLeverage}x · min {formatUsd(market.minPositionUsdc)}
										</span>
									</span>
									<span
										className={cn(
											"shrink-0 font-mono text-[11px]",
											market.fundingShortPercentPerHour >= 0 ? "text-lime-400" : "text-red-400",
										)}
										title="Perp funding, short side, annualised. Spot has no funding."
									>
										{formatFundingApr(market.fundingShortPercentPerHour)}
									</span>
								</button>
							</li>
						))}
					</ul>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
