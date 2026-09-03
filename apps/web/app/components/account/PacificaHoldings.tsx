import { EmptyPanel } from "@app/components/common/EmptyState";
import { Button } from "@app/components/ui/button";
import { usePacificaAccount, useRefreshAccount } from "@app/hooks/useAccount";
import { type PacificaOrderRow, type PacificaPositionRow, pacificaApi } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { formatUsd } from "@lemon/core";
import { useMutation } from "@tanstack/react-query";
import { Layers, Receipt } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Positions and resting orders on the Pacifica account.
 *
 * Pacifica reports sizes in base units of the market and prices separately, so
 * notional is computed here rather than read — there is no field for it.
 */

/** Pacifica's wire vocabulary is bid/ask; a trader reads long/short. */
function sideLabel(side: "bid" | "ask"): string {
	return side === "bid" ? "Long" : "Short";
}

function notional(amount: string, price: string): number {
	return Number(amount) * Number(price);
}

export function PacificaPositions() {
	const { data, isLoading } = usePacificaAccount();
	const refresh = useRefreshAccount();

	const close = useMutation({
		mutationFn: (symbol: string) => pacificaApi.closePosition({ symbol }),
		onSuccess: (_result, symbol) => {
			toast.success(`Closing ${symbol}`);
			refresh();
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Close failed"),
	});

	const positions = data?.positions ?? [];

	if (isLoading) {
		return <p className="py-6 text-center t-label text-[var(--ink-2)]">Loading positions…</p>;
	}

	if (!positions.length) {
		return (
			<EmptyPanel icon={Layers} title="No open positions">
				Positions you open on Pacifica appear here.
			</EmptyPanel>
		);
	}

	return (
		<div className="overflow-x-auto rounded-lg bg-[var(--surface-3)] scrollbar-hide">
			<table className="w-full min-w-[560px] t-label">
				<thead className="border-b border-[var(--line-soft)] text-left t-caption font-normal text-[var(--ink-2)]">
					<tr>
						<th className="px-3 py-2 font-normal">Market</th>
						<th className="px-3 py-2 font-normal">Side</th>
						<th className="px-3 py-2 font-normal">Size</th>
						<th className="px-3 py-2 font-normal">Entry</th>
						<th className="px-3 py-2 font-normal">Notional</th>
						<th className="px-3 py-2 font-normal">Margin</th>
						<th className="px-3 py-2 font-normal">Funding</th>
						<th className="px-3 py-2" />
					</tr>
				</thead>
				<tbody className="divide-y divide-[var(--line-soft)]">
					{positions.map((position: PacificaPositionRow) => (
						<tr key={`${position.symbol}-${position.side}`} className="hover:bg-[var(--surface-4)]">
							<td className="px-3 py-2.5 text-[var(--ink-1)]">{position.symbol}</td>
							<td
								className={cn(
									"px-3 py-2.5",
									position.side === "bid" ? "text-lime-400" : "text-red-400",
								)}
							>
								{sideLabel(position.side)}
							</td>
							<td className="px-3 py-2.5 font-fono text-[var(--ink-1)]">{position.amount}</td>
							<td className="px-3 py-2.5 font-fono text-[var(--ink-2)]">
								{formatUsd(Number(position.entry_price))}
							</td>
							<td className="px-3 py-2.5 font-fono text-[var(--ink-1)]">
								{formatUsd(notional(position.amount, position.entry_price))}
							</td>
							<td className="px-3 py-2.5 font-fono text-[var(--ink-2)]">
								{formatUsd(Number(position.margin))}
							</td>
							<td
								className={cn(
									"px-3 py-2.5 font-fono",
									Number(position.funding) >= 0 ? "text-lime-400" : "text-red-400",
								)}
							>
								{formatUsd(Number(position.funding))}
							</td>
							<td className="px-3 py-2.5 text-right">
								<Button
									size="sm"
									variant="outline"
									disabled={close.isPending}
									onClick={() => close.mutate(position.symbol)}
								>
									Close
								</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function PacificaOrders() {
	const { data, isLoading } = usePacificaAccount();
	const refresh = useRefreshAccount();

	const cancel = useMutation({
		mutationFn: (order: PacificaOrderRow) =>
			pacificaApi.cancelOrder({ symbol: order.symbol, orderId: order.order_id }),
		onSuccess: () => {
			toast.success("Order cancelled");
			refresh();
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Cancel failed"),
	});

	const orders = data?.orders ?? [];

	if (isLoading) return null;

	if (!orders.length) {
		return (
			<EmptyPanel icon={Receipt} title="No resting orders">
				Limit orders waiting to fill appear here.
			</EmptyPanel>
		);
	}

	return (
		<div className="overflow-x-auto rounded-lg bg-[var(--surface-3)] scrollbar-hide">
			<table className="w-full min-w-[520px] t-label">
				<thead className="border-b border-[var(--line-soft)] text-left t-caption font-normal text-[var(--ink-2)]">
					<tr>
						<th className="px-3 py-2 font-normal">Market</th>
						<th className="px-3 py-2 font-normal">Side</th>
						<th className="px-3 py-2 font-normal">Price</th>
						<th className="px-3 py-2 font-normal">Filled</th>
						<th className="px-3 py-2 font-normal">Type</th>
						<th className="px-3 py-2" />
					</tr>
				</thead>
				<tbody className="divide-y divide-[var(--line-soft)]">
					{orders.map((order) => (
						<tr key={order.order_id} className="hover:bg-[var(--surface-4)]">
							<td className="px-3 py-2.5 text-[var(--ink-1)]">{order.symbol}</td>
							<td
								className={cn(
									"px-3 py-2.5",
									order.side === "bid" ? "text-lime-400" : "text-red-400",
								)}
							>
								{sideLabel(order.side)}
							</td>
							<td className="px-3 py-2.5 font-fono text-[var(--ink-1)]">
								{formatUsd(Number(order.price))}
							</td>
							<td className="px-3 py-2.5 font-fono text-[var(--ink-2)]">
								{order.filled_amount} / {order.initial_amount}
							</td>
							<td className="px-3 py-2.5 t-caption text-[var(--ink-2)]">
								{order.reduce_only ? "Reduce only" : order.order_type}
							</td>
							<td className="px-3 py-2.5 text-right">
								<Button
									size="sm"
									variant="outline"
									disabled={cancel.isPending}
									onClick={() => cancel.mutate(order)}
								>
									Cancel
								</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
