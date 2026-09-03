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
					className="inline-flex items-center gap-2.5 rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-3.5 py-2.5 transition-colors hover:border-[var(--pon-line-2)] md:h-[58px]"
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
								className="ring-2 ring-[var(--pon-surface)]"
							/>
						))}
					</span>
					<span className="font-display text-[15px] font-bold text-[var(--pon-fg)]">
						{current.name}
					</span>
					<ChevronDown size={16} className="shrink-0 text-[var(--pon-fg-3)]" aria-hidden />
				</button>
			</Popover.Trigger>

			<Popover.Portal>
				<Popover.Content
					align="start"
					sideOffset={8}
					className="z-50 w-[min(92vw,380px)] overflow-hidden rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface-3)] p-1.5"
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
										"flex w-full items-center gap-3 rounded-[var(--pon-r-md)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--pon-surface-2)]",
										basket.id === current.id && "bg-[var(--pon-surface-2)]",
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
												className="ring-2 ring-[var(--pon-surface-3)]"
											/>
										))}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block text-[13px] font-semibold text-[var(--pon-fg)]">
											{basket.name}
										</span>
										<span className="mt-0.5 block t-micro text-[var(--pon-fg-3)]">
											{basket.legs.map((leg) => leg.ticker).join(" · ")}
										</span>
									</span>
								</button>
							</li>
						))}
					</ul>

					<div className="mt-1.5 border-t border-[var(--pon-line)] pt-1.5">
						<Link
							to="/trade"
							className="block rounded-[var(--pon-r-sm)] px-3 py-2 text-xs text-[var(--pon-fg-3)] transition-colors hover:text-[var(--pon-lime)]"
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
