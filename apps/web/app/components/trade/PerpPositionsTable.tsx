import { EmptyPanel } from "@app/components/common/EmptyState";
import { Button } from "@app/components/ui/button";
import { usePerpPositions } from "@app/hooks/useMarketData";
import { usePerpTrade } from "@app/hooks/usePerpTrade";
import { formatUsd } from "@lemon/core";
import { useQueryClient } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import toast from "react-hot-toast";
import { useConnection } from "wagmi";

export function PerpPositionsTable({ pairIndex }: { pairIndex?: number }) {
	const { address } = useConnection();
	const queryClient = useQueryClient();
	const { data, isLoading } = usePerpPositions(address);
	const { close, cancelLimitOrder, isBusy } = usePerpTrade();

	const positions = (data?.positions ?? []).filter(
		(position) => pairIndex === undefined || position.pairIndex === pairIndex,
	);
	const orders = (data?.orders ?? []).filter(
		(order) => pairIndex === undefined || order.pairIndex === pairIndex,
	);

	function refresh() {
		queryClient.invalidateQueries({ queryKey: ["perp-positions"] });
	}

	async function handleClose(position: (typeof positions)[number]) {
		try {
			await close({
				pairIndex: position.pairIndex,
				index: position.index,
				collateralToCloseUsdc: position.collateralUsdc,
			});
			toast.success(`Closing ${position.symbol}`);
			refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Close failed");
		}
	}

	async function handleCancel(order: (typeof orders)[number]) {
		try {
			await cancelLimitOrder({ pairIndex: order.pairIndex, index: order.index });
			toast.success("Order cancelled — collateral refunded");
			refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Cancel failed");
		}
	}

	if (!address) {
		return <EmptyPanel icon={Layers} title="Connect a wallet to see your positions" />;
	}
	if (isLoading) {
		return <p className="py-6 text-center text-sm text-gray-500">Loading positions…</p>;
	}
	if (!positions.length && !orders.length) {
		return (
			<EmptyPanel icon={Layers} title="No open positions">
				Positions and resting orders will appear here once you trade.
			</EmptyPanel>
		);
	}

	return (
		<div className="space-y-6">
			{/* Mobile: one card per position instead of a sideways-scrolling row. */}
			{positions.length > 0 && (
				<ul className="space-y-2 md:hidden">
					{positions.map((position) => (
						<li
							key={`m-${position.pairIndex}-${position.index}`}
							className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
						>
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="font-medium">{position.symbol}</p>
									<p
										className={
											position.side === "long" ? "text-xs text-lime-400" : "text-xs text-red-400"
										}
									>
										{position.side} {position.leverage}x
									</p>
								</div>
								<Button
									size="sm"
									variant="outline"
									disabled={isBusy}
									onClick={() => handleClose(position)}
								>
									Close
								</Button>
							</div>
							<dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
								<div>
									<dt className="text-gray-600">Size</dt>
									<dd className="font-mono">{formatUsd(position.notionalUsdc)}</dd>
								</div>
								<div className="text-right">
									<dt className="text-gray-600">Collateral</dt>
									<dd className="font-mono text-gray-400">{formatUsd(position.collateralUsdc)}</dd>
								</div>
								<div>
									<dt className="text-gray-600">Entry</dt>
									<dd className="font-mono text-gray-400">{formatUsd(position.openPrice)}</dd>
								</div>
								<div className="text-right">
									<dt className="text-gray-600">Liquidation</dt>
									<dd className="font-mono text-amber-400/80">
										{position.liquidationPrice ? formatUsd(position.liquidationPrice) : "—"}
									</dd>
								</div>
							</dl>
						</li>
					))}
				</ul>
			)}

			{positions.length > 0 && (
				<div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
					<table className="w-full min-w-[680px] text-sm">
						<thead className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-gray-500">
							<tr>
								<th className="px-4 py-3 font-medium">Market</th>
								<th className="px-4 py-3 font-medium">Side</th>
								<th className="px-4 py-3 font-medium">Size</th>
								<th className="px-4 py-3 font-medium">Collateral</th>
								<th className="px-4 py-3 font-medium">Entry</th>
								<th className="px-4 py-3 font-medium">Liquidation</th>
								<th className="px-4 py-3" />
							</tr>
						</thead>
						<tbody className="divide-y divide-white/5">
							{positions.map((position) => (
								<tr key={`${position.pairIndex}-${position.index}`}>
									<td className="px-4 py-3 font-medium">{position.symbol}</td>
									<td className="px-4 py-3">
										<span className={position.side === "long" ? "text-lime-400" : "text-red-400"}>
											{position.side} {position.leverage}x
										</span>
									</td>
									<td className="px-4 py-3 font-mono">{formatUsd(position.notionalUsdc)}</td>
									<td className="px-4 py-3 font-mono text-gray-400">
										{formatUsd(position.collateralUsdc)}
									</td>
									<td className="px-4 py-3 font-mono text-gray-400">
										{formatUsd(position.openPrice)}
									</td>
									<td className="px-4 py-3 font-mono text-amber-400/80">
										{position.liquidationPrice ? formatUsd(position.liquidationPrice) : "—"}
									</td>
									<td className="px-4 py-3 text-right">
										<Button
											size="sm"
											variant="outline"
											disabled={isBusy}
											onClick={() => handleClose(position)}
										>
											Close
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{orders.length > 0 && (
				<div className="space-y-2">
					<h3 className="text-sm font-medium text-gray-300">Resting orders</h3>
					<div className="overflow-x-auto rounded-xl border border-white/10">
						<table className="w-full min-w-[520px] text-sm">
							<thead className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-gray-500">
								<tr>
									<th className="px-4 py-3 font-medium">Market</th>
									<th className="px-4 py-3 font-medium">Type</th>
									<th className="px-4 py-3 font-medium">Side</th>
									<th className="px-4 py-3 font-medium">Trigger</th>
									<th className="px-4 py-3 font-medium">Size</th>
									<th className="px-4 py-3" />
								</tr>
							</thead>
							<tbody className="divide-y divide-white/5">
								{orders.map((order) => (
									<tr key={`${order.pairIndex}-${order.index}`}>
										<td className="px-4 py-3 font-medium">{order.symbol}</td>
										<td className="px-4 py-3 text-gray-400">{order.orderType.replace("_", "-")}</td>
										<td className="px-4 py-3">
											<span className={order.side === "long" ? "text-lime-400" : "text-red-400"}>
												{order.side}
											</span>
										</td>
										<td className="px-4 py-3 font-mono">{formatUsd(order.triggerPrice)}</td>
										<td className="px-4 py-3 font-mono text-gray-400">
											{formatUsd(order.collateralUsdc * order.leverage)}
										</td>
										<td className="px-4 py-3 text-right">
											<Button
												size="sm"
												variant="outline"
												disabled={isBusy}
												onClick={() => handleCancel(order)}
											>
												Cancel
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
