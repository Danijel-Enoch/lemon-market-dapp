import type { PendingWithdrawal, Vault } from "@lemon/client";
import {
	formatRelative,
	formatUnits,
	formatUsd,
	parseUnits,
	SHARE_DECIMALS,
	shareValueUsd,
	toBigInt,
} from "@lemon/client";
import { lemonVaultAbi } from "@lemon/contracts";
import { Button, cn } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

/**
 * Requesting a withdrawal, and claiming it days later.
 *
 * The whole panel is built around making the delay legible, because it is the
 * one part of this product that will surprise people. Three states, and the UI
 * says which one you are in and what happens next:
 *
 *   1. **Nothing queued** — you can request. The form explains the wait *before*
 *      you commit, not after.
 *   2. **Queued** — the agent is unwinding. A countdown to when it may act, and
 *      the deadline it is held to.
 *   3. **Ready** — the position is closed and priced, and the money is sitting
 *      in the contract with your name on it. One click.
 *
 * The other thing it says plainly: your shares stay invested while you wait. The
 * amount you get is priced when the agent unwinds, not when you asked. That is
 * the correct arrangement — a price fixed at request time would be a free option
 * on everyone else's capital — but it has to be stated, because a user who
 * assumed otherwise would read a lower payout as the protocol shortchanging them.
 */
export function WithdrawPanel({
	vault,
	pending,
}: {
	vault: Vault;
	pending: PendingWithdrawal | undefined;
}) {
	const { address, isConnected } = useAccount();
	const queryClient = useQueryClient();
	const [input, setInput] = useState("");

	const { data: shareBalance } = useReadContract({
		abi: lemonVaultAbi,
		address: vault.address,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: Boolean(address), refetchInterval: 15_000 },
	});

	const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
	const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

	useEffect(() => {
		if (!isSuccess) return;
		setInput("");
		queryClient.invalidateQueries({ queryKey: ["portfolio"] });
		queryClient.invalidateQueries({ queryKey: ["vault", vault.address] });
	}, [isSuccess, queryClient, vault.address]);

	const shares = useMemo(() => parseUnits(input, SHARE_DECIMALS), [input]);
	const held = toBigInt(shareBalance);
	const claimable = toBigInt(pending?.claimableShares);
	const queued = toBigInt(pending?.pendingShares);

	function onRequest() {
		if (!shares || !address) return;
		writeContract({
			abi: lemonVaultAbi,
			address: vault.address,
			functionName: "requestRedeem",
			args: [shares, address, address],
		});
	}

	function onClaim() {
		if (!address || claimable === 0n) return;
		writeContract({
			abi: lemonVaultAbi,
			address: vault.address,
			functionName: "redeem",
			args: [claimable, address, address],
		});
	}

	const busy = isPending || isConfirming;

	return (
		<div
			data-testid="withdraw-panel"
			className="space-y-4 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5"
		>
			<div className="flex items-baseline justify-between">
				<h3 className="font-medium text-[var(--pon-fg-0)]">Withdraw</h3>
				<span className="text-xs text-[var(--pon-fg-3)]">
					You hold {formatUnits(held, SHARE_DECIMALS, 4)} {vault.symbol}
				</span>
			</div>

			{claimable > 0n && (
				<div className="space-y-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-lime)]/30 bg-[var(--pon-lime-dim)] p-4">
					<div>
						<p className="font-medium text-[var(--pon-lime)]">Ready to claim</p>
						<p className="mt-1 text-sm text-[var(--pon-fg-2)]">
							The agent has closed your share of the position and set aside{" "}
							<span className="font-medium text-[var(--pon-fg-0)] tabular-nums">
								{formatUsd(pending?.claimableAssets)}
							</span>
							.
						</p>
					</div>
					<Button className="w-full" onClick={onClaim} disabled={busy}>
						{busy ? (
							<>
								<Loader2 className="mr-2 size-4 animate-spin" /> Claiming…
							</>
						) : (
							`Claim ${formatUsd(pending?.claimableAssets)}`
						)}
					</Button>
				</div>
			)}

			{queued > 0n && <QueuedNotice pending={pending as PendingWithdrawal} vault={vault} />}

			{held > 0n && (
				<>
					<div className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-4 py-3">
						<div className="flex items-center gap-3">
							<input
								inputMode="decimal"
								placeholder="0.00"
								value={input}
								onChange={(e) => {
									setInput(e.target.value);
									reset();
								}}
								className="min-w-0 flex-1 bg-transparent text-2xl font-medium text-[var(--pon-fg-0)] tabular-nums outline-none placeholder:text-[var(--pon-fg-4)]"
							/>
							<span className="text-sm font-medium text-[var(--pon-fg-2)]">{vault.symbol}</span>
							<button
								type="button"
								onClick={() => setInput(formatUnits(held, SHARE_DECIMALS, 18))}
								className="rounded-full border border-[var(--pon-line-2)] px-2.5 py-1 text-xs text-[var(--pon-fg-2)] hover:border-[var(--pon-lime)] hover:text-[var(--pon-lime)]"
							>
								Max
							</button>
						</div>
					</div>

					{shares !== null && shares > 0n && (
						<p className="text-sm text-[var(--pon-fg-2)]">
							Worth about{" "}
							<span className="font-medium text-[var(--pon-fg-0)] tabular-nums">
								{formatUsd(shareValueUsd(shares, vault.pricePerShare))}
							</span>{" "}
							at today's price.{" "}
							<span className="text-[var(--pon-fg-3)]">
								The amount you actually receive is set when the agent unwinds, days from now, so it
								will differ.
							</span>
						</p>
					)}

					{shares !== null && shares > held && (
						<p className="text-sm text-[var(--pon-down)]">That is more than you hold.</p>
					)}

					{error && (
						<p className="text-sm text-[var(--pon-down)]">{error.message.split("\n")[0]}</p>
					)}

					{isConnected ? (
						<Button
							variant="outline"
							className="w-full"
							onClick={onRequest}
							disabled={!shares || shares === 0n || shares > held || busy}
						>
							{busy ? (
								<>
									<Loader2 className="mr-2 size-4 animate-spin" /> Requesting…
								</>
							) : (
								"Request withdrawal"
							)}
						</Button>
					) : (
						<p className="text-sm text-[var(--pon-fg-3)]">Connect a wallet to withdraw.</p>
					)}

					<div className="space-y-2 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)] px-4 py-3 text-xs leading-relaxed text-[var(--pon-fg-3)]">
						<p>
							<span className="font-medium text-[var(--pon-fg-2)]">
								Withdrawals take 3 to 7 days.
							</span>{" "}
							Your money is in a live spot-and-perp position, and the agent has to close part of it
							to pay you. It may not act for the first three days, and is held to seven.
						</p>
						<p>
							Your shares stay invested for the whole of that window, so you keep earning — and keep
							the risk — until the position is actually closed.
						</p>
						{queued > 0n && (
							<p className="text-[var(--pon-amber)]">
								Adding to a request already in the queue restarts its three-day clock.
							</p>
						)}
					</div>
				</>
			)}

			{held === 0n && claimable === 0n && queued === 0n && (
				<p className="text-sm text-[var(--pon-fg-3)]">You have no shares in this vault.</p>
			)}
		</div>
	);
}

