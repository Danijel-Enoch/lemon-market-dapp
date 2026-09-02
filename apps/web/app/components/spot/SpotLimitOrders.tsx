import { EmptyPanel } from "@app/components/common/EmptyState";
import { Button } from "@app/components/ui/button";
import { useSpotLimitOrders } from "@app/hooks/useMarketData";
import { useSpotLimitOrder } from "@app/hooks/useSpotLimitOrder";
import { formatQuantity, fromBaseUnits, USDC_ADDRESS, USDC_DECIMALS } from "@lemon/core";
import { SPOT_TOKENS } from "@lemon/registry";
import { useQueryClient } from "@tanstack/react-query";
import { ListOrdered } from "lucide-react";
import toast from "react-hot-toast";
import { useConnection } from "wagmi";

function decimalsFor(address: string): { symbol: string; decimals: number } {
	if (address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
		return { symbol: "USDC", decimals: USDC_DECIMALS };
	}
	const token = SPOT_TOKENS.find(
		(candidate) => candidate.address.toLowerCase() === address.toLowerCase(),
	);
	return { symbol: token?.symbol ?? "?", decimals: token?.decimals ?? 18 };
}

export function SpotLimitOrders() {
	const { address } = useConnection();
	const queryClient = useQueryClient();
	const { data, isLoading } = useSpotLimitOrders(address);
	const { cancel, isBusy } = useSpotLimitOrder();

	async function handleCancel(orderId: number) {
		try {
			await cancel([orderId]);
			toast.success("Cancellation signed. It takes effect within a few minutes.");
			queryClient.invalidateQueries({ queryKey: ["spot-limit-orders"] });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Cancel failed");
		}
	}

	if (!address) return null;
	if (isLoading) {
		return <p className="py-4 text-center text-sm text-[var(--ink-2)]">Loading orders…</p>;
	}

	const orders = data?.orders ?? [];
	if (!orders.length) {
		return (
			<EmptyPanel icon={ListOrdered} title="No open limit orders">
				Signed limit orders rest off-chain until a taker fills them.
			</EmptyPanel>
		);
	}

	return (
		<div className="overflow-x-auto rounded-lg border border-[var(--line-soft)]">
			<table className="w-full min-w-[560px] text-sm">
				<thead className="border-b border-[var(--line-soft)] text-left t-caption text-[var(--ink-2)]">
					<tr>
						<th className="px-4 py-3 font-medium">Selling</th>
						<th className="px-4 py-3 font-medium">For</th>
						<th className="px-4 py-3 font-medium">Filled</th>
						<th className="px-4 py-3 font-medium">Expires</th>
						<th className="px-4 py-3" />
					</tr>
				</thead>
				<tbody className="divide-y divide-[var(--line-soft)]">
					{orders.map((order) => {
						const maker = decimalsFor(order.makerAsset);
						const taker = decimalsFor(order.takerAsset);
						const making = Number(fromBaseUnits(order.makingAmount, maker.decimals));
						const taking = Number(fromBaseUnits(order.takingAmount, taker.decimals));
						const filled = Number(fromBaseUnits(order.filledMakingAmount || "0", maker.decimals));

						return (
							<tr key={order.id}>
								<td className="px-4 py-3 font-fono">
									{formatQuantity(making, 4)} {maker.symbol}
								</td>
								<td className="px-4 py-3 font-fono">
									{formatQuantity(taking, 4)} {taker.symbol}
								</td>
								<td className="px-4 py-3 font-fono text-[var(--ink-2)]">
									{making > 0 ? `${((filled / making) * 100).toFixed(0)}%` : "0%"}
								</td>
								<td className="px-4 py-3 text-xs text-[var(--ink-2)]">
									{new Date(order.expiredAt * 1000).toLocaleString()}
								</td>
								<td className="px-4 py-3 text-right">
									<Button
										size="sm"
										variant="outline"
										disabled={isBusy}
										onClick={() => handleCancel(order.id)}
									>
										Cancel
									</Button>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
