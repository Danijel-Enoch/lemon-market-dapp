import { CarryPositionList } from "@app/components/carry/CarryPositionList";
import { Callout } from "@app/components/common/Callout";
import { EmptyPanel } from "@app/components/common/EmptyState";
import { StatTile } from "@app/components/common/StatTile";
import { PageHeader, SubHeading } from "@app/components/site/PageHeader";
import { SpotLimitOrders } from "@app/components/spot/SpotLimitOrders";
import { PerpPositionsTable } from "@app/components/trade/PerpPositionsTable";
import { ConnectWallet } from "@app/components/ui/ConnectWallet";
import { useCarryAttention, usePerpPositions, useSpotTokens } from "@app/hooks/useMarketData";
import { erc20Abi } from "@app/lib/erc20";
import { formatQuantity, formatUsd, fromBaseUnits, USDC_ADDRESS } from "@lemon/core";
import { Briefcase } from "lucide-react";
import { Link, type MetaFunction } from "react-router";
import { useConnection, useReadContract, useReadContracts } from "wagmi";

export const meta: MetaFunction = () => [
	{ title: "Portfolio — Lemon Markets" },
	{ name: "description", content: "Your perps, spot balances and carry positions on Base." },
];

export default function PortfolioPage() {
	const { address, isConnected } = useConnection();
	const { data: perps } = usePerpPositions(address);
	const { data: spotTokens } = useSpotTokens();
	const { data: attention } = useCarryAttention(address);

	const { data: usdcBalance } = useReadContract({
		address: USDC_ADDRESS,
		abi: erc20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: Boolean(address) },
	});

	// One multicall for every stock-token balance, rather than 13 round trips.
	const { data: tokenBalances } = useReadContracts({
		contracts: (spotTokens?.tokens ?? []).map((token) => ({
			address: token.address,
			abi: erc20Abi,
			functionName: "balanceOf" as const,
			args: address ? [address] : undefined,
		})),
		query: { enabled: Boolean(address) && Boolean(spotTokens?.tokens.length) },
	});

	const holdings = (spotTokens?.tokens ?? [])
		.map((token, index) => {
			const raw = tokenBalances?.[index]?.result as bigint | undefined;
			const amount = raw ? Number(fromBaseUnits(raw, token.decimals)) : 0;
			return { token, amount };
		})
		.filter((holding) => holding.amount > 0);

	if (!isConnected) {
		return (
			<EmptyPanel icon={Briefcase} title="Connect your wallet" action={<ConnectWallet />}>
				Your positions, balances and carry strategies will appear here.
			</EmptyPanel>
		);
	}

	const totalNotional = (perps?.positions ?? []).reduce(
		(sum, position) => sum + position.notionalUsdc,
		0,
	);
	const usdc = usdcBalance ? Number(fromBaseUnits(usdcBalance as bigint, 6)) : 0;
	const needsAttention = attention?.positions ?? [];

	return (
		<div className="space-y-10">
			<PageHeader
				title="Portfolio"
				description="Every position, balance and open order you hold on Base — perps, spot and carry in one place."
			/>

			{/* Unhedged carries are surfaced first — they are live directional risk. */}
			{needsAttention.length > 0 && (
				<Callout tone="danger" title={`${needsAttention.length} position needs attention`}>
					<ul className="space-y-1">
						{needsAttention.map(({ position }) => (
							<li key={position.id}>
								<Link to={`/carry/${position.id}`} className="underline">
									{position.tokenSymbol} / {position.avantisSymbol}
								</Link>{" "}
								is only half-open and is not hedged.
							</li>
						))}
					</ul>
				</Callout>
			)}

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatTile label="USDC" value={formatUsd(usdc)} />
				<StatTile label="Perp notional" value={formatUsd(totalNotional)} />
				<StatTile label="Open positions" value={perps?.positions.length ?? 0} />
				<StatTile label="Stock holdings" value={holdings.length} />
			</div>

			<section className="space-y-3">
				<SubHeading title="Perp positions" />
				<PerpPositionsTable />
			</section>

			<section className="space-y-3">
				<SubHeading title="Spot holdings" />
				{holdings.length === 0 ? (
					<EmptyPanel icon={Briefcase} title="No tokenized stocks held">
						<Link to="/spot" className="underline">
							Browse spot markets
						</Link>
					</EmptyPanel>
				) : (
					<div className="overflow-x-auto rounded-lg bg-[var(--surface-3)] scrollbar-hide">
						<table className="w-full min-w-[420px] t-label">
							<thead className="border-b border-[var(--line-soft)] text-left t-caption font-normal text-[var(--ink-2)]">
								<tr>
									<th className="px-3 py-2 font-normal">Token</th>
									<th className="px-3 py-2 font-normal">Shares</th>
									<th className="px-3 py-2 font-normal">Perp</th>
									<th className="px-3 py-2" />
								</tr>
							</thead>
							<tbody className="divide-y divide-[var(--line-soft)]">
								{holdings.map(({ token, amount }) => (
									<tr key={token.symbol} className="transition-colors hover:bg-[var(--surface-4)]">
										<td className="px-3 py-2.5">
											<Link
												to={`/spot/${token.symbol}`}
												className="text-[var(--ink-1)] transition-colors hover:text-lime-400"
											>
												{token.symbol}
											</Link>
										</td>
										<td className="px-3 py-2.5 font-fono text-[var(--ink-1)]">
											{formatQuantity(amount, 6)}
										</td>
										<td className="px-3 py-2.5 font-fono text-[var(--ink-2)]">
											{token.avantisSymbol ?? "—"}
										</td>
										<td className="px-3 py-2.5 text-right">
											<Link to="/carry" className="t-caption text-lime-400 hover:underline">
												Hedge it
											</Link>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<section className="space-y-3">
				<SubHeading title="Spot limit orders" />
				<SpotLimitOrders />
			</section>

			<section className="space-y-3">
				<SubHeading title="Cash & carry" />
				<CarryPositionList />
			</section>
		</div>
	);
}
