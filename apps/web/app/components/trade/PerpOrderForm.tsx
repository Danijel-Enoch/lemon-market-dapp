import { Callout } from "@app/components/common/Callout";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { Slider } from "@app/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { usePerpTrade } from "@app/hooks/usePerpTrade";
import { cn } from "@app/lib/utils";
import { validateOrder } from "@lemon/avantis";
import type { MarketWithEconomics } from "@lemon/core";
import { formatFundingApr, formatUsd } from "@lemon/core";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useConnection } from "wagmi";

type OrderType = "market" | "limit" | "stop_limit";

export function PerpOrderForm({
	market,
	initialSide = "long",
	onSubmitted,
}: {
	market: MarketWithEconomics;
	/** Lets the mobile action bar open the sheet straight into a side. */
	initialSide?: "long" | "short";
	onSubmitted?: () => void;
}) {
	const { isConnected } = useConnection();
	const { open, isBusy, stage } = usePerpTrade();

	const [side, setSide] = useState<"long" | "short">(initialSide);
	const [orderType, setOrderType] = useState<OrderType>("market");
	const [collateral, setCollateral] = useState("100");
	const [leverage, setLeverage] = useState(Math.min(2, market.maxLeverage));
	const [limitPrice, setLimitPrice] = useState("");
	const [takeProfit, setTakeProfit] = useState("");
	const [stopLoss, setStopLoss] = useState("");
	const [slippage, setSlippage] = useState("1");

	const collateralValue = Number(collateral) || 0;
	const notional = collateralValue * leverage;

	// Mirrors the server-side check so the user sees the reason before signing
	// rather than after a revert.
	const validation = useMemo(
		() => validateOrder(market, { collateralUsdc: collateralValue, leverage }),
		[market, collateralValue, leverage],
	);

	const needsPrice = orderType !== "market";
	const priceMissing = needsPrice && !limitPrice;
	const canSubmit = isConnected && validation.ok && !priceMissing && !isBusy;

	async function handleSubmit() {
		try {
			const outcome = await open({
				symbol: market.symbol,
				side,
				collateralUsdc: collateralValue,
				leverage,
				orderType,
				openPrice: needsPrice ? Number(limitPrice) : undefined,
				takeProfit: takeProfit ? Number(takeProfit) : undefined,
				stopLoss: stopLoss ? Number(stopLoss) : undefined,
				slippagePercent: Number(slippage) || 1,
			});

			toast.success(
				orderType === "market"
					? `${side === "long" ? "Long" : "Short"} ${market.symbol} submitted${outcome.trackingId ? ` (${outcome.trackingId.slice(0, 8)})` : ""}`
					: `${orderType === "limit" ? "Limit" : "Stop-limit"} order placed on ${market.symbol}`,
			);
			onSubmitted?.();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Order failed");
		}
	}

	return (
		<div className="space-y-4 rounded-xl border-white/10 bg-white/[0.02] p-4 max-md:border-0 max-md:bg-transparent max-md:p-0 md:border">
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
					<TabsTrigger value="stop_limit" className="flex-1">
						Stop
					</TabsTrigger>
				</TabsList>
			</Tabs>

			<div className="space-y-2">
				<Label htmlFor="collateral">Collateral (USDC)</Label>
				<Input
					id="collateral"
					inputMode="decimal"
					value={collateral}
					onChange={(event) => setCollateral(event.target.value)}
					placeholder="100"
				/>
			</div>

			{needsPrice && (
				<div className="space-y-2">
					<Label htmlFor="limitPrice">
						{orderType === "limit" ? "Limit price" : "Trigger price"} (USD)
					</Label>
					<Input
						id="limitPrice"
						inputMode="decimal"
						value={limitPrice}
						onChange={(event) => setLimitPrice(event.target.value)}
						placeholder="0.00"
					/>
				</div>
			)}

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="leverage">Leverage</Label>
					<span className="font-mono text-sm text-lime-400">{leverage}x</span>
				</div>
				<Slider
					id="leverage"
					min={market.minLeverage}
					max={market.maxLeverage}
					step={1}
					value={[leverage]}
					onValueChange={([value]) => setLeverage(value)}
				/>
				<div className="flex justify-between text-[11px] text-gray-600">
					<span>{market.minLeverage}x</span>
					<span>{market.maxLeverage}x max</span>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-2">
					<Label htmlFor="tp">Take profit</Label>
					<Input
						id="tp"
						inputMode="decimal"
						value={takeProfit}
						onChange={(event) => setTakeProfit(event.target.value)}
						placeholder="optional"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="sl">Stop loss</Label>
					<Input
						id="sl"
						inputMode="decimal"
						value={stopLoss}
						onChange={(event) => setStopLoss(event.target.value)}
						placeholder="optional"
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="slippage">Max slippage (%)</Label>
				<Input
					id="slippage"
					inputMode="decimal"
					value={slippage}
					onChange={(event) => setSlippage(event.target.value)}
				/>
			</div>

			<dl className="space-y-1.5 rounded-lg border border-white/5 bg-black/20 p-3 text-xs">
				<div className="flex justify-between">
					<dt className="text-gray-500">Position size</dt>
					<dd className="font-mono">{formatUsd(notional)}</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-gray-500">Minimum size</dt>
					<dd className="font-mono text-gray-400">{formatUsd(market.minPositionUsdc)}</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-gray-500">Funding on this side (APR)</dt>
					<dd
						className={cn(
							"font-mono",
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

			{!validation.ok && (
				<Callout tone="warning">
					<ul className="list-inside list-disc space-y-0.5">
						{validation.errors.map((message) => (
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
				{!isConnected
					? "Connect wallet"
					: isBusy
						? stage === "signing"
							? "Sign in wallet…"
							: stage === "submitting"
								? "Submitting…"
								: "Working…"
						: `${side === "long" ? "Long" : "Short"} ${market.base}`}
			</Button>

			<p className="text-center text-[11px] text-gray-600">
				Gasless — you sign, Avantis submits and pays the gas.
			</p>
		</div>
	);
}
