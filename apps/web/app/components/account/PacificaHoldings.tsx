import { EmptyPanel } from "@app/components/common/EmptyState";
import { Button } from "@app/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@app/components/ui/table";
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
		return (
			<p className="py-6 text-center text-[13px] text-[var(--pon-fg-3)]">Loading positions…</p>
		);
	}

	if (!positions.length) {
		return (
			<EmptyPanel icon={Layers} title="No open positions">
				Positions you open on Pacifica appear here.
			</EmptyPanel>
		);
	}

	return (
		<div className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4">
			<Table className="min-w-[560px]">
				<TableHeader>
					<TableRow>
						<TableHead>Market</TableHead>
						<TableHead>Side</TableHead>
						<TableHead className="text-right">Size</TableHead>
						<TableHead className="text-right">Entry</TableHead>
						<TableHead className="text-right">Notional</TableHead>
						<TableHead className="text-right">Margin</TableHead>
						<TableHead className="text-right">Funding</TableHead>
						<TableHead className="text-right" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{positions.map((position: PacificaPositionRow) => (
						<TableRow key={`${position.symbol}-${position.side}`}>
							<TableCell className="font-semibold">{position.symbol}</TableCell>
							<TableCell
								className={cn(
									"font-semibold",
									position.side === "bid" ? "text-[var(--pon-up)]" : "text-[var(--pon-down)]",
								)}
							>
								{sideLabel(position.side)}
							</TableCell>
							<TableCell className="font-fono text-right">{position.amount}</TableCell>
							<TableCell className="font-fono text-right text-[var(--pon-fg-2)]">
								{formatUsd(Number(position.entry_price))}
							</TableCell>
							<TableCell className="font-fono text-right">
								{formatUsd(notional(position.amount, position.entry_price))}
							</TableCell>
							<TableCell className="font-fono text-right text-[var(--pon-fg-2)]">
								{formatUsd(Number(position.margin))}
							</TableCell>
							<TableCell
								className={cn(
									"font-fono text-right",
									Number(position.funding) >= 0 ? "text-[var(--pon-up)]" : "text-[var(--pon-down)]",
								)}
							>
								{formatUsd(Number(position.funding))}
							</TableCell>
							<TableCell className="text-right">
								<Button
									size="sm"
									variant="outline"
									disabled={close.isPending}
									onClick={() => close.mutate(position.symbol)}
								>
									Close
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
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
		<div className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4">
			<Table className="min-w-[520px]">
				<TableHeader>
					<TableRow>
						<TableHead>Market</TableHead>
						<TableHead>Side</TableHead>
						<TableHead className="text-right">Price</TableHead>
						<TableHead className="text-right">Filled</TableHead>
						<TableHead className="text-right">Type</TableHead>
						<TableHead className="text-right" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{orders.map((order) => (
						<TableRow key={order.order_id}>
							<TableCell className="font-semibold">{order.symbol}</TableCell>
							<TableCell
								className={cn(
									"font-semibold",
									order.side === "bid" ? "text-[var(--pon-up)]" : "text-[var(--pon-down)]",
								)}
							>
								{sideLabel(order.side)}
							</TableCell>
							<TableCell className="font-fono text-right">
								{formatUsd(Number(order.price))}
							</TableCell>
							<TableCell className="font-fono text-right text-[var(--pon-fg-2)]">
								{order.filled_amount} / {order.initial_amount}
							</TableCell>
							<TableCell className="text-right t-caption text-[var(--pon-fg-2)]">
								{order.reduce_only ? "Reduce only" : order.order_type}
							</TableCell>
							<TableCell className="text-right">
								<Button
									size="sm"
									variant="outline"
									disabled={cancel.isPending}
									onClick={() => cancel.mutate(order)}
								>
									Cancel
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
