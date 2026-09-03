import { FundingPanel } from "@app/components/account/FundingPanel";
import { BuilderApprovalNotice, OnboardingPanel } from "@app/components/account/OnboardingPanel";
import { PacificaOrders, PacificaPositions } from "@app/components/account/PacificaHoldings";
import { CarryPositionList } from "@app/components/carry/CarryPositionList";
import { Callout } from "@app/components/common/Callout";
import { EmptyPanel } from "@app/components/common/EmptyState";
import { StatTile } from "@app/components/common/StatTile";
import { PageHeader, SubHeading } from "@app/components/site/PageHeader";
import { SpotLimitOrders } from "@app/components/spot/SpotLimitOrders";
import { useOnboarding, usePacificaAccount, useSessionWalletGuard } from "@app/hooks/useAccount";
import { useCarryAttention, useSpotTokens } from "@app/hooks/useMarketData";
import { erc20Abi } from "@app/lib/erc20";
import { formatQuantity, formatUsd, fromBaseUnits, USDC_ADDRESS } from "@lemon/core";
import { Briefcase, Wallet } from "lucide-react";
import { Link, type MetaFunction } from "react-router";
import { useConnection, useReadContract, useReadContracts } from "wagmi";

export const meta: MetaFunction = () => [
	{ title: "Accounts — Lemon Markets" },
	{ name: "description", content: "Your Pacifica trading account and connected wallet." },
];

/**
 * Accounts.
 *
 * Two accounts, side by side and never merged:
 *
 *   * **Pacifica** — where positions live. Funded through this page; the wallet
 *     that holds it is derived and managed by the app.
 *   * **Connected wallet** — what the user holds themselves, on Base.
 *
 * The derived EVM and Solana wallets sitting between the two are deliberately
 * absent. They are an implementation detail of custody, and showing them would
 * invite deposits straight to an address that credits nothing.
 */
export default function AccountsPage() {
	const { address, isConnected } = useConnection();
	const { step, account } = useOnboarding();
	const { data: pacifica } = usePacificaAccount();
	const { data: spotTokens } = useSpotTokens();
	const { data: attention } = useCarryAttention(address);

	// A session that outlives a wallet switch would show one wallet's balances
	// beside another's positions.
	useSessionWalletGuard();

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

	const walletUsdc = usdcBalance ? Number(fromBaseUnits(usdcBalance as bigint, 6)) : 0;
	const needsAttention = attention?.positions ?? [];
	const equity = Number(pacifica?.account?.account_equity ?? 0);

	return (
		<div className="space-y-10">
			<PageHeader
				title="Accounts"
				description="Your Pacifica trading account and the wallet you connected with, in one place."
			/>

			{/* Unhedged carries are live directional risk; they come first. */}
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

			<BuilderApprovalNotice />

			{step !== "ready" ? (
				<OnboardingPanel />
			) : (
				<section className="space-y-4">
					<SubHeading title="Pacifica account" />

					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<StatTile label="Equity" value={formatUsd(equity)} />
						<StatTile
							label="Available"
							value={formatUsd(Number(pacifica?.account?.available_to_spend ?? 0))}
						/>
						<StatTile
							label="Margin used"
							value={formatUsd(Number(pacifica?.account?.total_margin_used ?? 0))}
						/>
						<StatTile
							label="In transit"
							value={formatUsd(pacifica?.pendingUsdc ?? 0)}
							hint={pacifica?.pendingUsdc ? "Bridged, not yet credited" : undefined}
							tone={pacifica?.pendingUsdc ? "positive" : "neutral"}
						/>
					</div>

					{account && (
						<p className="t-micro text-[var(--ink-2)]">
							Account <span className="font-fono">{account.pacificaAccount}</span>
						</p>
					)}

					<FundingPanel />

					<div className="space-y-3">
						<SubHeading title="Positions" />
						<PacificaPositions />
					</div>

					<div className="space-y-3">
						<SubHeading title="Resting orders" />
						<PacificaOrders />
					</div>
				</section>
			)}

			<section className="space-y-4">
				<SubHeading title="Connected wallet" />

				{!isConnected ? (
					<EmptyPanel icon={Wallet} title="No wallet connected">
						Connect a wallet to see what you hold on Base.
					</EmptyPanel>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
							<StatTile label="USDC on Base" value={formatUsd(walletUsdc)} />
							<StatTile label="Stock holdings" value={holdings.length} />
						</div>

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
											<tr
												key={token.symbol}
												className="transition-colors hover:bg-[var(--surface-4)]"
											>
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
					</>
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
