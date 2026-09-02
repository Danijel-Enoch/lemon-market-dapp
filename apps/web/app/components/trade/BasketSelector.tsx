import { MarketLogo } from "@app/components/common/MarketLogo";
import { useBaskets } from "@app/hooks/useMarketData";
import type { BasketSummary } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

/**
 * Basket picker, mirroring the market selector on the trade terminal so the two
 * surfaces behave identically — same trigger, same dropdown, same navigation.
 */
export function BasketSelector({ current }: { current: BasketSummary }) {
	const navigate = useNavigate();
	const { data } = useBaskets();
	const [open, setOpen] = useState(false);

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger asChild>
				<button
					type="button"
					className="inline-flex items-center gap-2.5 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-3)] px-3 py-2 transition-colors hover:border-white/25"
				>
					<span className="flex -space-x-2">
						{current.legs.slice(0, 3).map((leg) => (
							<MarketLogo
								key={leg.ticker}
								symbol={leg.marketSymbol}
								base={leg.ticker}
								assetClass={current.assetClass}
								logoUrl={leg.logoUrl}
								size={24}
								className="ring-2 ring-[#0f1419]"
							/>
						))}
					</span>
					<span className="text-lg font-semibold">{current.name}</span>
					<ChevronDown size={16} className="text-[var(--ink-2)]" aria-hidden />
				</button>
			</Popover.Trigger>

			<Popover.Portal>
				<Popover.Content
					align="start"
					sideOffset={8}
					className="z-50 w-[min(92vw,380px)] overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[#13151b] p-1 shadow-2xl"
				>
					<ul>
						{(data?.baskets ?? []).map((basket) => (
							<li key={basket.id}>
								<button
									type="button"
									onClick={() => {
										setOpen(false);
										navigate(`/baskets/${basket.id}`);
									}}
									className={cn(
										"flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--surface-4)]",
										basket.id === current.id && "bg-[var(--surface-4)]",
									)}
								>
									<span className="flex -space-x-2">
										{basket.legs.slice(0, 3).map((leg) => (
											<MarketLogo
												key={leg.ticker}
												symbol={leg.marketSymbol}
												base={leg.ticker}
												assetClass={basket.assetClass}
												logoUrl={leg.logoUrl}
												size={22}
												className="ring-2 ring-[#13151b]"
											/>
										))}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block text-sm font-medium">{basket.name}</span>
										<span className="block text-[11px] text-[var(--ink-2)]">
											{basket.legs.map((leg) => leg.ticker).join(" · ")}
										</span>
									</span>
								</button>
							</li>
						))}
					</ul>

					<div className="border-t border-[var(--line-soft)] p-2">
						<Link
							to="/trade"
							className="block rounded px-2 py-1.5 text-xs text-[var(--ink-2)] hover:text-lime-400"
							onClick={() => setOpen(false)}
						>
							Trade a single market instead →
						</Link>
					</div>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
