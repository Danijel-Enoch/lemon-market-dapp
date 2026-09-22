import {
	formatDateTime,
	formatRelative,
	formatUnits,
	formatUsd,
	SHARE_DECIMALS,
	toBigInt,
	usePortfolio,
} from "@lemon/client";
import { explorerTx } from "@lemon/core";
import { cn, EmptyState, PageHeader, Skeleton, StatCard } from "@lemon/ui";
import { APP_CHAIN } from "@lemon/wallet";
import { Clock, ExternalLink, Wallet } from "lucide-react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { useAccount } from "wagmi";

export const meta: MetaFunction = () => [{ title: "Portfolio — Lemon" }];

export default function PortfolioPage() {
	const { address, isConnected } = useAccount();
	const { data, isLoading } = usePortfolio(address);

	if (!isConnected) {
		return (
			<div className="space-y-6">
				<PageHeader
					eyebrow="Your position"
					title="Portfolio"
					description="Your vault shares, what they are worth, and any withdrawal working its way through the queue."
				/>
				<EmptyState
					icon={Wallet}
					title="Connect a wallet"
					description="Your holdings are share balances on Base, so there is nothing to show until a wallet is connected."
				/>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-28 w-full rounded-[var(--pon-r-lg,16px)]" />
				<Skeleton className="h-48 w-full rounded-[var(--pon-r-lg,16px)]" />
			</div>
		);
	}

	const holdings = data?.holdings ?? [];
	const pending = data?.pendingWithdrawals ?? [];
	const history = data?.history ?? [];

	const totalValue = holdings.reduce((sum, h) => sum + toBigInt(h.valueUsd), 0n);
	const totalCost = holdings.reduce((sum, h) => sum + toBigInt(h.netDeposited), 0n);
	const pnl = totalValue - totalCost;

	return (
		<div className="space-y-6 md:space-y-8">
			<PageHeader
				eyebrow="Your position"
				title="Portfolio"
				description="Your vault shares, what they are worth, and any withdrawal working its way through the queue."
			/>

			<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
				<StatCard label="Value" value={formatUsd(totalValue)} />
				<StatCard label="Deposited" value={formatUsd(totalCost)} />
				<StatCard
					label="Unrealised"
					value={formatUsd(pnl)}
					tone={pnl > 0n ? "positive" : pnl < 0n ? "negative" : "neutral"}
				/>
			</div>

			{/* Pending withdrawals come first: someone waiting on money wants to see
			    its status before anything else on the page. */}
			{pending.length > 0 && (
				<section className="space-y-3">
					<h2 className="font-medium text-[var(--pon-fg-0)]">Withdrawals in progress</h2>
					<ul className="space-y-3">
						{pending.map((w) => {
							const now = Date.now() / 1000;
							const claimable = toBigInt(w.claimableShares) > 0n;
							const overdue = w.fulfillBy < now && !claimable;

							return (
								<li
									key={`${w.vault}-${w.controller}`}
									className={cn(
										"rounded-[var(--pon-r-lg,16px)] border p-5",
										claimable
											? "border-[var(--pon-lime)]/30 bg-[var(--pon-lime-dim)]"
											: overdue
												? "border-[var(--pon-down)]/30 bg-[var(--pon-down)]/5"
												: "border-[var(--pon-line)] bg-[var(--pon-bg-2)]",
									)}
								>
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<Link
												to={`/vaults/${w.vault}`}
												className="font-medium text-[var(--pon-fg-0)] hover:text-[var(--pon-lime)]"
											>
												{w.vault.slice(0, 10)}…
											</Link>
											<p className="mt-1 text-sm text-[var(--pon-fg-2)]">
												{claimable ? (
													<>
														Ready to claim:{" "}
														<span className="font-medium text-[var(--pon-fg-0)]">
															{formatUsd(w.claimableAssets)}
														</span>
													</>
												) : (
													<>{formatUnits(w.pendingShares, SHARE_DECIMALS, 4)} shares queued</>
												)}
											</p>
										</div>

										<div className="text-right text-sm">
											{claimable ? (
												<Link
													to={`/vaults/${w.vault}`}
													className="rounded-full bg-[var(--pon-lime)] px-3 py-1.5 text-xs font-medium text-[var(--pon-on-lime)]"
												>
													Claim
												</Link>
											) : (
												<div className="flex items-center gap-1.5 text-[var(--pon-fg-3)]">
													<Clock className="size-3.5" />
													{w.eligibleAt > now
														? `Agent may act ${formatRelative(w.eligibleAt)}`
														: overdue
															? `Overdue since ${formatRelative(w.fulfillBy)}`
															: `Due ${formatRelative(w.fulfillBy)}`}
												</div>
											)}
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				</section>
			)}

			<section className="space-y-3">
				<h2 className="font-medium text-[var(--pon-fg-0)]">Holdings</h2>
				{holdings.length === 0 ? (
					<EmptyState
						icon={Wallet}
						title="No vault shares yet"
						description="Deposit USDC into a vault and shares are minted immediately."
						action={
							<Link to="/vaults" className="text-sm text-[var(--pon-lime)] underline">
								Browse vaults
							</Link>
						}
					/>
				) : (
					<ul className="divide-y divide-[var(--pon-line)] overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
						{holdings.map((h) => {
							const value = toBigInt(h.valueUsd);
							const cost = toBigInt(h.netDeposited);
							const delta = value - cost;
							const vault = h.vault as { address: string; ticker?: string | null; symbol?: string };

							return (
								<li key={vault.address}>
									<Link
										to={`/vaults/${vault.address}`}
										className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--pon-surface)]"
									>
										<div className="min-w-0">
											<p className="font-medium text-[var(--pon-fg-0)]">
												{vault.ticker ?? vault.symbol ?? vault.address.slice(0, 10)}
											</p>
											<p className="mt-0.5 text-xs text-[var(--pon-fg-3)]">
												{formatUnits(h.shares, SHARE_DECIMALS, 4)} shares
											</p>
										</div>
										<div className="text-right">
											<p className="font-medium tabular-nums text-[var(--pon-fg-0)]">
												{formatUsd(value)}
											</p>
											<p
												className={cn(
													"text-xs tabular-nums",
													delta > 0n
														? "text-[var(--pon-up)]"
														: delta < 0n
															? "text-[var(--pon-down)]"
															: "text-[var(--pon-fg-3)]",
												)}
											>
												{delta > 0n ? "+" : ""}
												{formatUsd(delta)}
											</p>
										</div>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</section>

			{history.length > 0 && (
				<section className="space-y-3">
					<h2 className="font-medium text-[var(--pon-fg-0)]">Your transactions</h2>
					<ul className="divide-y divide-[var(--pon-line)] overflow-hidden rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)]">
						{history.map((row) => (
							<li
								key={row.id}
								className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
							>
								<div>
									<span className="font-medium text-[var(--pon-fg-0)]">
										{row.direction === "DEPOSIT" ? "Deposited" : "Withdrew"}
									</span>
									<span className="ml-2 text-xs text-[var(--pon-fg-4)]">
										{formatDateTime(row.timestamp)}
									</span>
								</div>
								<div className="flex items-center gap-3">
									<span className="tabular-nums text-[var(--pon-fg)]">{formatUsd(row.assets)}</span>
									<a
										href={explorerTx(row.chainId ?? APP_CHAIN.id, row.txHash)}
										target="_blank"
										rel="noreferrer noopener"
										className="text-[var(--pon-fg-4)] hover:text-[var(--pon-lime)]"
									>
										<ExternalLink className="size-3.5" />
									</a>
								</div>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