/**
 * The waiting state.
 *
 * Two dates, because they mean different things: the agent *may not* act before
 * the first, and *should have* acted by the second. Showing only one would make
 * a normal four-day wait look either early or late.
 */
function QueuedNotice({ pending, vault }: { pending: PendingWithdrawal; vault: Vault }) {
	const now = Date.now() / 1000;
	const ripe = pending.eligibleAt <= now;
	const overdue = pending.fulfillBy < now;

	return (
		<div
			className={cn(
				"space-y-2 rounded-[var(--pon-r-md,12px)] border px-4 py-3",
				overdue
					? "border-[var(--pon-down)]/30 bg-[var(--pon-down)]/10"
					: "border-[var(--pon-line-2)] bg-[var(--pon-surface)]",
			)}
		>
			<div className="flex items-center gap-2">
				<Clock
					className={cn("size-4", overdue ? "text-[var(--pon-down)]" : "text-[var(--pon-fg-2)]")}
				/>
				<p className="font-medium text-[var(--pon-fg-0)]">
					{formatUnits(pending.pendingShares, SHARE_DECIMALS, 4)} {vault.symbol} queued
				</p>
			</div>

			<p className="text-sm text-[var(--pon-fg-2)]">
				{overdue ? (
					<>
						This was due {formatRelative(pending.fulfillBy)} and has not been paid yet. The agent is
						late; the funds are not at risk, but the delay is not normal.
					</>
				) : ripe ? (
					<>
						The agent can now close your share of the position. It is held to doing so by{" "}
						{formatRelative(pending.fulfillBy)}.
					</>
				) : (
					<>
						The agent may act from {formatRelative(pending.eligibleAt)}, and is held to paying out
						by {formatRelative(pending.fulfillBy)}.
					</>
				)}
			</p>
		</div>
	);
}
