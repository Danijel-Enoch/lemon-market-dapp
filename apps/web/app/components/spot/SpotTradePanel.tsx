import { Callout } from "@app/components/common/Callout";
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
		<div className="space-y-4 rounded-xl border-white/10 bg-white/[0.02] p-4 max-md:border-0 max-md:bg-transparent max-md:p-0 md:border">
			<Tabs value={direction} onValueChange={(value) => setDirection(value as "buy" | "sell")}>
				<TabsList className="w-full">
					<TabsTrigger value="buy" className="flex-1 data-[state=active]:text-lime-400">
						Buy
					</TabsTrigger>
					<TabsTrigger value="sell" className="flex-1 data-[state=active]:text-red-400">
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
							<dt className="text-gray-500">You receive</dt>
							<dd className="font-mono">
								{isFetching && !receiveAmount
									? "…"
									: receiveAmount
										? `${formatQuantity(Number(receiveAmount), 6)} ${direction === "buy" ? token.symbol : "USDC"}`
										: "—"}
							</dd>
						</div>
						<div className="flex justify-between">
							<dt className="text-gray-500">Price impact</dt>
							{/* Impact on these pools runs over 1% even on small size,
							    so it is shown as a headline number, not a footnote. */}
							<dd
								className={cn(
									"font-mono",
									(okQuote?.quote.priceImpactPercent ?? 0) < -1
										? "text-amber-400"
										: "text-gray-300",
								)}
							>
								{okQuote ? formatPercent(okQuote.quote.priceImpactPercent) : "—"}
							</dd>
						</div>
						<div className="flex justify-between">
							<dt className="text-gray-500">Holding cost</dt>
							{/* Spot is an outright purchase: no funding, no borrow, no
							    counterparty. Said explicitly because the perp panel one
							    toggle away does show a funding rate. */}
							<dd className="text-gray-400">None — spot has no funding</dd>
						</div>
						<div className="flex justify-between">
							<dt className="text-gray-500">Route</dt>
							<dd className="font-mono text-[11px] text-gray-500">
								{okQuote?.quote.exchanges.join(", ") || "—"}
							</dd>
						</div>
					</dl>

					<Button
						type="button"
						onClick={handleSwap}
						disabled={!isConnected || !routeAvailable || !okQuote || swap.isBusy}
						className={cn(
							"w-full font-semibold",
							direction === "buy"
								? "bg-lime-500 text-black hover:bg-lime-400"
								: "bg-red-500 text-white hover:bg-red-400",
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

					<dl className="flex justify-between rounded-lg border border-white/5 bg-black/20 p-3 text-xs">
						<dt className="text-gray-500">Total</dt>
						<dd className="font-mono">
							{Number(limitShares) > 0 && Number(limitPrice) > 0
								? `${(Number(limitShares) * Number(limitPrice)).toFixed(2)} USDC`
								: "—"}
						</dd>
					</dl>

					<Callout tone="info">
						Limit orders are signed off-chain and cost no gas, but only fill if a taker takes them.
						On thin pools an order can rest unfilled until it expires.
					</Callout>

					<Button
						type="button"
						onClick={handleLimit}
						disabled={!isConnected || limit.isBusy || !Number(limitPrice) || !Number(limitShares)}
						className="w-full bg-lime-500 font-semibold text-black hover:bg-lime-400"
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
