import { OnboardingPanel } from "@app/components/account/OnboardingPanel";
import { Callout } from "@app/components/common/Callout";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { Slider } from "@app/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { useOnboarding, usePacificaAccount } from "@app/hooks/useAccount";
import { decimalsFor, roundToLot, usePacificaTrade } from "@app/hooks/usePacificaTrade";
import type { TradableMarket } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { formatFundingApr, formatUsd } from "@lemon/core";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

type OrderType = "market" | "limit";

/**
 * The Pacifica order ticket.
 *
 * Sized in USD and converted to base units, because a notional is what a trader
 * decides and Pacifica wants a quantity. The conversion is shown rather than
 * hidden: the rounded size is the thing that actually gets sent, and a ticket
 * that displays the number you typed while submitting a different one is how
 * people lose trust in a venue.
 */
export function PacificaOrderForm({
	market,
	initialSide = "long",
	onSubmitted,
}: {
	market: TradableMarket;
	initialSide?: "long" | "short";
	onSubmitted?: () => void;
}) {
	const { step } = useOnboarding();
	const { data: account } = usePacificaAccount();
	const { place, isBusy } = usePacificaTrade();

	const [side, setSide] = useState<"long" | "short">(initialSide);
	const [orderType, setOrderType] = useState<OrderType>("market");
	const [notionalInput, setNotionalInput] = useState("100");
	const [limitPrice, setLimitPrice] = useState("");
	const [slippage, setSlippage] = useState("0.5");
	const maxLeverage = market.pacifica?.maxLeverage ?? market.maxLeverage;
	const [leverage, setLeverage] = useState(Math.min(2, maxLeverage));

	const lotSize = market.pacifica?.lotSize ?? 0;
	const tickSize = market.pacifica?.tickSize ?? 0;
	const minOrderSize = market.pacifica?.minOrderSize ?? market.minPositionUsdc;

	// A limit order is priced by the user; a market order by the book.
	const referencePrice = useMemo(() => {
		if (orderType === "limit" && Number(limitPrice) > 0) return Number(limitPrice);
		return market.pacifica?.markPrice ?? 0;
	}, [orderType, limitPrice, market.pacifica?.markPrice]);

	const notional = Number(notionalInput) || 0;
	const rawSize = referencePrice > 0 ? notional / referencePrice : 0;
	const size = roundToLot(rawSize, lotSize);
	/** What the order is actually worth once rounded to the lot grid. */
	const effectiveNotional = size * referencePrice;

	const available = Number(account?.account?.available_to_spend ?? 0);
	const marginRequired = leverage > 0 ? effectiveNotional / leverage : 0;

	const problems: string[] = [];
	if (referencePrice <= 0) problems.push("No price for this market yet.");
	if (notional > 0 && size <= 0) {
		problems.push(`Too small — one lot is ${lotSize} ${market.base}.`);
	}
	if (effectiveNotional > 0 && effectiveNotional < minOrderSize) {
		problems.push(`Minimum order is ${formatUsd(minOrderSize)}.`);
	}
	if (orderType === "limit" && !limitPrice) problems.push("A limit order needs a price.");
	if (account && marginRequired > available) {
		problems.push(`Needs ${formatUsd(marginRequired)} margin; you have ${formatUsd(available)}.`);
	}

	const canSubmit = step === "ready" && problems.length === 0 && size > 0 && !isBusy;

	// Trading needs both signatures done, so the ticket becomes the onboarding
	// panel rather than a disabled form with no explanation.
	if (step !== "ready") {
		return <OnboardingPanel />;
	}

	async function handleSubmit() {
		try {
			await place({
				symbol: market.symbol,
				side: side === "long" ? "bid" : "ask",
				amount: size.toFixed(decimalsFor(lotSize)),
				orderType,
				price: orderType === "limit" ? limitPrice : undefined,
				slippagePercent: slippage || "0.5",
				leverage,
			});

			toast.success(
				orderType === "market"
					? `${side === "long" ? "Long" : "Short"} ${size} ${market.base} submitted`
					: `Limit ${side} placed on ${market.symbol}`,
			);
			onSubmitted?.();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Order failed");
		}
	}

	return (
		<div className="space-y-4 rounded-lg border-[var(--line-soft)] bg-[var(--surface-3)] p-4 max-md:border-0 max-md:bg-transparent max-md:p-0 md:border">
			<Tabs value={side} onValueChange={(value) => setSide(value as "long" | "short")}>
				<TabsList className="w-full">
					<TabsTrigger value="long" className="flex-1 data-[state=active]:text-lime-400">
						Long
					</TabsTrigger>
					<TabsTrigger value="short" className="flex-1 data-[state=active]:text-red-400">
						Short
					</TabsTrigger>
				</TabsList>
			</Tabs>

			<Tabs value={orderType} onValueChange={(value) => setOrderType(value as OrderType)}>
				<TabsList className="w-full">
					<TabsTrigger value="market" className="flex-1">
						Market
					</TabsTrigger>
					<TabsTrigger value="limit" className="flex-1">
						Limit
					</TabsTrigger>
				</TabsList>
			</Tabs>

			<div className="space-y-2">
				<Label htmlFor="notional">Order size (USD)</Label>
				<Input
					id="notional"
					inputMode="decimal"
					value={notionalInput}
					onChange={(event) => setNotionalInput(event.target.value)}
					placeholder="100"
				/>
			</div>

			{orderType === "limit" && (
				<div className="space-y-2">
					<Label htmlFor="limitPrice">Limit price (USD)</Label>
					<Input
						id="limitPrice"
						inputMode="decimal"
						value={limitPrice}
						onChange={(event) => setLimitPrice(event.target.value)}
						placeholder={market.pacifica?.markPrice?.toFixed(decimalsFor(tickSize)) ?? "0.00"}
					/>
				</div>
			)}

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="leverage">Leverage</Label>
					<span className="font-fono text-sm text-lime-400">{leverage}x</span>
				</div>
				<Slider
					id="leverage"
					min={1}
					max={maxLeverage}
					step={1}
					value={[leverage]}
					onValueChange={([value]) => setLeverage(value)}
				/>
				<div className="flex justify-between text-[11px] text-white/35">
					<span>1x</span>
					<span>{maxLeverage}x max</span>
				</div>
			</div>

			{orderType === "market" && (
				<div className="space-y-2">
					<Label htmlFor="slippage">Max slippage (%)</Label>
					<Input
						id="slippage"
						inputMode="decimal"
						value={slippage}
						onChange={(event) => setSlippage(event.target.value)}
					/>
				</div>
			)}

			<dl className="space-y-1.5 rounded-lg border border-[var(--line-soft)] bg-black/20 p-3 text-xs">
				<div className="flex justify-between">
					<dt className="text-[var(--ink-2)]">Size</dt>
					<dd className="font-fono">
						{size > 0 ? `${size.toFixed(decimalsFor(lotSize))} ${market.base}` : "—"}
					</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-[var(--ink-2)]">Notional</dt>
					<dd className="font-fono">{formatUsd(effectiveNotional)}</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-[var(--ink-2)]">Margin required</dt>
					<dd className="font-fono">{formatUsd(marginRequired)}</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-[var(--ink-2)]">Available</dt>
					<dd className="font-fono text-[var(--ink-2)]">{formatUsd(available)}</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-[var(--ink-2)]">Funding on this side (APR)</dt>
					<dd
						className={cn(
							"font-fono",
							(side === "long"
								? market.fundingLongPercentPerHour
								: market.fundingShortPercentPerHour) >= 0
								? "text-lime-400"
								: "text-red-400",
						)}
					>
						{formatFundingApr(
							side === "long"
								? market.fundingLongPercentPerHour
								: market.fundingShortPercentPerHour,
						)}
					</dd>
				</div>
			</dl>

			{problems.length > 0 && notional > 0 && (
				<Callout tone="warning">
					<ul className="list-inside list-disc space-y-0.5">
						{problems.map((message) => (
							<li key={message}>{message}</li>
						))}
					</ul>
				</Callout>
			)}

			<Button
				type="button"
				onClick={handleSubmit}
				disabled={!canSubmit}
				className={cn(
					"w-full font-semibold",
					side === "long"
						? "bg-lime-500 text-black hover:bg-lime-400"
						: "bg-red-500 text-white hover:bg-red-400",
				)}
			>
				{isBusy ? "Placing…" : `${side === "long" ? "Long" : "Short"} ${market.base}`}
			</Button>

			<p className="text-center text-[11px] text-white/35">
				Signed by your authorised agent key — no wallet prompt, no gas.
			</p>
		</div>
	);
}
