import { FundingPanel } from "@app/components/account/FundingPanel";
import { BuilderApprovalNotice, OnboardingPanel } from "@app/components/account/OnboardingPanel";
import { PacificaOrders, PacificaPositions } from "@app/components/account/PacificaHoldings";
import { PositionList } from "@app/components/basis/PositionList";
import { Callout } from "@app/components/common/Callout";
import { EmptyPanel } from "@app/components/common/EmptyState";
import { StatTile } from "@app/components/common/StatTile";
import { StatCard } from "@app/components/pons/StatCard";
import { PageHeader, SubHeading } from "@app/components/site/PageHeader";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@app/components/ui/table";
import { useOnboarding, usePacificaAccount, useSessionWalletGuard } from "@app/hooks/useAccount";
import { useBasisAttention, useBasisMarkets } from "@app/hooks/useMarketData";
import { erc20Abi } from "@app/lib/erc20";
import { formatQuantity, formatUsd, fromBaseUnits, USDC_ADDRESS } from "@lemon/core";
import { Briefcase, Wallet } from "lucide-react";
import { Link, type MetaFunction } from "react-router";
import { useConnection, useReadContract, useReadContracts } from "wagmi";

export const meta: MetaFunction = () => [
	{ title: "Accounts — Lemon" },
	{ name: "description", content: "Your Pacifica trading account and connected wallet." },
];

/**
 * Accounts.
 *
 * Two accounts, side by side and never merged:
 *
 *   * **Pacifica** — where the short legs live. Funded through this page; the
 *     wallet that holds it is derived and managed by the app.
 *   * **Connected wallet** — what the user holds themselves, on Base, which is
 *     where the long legs sit.
 *
 * The derived EVM and Solana wallets sitting between the two are deliberately
 * absent. They are an implementation detail of custody, and showing them would
 * invite deposits straight to an address that credits nothing.
 */
export default function AccountsPage() {
	const { address, isConnected } = useConnection();
	const { step, account } = useOnboarding();
	const { data: pacifica } = usePacificaAccount();
	const { data: board } = useBasisMarkets();
	const { data: attention } = useBasisAttention(address);

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

	const markets = board?.markets ?? [];

	// One multicall for every spot leg's balance, rather than a round trip each.
	const { data: tokenBalances } = useReadContracts({
		contracts: markets.map((market) => ({
			address: market.spot.address,
			abi: erc20Abi,
			functionName: "balanceOf" as const,
			args: address ? [address] : undefined,
		})),
		query: { enabled: Boolean(address) && markets.length > 0 },
	});

	const holdings = markets
		.map((market, index) => {
			const raw = tokenBalances?.[index]?.result as bigint | undefined;
			const amount = raw ? Number(fromBaseUnits(raw, market.spot.decimals)) : 0;
			return { market, amount };
		})
		.filter((holding) => holding.amount > 0);

	const walletUsdc = usdcBalance ? Number(fromBaseUnits(usdcBalance as bigint, 6)) : 0;
	const needsAttention = attention?.positions ?? [];
	const equity = Number(pacifica?.account?.account_equity ?? 0);

	return (
		<div className="space-y-10">
			<PageHeader
				eyebrow="Account"
				title="Accounts"
				description="Your Pacifica trading account and the wallet you connected with, in one place. Both legs of a basis position need funding — the spot leg from your wallet, the short leg from Pacifica."
			/>

			{/* Unhedged positions are live directional risk; they come first. */}
			{needsAttention.length > 0 && (
				<Callout
					tone="danger"
					title={`${needsAttention.length} position${needsAttention.length === 1 ? "" : "s"} need attention`}
				>
					<ul className="space-y-1">
						{needsAttention.map(({ position }) => (
							<li key={position.id}>
								<Link to={`/portfolio/${position.id}`} className="underline">
									{position.tokenSymbol} / {position.perpSymbol}
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
					<SubHeading
						title="Pacifica account"
						description="Margin for the short leg of every position."
					/>

					<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
						<StatCard label="Equity" value={formatUsd(equity)} />
						<StatCard
							label="Available"
							value={formatUsd(Number(pacifica?.account?.available_to_spend ?? 0))}
						/>
						<StatCard
							label="Margin used"
							value={formatUsd(Number(pacifica?.account?.total_margin_used ?? 0))}
						/>
						<StatCard
							label="In transit"
							value={formatUsd(pacifica?.pendingUsdc ?? 0)}
							delta={pacifica?.pendingUsdc ? "Bridged, not yet credited" : undefined}
							tone={pacifica?.pendingUsdc ? "positive" : "neutral"}
						/>
					</div>

					{account && (
						<p className="t-micro text-[var(--pon-fg-3)]">
							Account <span className="font-fono">{account.pacificaAccount}</span>
						</p>
					)}

					<FundingPanel />

					<div className="space-y-3">
						<SubHeading
							title="Short legs"
							description="Every open perp here is one half of a basis position. Close them from the position, not individually."
						/>
						<PacificaPositions />
					</div>

					<div className="space-y-3">
						<SubHeading title="Resting orders" />
						<PacificaOrders />
					</div>
				</section>
			)}

			<section className="space-y-4">
				<SubHeading title="Connected wallet" description="Where the spot legs are held." />

				{!isConnected ? (
					<EmptyPanel icon={Wallet} title="No wallet connected">
						Connect a wallet to see what you hold on Base.
					</EmptyPanel>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
							<StatTile label="USDC on Base" value={formatUsd(walletUsdc)} />
							<StatTile label="Spot holdings" value={holdings.length} />
						</div>

						{holdings.length === 0 ? (
							<EmptyPanel icon={Briefcase} title="No spot legs held">
								<Link to="/" className="underline">
									Browse basis markets
								</Link>
							</EmptyPanel>
						) : (
							<div className="rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6">
								<Table className="min-w-[420px]">
									<TableHeader>
										<TableRow>
											<TableHead>Token</TableHead>
											<TableHead className="text-right">Units</TableHead>
											<TableHead className="text-right">Hedged by</TableHead>
											<TableHead className="text-right" />
										</TableRow>
									</TableHeader>
									<TableBody>
										{holdings.map(({ market, amount }) => (
											<TableRow key={market.id}>
												<TableCell>
													<Link
														to={`/markets/${market.id}`}
														className="font-semibold transition-colors hover:text-[var(--pon-lime)]"
													>
														{market.spot.symbol}
													</Link>
												</TableCell>
												<TableCell className="font-fono text-right">
													{formatQuantity(amount, 6)}
												</TableCell>
												<TableCell className="font-fono text-right text-[var(--pon-fg-2)]">
													{market.perp.symbol}
												</TableCell>
												<TableCell className="text-right">
													<Link
														to={`/markets/${market.id}`}
														className="t-caption font-semibold text-[var(--pon-lime)] hover:underline"
													>
														Open a position
													</Link>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</>
				)}
			</section>

			<section className="space-y-3">
				<SubHeading
					title="Basis positions"
					actions={
						<Link
							to="/portfolio"
							className="t-caption font-semibold text-[var(--pon-lime)] hover:underline"
						>
							Full portfolio
						</Link>
					}
				/>
				<PositionList />
			</section>
		</div>
	);
}
