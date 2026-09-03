import { Callout } from "@app/components/common/Callout";
import { DetailRow } from "@app/components/pons/Feed";
import { ChipGroup } from "@app/components/pons/Segmented";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { useSpotLimitOrder } from "@app/hooks/useSpotLimitOrder";
import { useSpotSwap } from "@app/hooks/useSpotSwap";
import { type SpotQuoteResult, spotApi } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import type { SpotTokenInfo } from "@lemon/core";
import { formatPercent, formatQuantity, fromBaseUnits } from "@lemon/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { useConnection } from "wagmi";

type Mode = "market" | "limit";

/** The notionals a spot buy is usually written for. */
const QUICK_SPEND = ["50", "100", "500", "1000"] as const;

export function SpotTradePanel({ token }: { token: SpotTokenInfo }) {
	const { isConnected } = useConnection();
	const queryClient = useQueryClient();
	const swap = useSpotSwap();
	const limit = useSpotLimitOrder();

	const [mode, setMode] = useState<Mode>("market");
	const [direction, setDirection] = useState<"buy" | "sell">(token.buyable ? "buy" : "sell");
	const [amount, setAmount] = useState("100");
	const [slippage, setSlippage] = useState("1");
	const [limitPrice, setLimitPrice] = useState("");
	const [limitShares, setLimitShares] = useState("1");
	const [expiryHours, setExpiryHours] = useState("24");

	const routeAvailable = direction === "buy" ? token.buyable : token.sellable;

	// Live quote, refreshed while the user is deciding. Debounced by the query
	// key so each keystroke does not fire an aggregator call.
	const { data: quote, isFetching } = useQuery({
		queryKey: ["spot-quote", token.symbol, direction, amount, slippage],
		queryFn: () =>
			spotApi.quote({
				symbol: token.symbol,
				direction,
				amount,
				slippagePercent: Number(slippage) || 1,
			}),
		enabled: mode === "market" && routeAvailable && Number(amount) > 0,
		refetchInterval: 15_000,
		staleTime: 10_000,
	});

	const okQuote = quote?.ok ? (quote as Extract<SpotQuoteResult, { ok: true }>) : null;
	const receiveAmount = okQuote
		? fromBaseUnits(okQuote.quote.amountOut, direction === "buy" ? token.decimals : 6)
		: null;

	async function handleSwap() {
		try {
			const result = await swap.swap({
				token,
				direction,
				amount,
				slippagePercent: Number(slippage) || 1,
				quote: okQuote ?? undefined,
			});
			if (result) {
				toast.success(
					`${direction === "buy" ? "Bought" : "Sold"} ${token.symbol} — ${result.txHash.slice(0, 10)}…`,
				);
				queryClient.invalidateQueries({ queryKey: ["spot-quote"] });
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Swap failed");
		}
	}

	async function handleLimit() {
		try {
			const order = await limit.place({
				symbol: token.symbol,
				direction,
				shares: limitShares,
				limitPrice,
				expiresInHours: Number(expiryHours) || 24,
			});
			toast.success(`Limit order #${order.id} placed`);
			queryClient.invalidateQueries({ queryKey: ["spot-limit-orders"] });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not place order");
		}
	}

	return (
		<div className="space-y-4 rounded-[var(--pon-r-md)] border-[var(--pon-line)] bg-[var(--pon-surface)] p-4 max-md:border-0 max-md:bg-transparent max-md:p-0 md:border">
			<Tabs value={direction} onValueChange={(value) => setDirection(value as "buy" | "sell")}>
				<TabsList className="w-full">
					<TabsTrigger value="buy" className="flex-1 data-[state=active]:text-[var(--pon-lime)]">
						Buy
					</TabsTrigger>
					<TabsTrigger value="sell" className="flex-1 data-[state=active]:text-[var(--pon-down)]">
						Sell
					</TabsTrigger>
				</TabsList>
			</Tabs>

			<Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
				<TabsList className="w-full">
					<TabsTrigger value="market" className="flex-1">
						Market
					</TabsTrigger>
					<TabsTrigger value="limit" className="flex-1">
						Limit
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{!routeAvailable && (
				<Callout tone="warning" title={`No ${direction} route`}>
					{token.symbol} has no {direction === "buy" ? "buy-side" : "sell-side"} liquidity on Base
					right now. This reflects live pool state and can change without notice.
				</Callout>
			)}

			{mode === "market" ? (
				<>
					<div className="space-y-2">
						<Label htmlFor="amount">
							{direction === "buy" ? "Spend (USDC)" : `Sell (${token.symbol})`}
						</Label>
						<Input
							id="amount"
							inputMode="decimal"
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
						/>
						{/* Presets only on the buy side — a sell is sized in shares held,
						    which no fixed list can guess. */}
						{direction === "buy" && (
							<ChipGroup
								options={QUICK_SPEND}
								value={amount}
								onChange={setAmount}
								aria-label="Quick spend amount"
							/>
						)}
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

					<dl className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-2">
						<DetailRow
							label="You receive"
							value={
								isFetching && !receiveAmount
									? "…"
									: receiveAmount
										? `${formatQuantity(Number(receiveAmount), 6)} ${direction === "buy" ? token.symbol : "USDC"}`
										: "—"
							}
						/>
						{/* Impact on these pools runs over 1% even on small size, so it is
						    shown as a headline number, not a footnote. */}
						<DetailRow
							label="Price impact"
							value={okQuote ? formatPercent(okQuote.quote.priceImpactPercent) : "—"}
							tone={(okQuote?.quote.priceImpactPercent ?? 0) < -1 ? "negative" : "neutral"}
						/>
						{/* Spot is an outright purchase: no funding, no borrow, no
						    counterparty. Said explicitly because the perp panel one toggle
						    away does show a funding rate. */}
						<DetailRow label="Holding cost" value="None — spot has no funding" />
						<DetailRow label="Route" value={okQuote?.quote.exchanges.join(", ") || "—"} />
					</dl>

					<Button
						type="button"
						onClick={handleSwap}
						disabled={!isConnected || !routeAvailable || !okQuote || swap.isBusy}
						size="lg"
						className={cn(
							"w-full rounded-[var(--pon-r-sm)] font-bold",
							direction === "buy"
								? "bg-[var(--pon-lime)] text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]"
								: "bg-[var(--pon-down)] text-white hover:bg-[var(--pon-down)]/85",
						)}
					>
						{!isConnected
							? "Connect wallet"
							: swap.isBusy
								? swap.stage === "approving"
									? "Approving…"
									: swap.stage === "confirming"
										? "Confirming…"
										: "Working…"
								: `${direction === "buy" ? "Buy" : "Sell"} ${token.symbol}`}
					</Button>
				</>
			) : (
				<>
					<div className="space-y-2">
						<Label htmlFor="limitShares">Shares ({token.symbol})</Label>
						<Input
							id="limitShares"
							inputMode="decimal"
							value={limitShares}
							onChange={(event) => setLimitShares(event.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="limitPrice">Limit price (USDC per share)</Label>
						<Input
							id="limitPrice"
							inputMode="decimal"
							value={limitPrice}
							onChange={(event) => setLimitPrice(event.target.value)}
							placeholder="0.00"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="expiry">Expires in (hours)</Label>
						<Input
							id="expiry"
							inputMode="numeric"
							value={expiryHours}
							onChange={(event) => setExpiryHours(event.target.value)}
						/>
					</div>

					<dl className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-2">
						<DetailRow
							label="Total"
							value={
								Number(limitShares) > 0 && Number(limitPrice) > 0
									? `${(Number(limitShares) * Number(limitPrice)).toFixed(2)} USDC`
									: "—"
							}
						/>
					</dl>

					<Callout tone="info">
						Limit orders are signed off-chain and cost no gas, but only fill if a taker takes them.
						On thin pools an order can rest unfilled until it expires.
					</Callout>

					<Button
						type="button"
						onClick={handleLimit}
						disabled={!isConnected || limit.isBusy || !Number(limitPrice) || !Number(limitShares)}
						size="lg"
						className="w-full rounded-[var(--pon-r-sm)] bg-[var(--pon-lime)] font-bold text-[var(--pon-on-lime)] hover:bg-[var(--pon-lime-2)]"
					>
						{!isConnected
							? "Connect wallet"
							: limit.isBusy
								? limit.stage === "approving"
									? "Approving…"
									: "Signing…"
								: `Place ${direction} limit order`}
					</Button>
				</>
			)}
		</div>
	);
}
