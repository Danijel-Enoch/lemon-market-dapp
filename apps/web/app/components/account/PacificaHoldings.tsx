import { EmptyPanel } from "@app/components/common/EmptyState";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@app/components/ui/table";
import { usePacificaAccount } from "@app/hooks/useAccount";
import type { PacificaPositionRow } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { formatUsd } from "@lemon/core";
import { Layers, Receipt } from "lucide-react";

/**
 * Positions and resting orders on the Pacifica account.
 *
 * Read-only, deliberately. Every perp here is the short leg of a basis
 * position, and Pacifica nets positions per symbol — so a "close" button on
 * this table would flatten one half of a delta-neutral position while the
 * position record went on describing it as hedged. Closing happens from the
 * position, which closes both legs together and records what happened.
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

	const positions = data?.positions ?? [];

	if (isLoading) {
		return (
			<p className="py-6 text-center text-[13px] text-[var(--pon-fg-3)]">Loading positions…</p>
		);
	}

	if (!positions.length) {
		return (
			<EmptyPanel icon={Layers} title="No open short legs">
				The perp half of each basis position you open appears here.
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
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

export function PacificaOrders() {
	const { data, isLoading } = usePacificaAccount();

	const orders = data?.orders ?? [];

	if (isLoading) return null;

	if (!orders.length) {
		return (
			<EmptyPanel icon={Receipt} title="No resting orders">
				Hedge legs are placed at market, so this is normally empty. Anything resting here was placed
				outside the app.
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
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
