import type { Vault } from "@lemon/client";
import { formatUnits, formatUsd, parseUnits, toBigInt, USDC_DECIMALS } from "@lemon/client";
import { lemonVaultAbi } from "@lemon/contracts";
import { Button, cn } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { erc20Abi } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

/**
 * Deposit USDC, receive shares.
 *
 * Two transactions the first time — an ERC-20 approval, then the deposit — and
 * one thereafter. The approval is for the exact amount rather than unlimited:
 * this is a new contract holding user funds, and an infinite allowance means a
 * future bug in it can take the rest of someone's USDC too.
 *
 * The shares are minted immediately at the current price, so the panel shows
 * that price and what it buys before anything is signed. A deposit that lands as
 * an opaque share balance is one the user has to trust rather than check.
 */
export function DepositPanel({ vault, usdcAddress }: { vault: Vault; usdcAddress: `0x${string}` }) {
	const { address, isConnected } = useAccount();
	const queryClient = useQueryClient();
	const [input, setInput] = useState("");
	const [stage, setStage] = useState<"idle" | "approving" | "depositing">("idle");

	const amount = useMemo(() => parseUnits(input, USDC_DECIMALS), [input]);

	const { data: balance } = useReadContract({
		abi: erc20Abi,
		address: usdcAddress,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: Boolean(address), refetchInterval: 15_000 },
	});

	const { data: allowance } = useReadContract({
		abi: erc20Abi,
		address: usdcAddress,
		functionName: "allowance",
		args: address ? [address, vault.address] : undefined,
		query: { enabled: Boolean(address), refetchInterval: 5_000 },
	});

	const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
	const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

	// A confirmed deposit has to be reflected before the user looks away, and the
	// indexer trails the chain by a block or two — so the refetch is what turns
	// "it went through" into "and here it is".
	useEffect(() => {
		if (!isSuccess) return;
		setStage("idle");
		setInput("");
		queryClient.invalidateQueries({ queryKey: ["portfolio"] });
		queryClient.invalidateQueries({ queryKey: ["vault", vault.address] });
	}, [isSuccess, queryClient, vault.address]);

	const needsApproval = amount !== null && amount > 0n && toBigInt(allowance) < amount;
	const insufficient = amount !== null && amount > toBigInt(balance);
	const blocked = vault.paused || vault.navStale;

	const sharesOut = useMemo(() => {
		if (!amount || toBigInt(vault.pricePerShare) === 0n) return 0n;
		return (amount * 10n ** 18n) / toBigInt(vault.pricePerShare);
	}, [amount, vault.pricePerShare]);

	function onApprove() {
		if (!amount) return;
		setStage("approving");
		writeContract({
			abi: erc20Abi,
			address: usdcAddress,
			functionName: "approve",
			// Exactly this deposit, not unlimited. A new contract holding funds
			// should not also hold a standing claim on the rest of a wallet.
			args: [vault.address, amount],
		});
	}

	function onDeposit() {
		if (!amount || !address) return;
		setStage("depositing");
		writeContract({
			abi: lemonVaultAbi,
			address: vault.address,
			functionName: "deposit",
			args: [amount, address],
		});
	}

	return (
		<div className="space-y-4 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
			<div className="flex items-baseline justify-between">
				<h3 className="font-medium text-[var(--pon-fg-0)]">Deposit</h3>
				<span className="text-xs text-[var(--pon-fg-3)]">Balance {formatUsd(balance ?? 0n)}</span>
			</div>

			{blocked ? (
				<BlockedNotice vault={vault} />
			) : (
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
							<span className="text-sm font-medium text-[var(--pon-fg-2)]">USDC</span>
							<button
								type="button"
								onClick={() => setInput(formatUnits(balance ?? 0n, USDC_DECIMALS, 6))}
								className="rounded-full border border-[var(--pon-line-2)] px-2.5 py-1 text-xs text-[var(--pon-fg-2)] hover:border-[var(--pon-lime)] hover:text-[var(--pon-lime)]"
							>
								Max
							</button>
						</div>
					</div>

					<dl className="space-y-1.5 text-sm">
						<Row label="Share price" value={`${formatUsd(vault.pricePerShare)} per share`} />
						<Row label="You receive" value={`${formatUnits(sharesOut, 18, 4)} ${vault.symbol}`} />
						<Row
							label="Withdrawal notice"
							value="3–7 days"
							hint="The agent has to unwind a real position to pay you out, so exits are queued rather than instant."
						/>
					</dl>

					{insufficient && (
						<p className="text-sm text-[var(--pon-down)]">
							That is more USDC than this wallet holds.
						</p>
					)}

					{error && (
						<p className="text-sm text-[var(--pon-down)]">
							{/* Wallet errors are long and mostly stack; the first line is the part a user can act on. */}
							{error.message.split("\n")[0]}
						</p>
					)}

					{!isConnected ? (
						<p className="text-sm text-[var(--pon-fg-3)]">Connect a wallet to deposit.</p>
					) : needsApproval ? (
						<Button
							className="w-full"
							disabled={!amount || insufficient || isPending || isConfirming}
							onClick={onApprove}
						>
							{(isPending || isConfirming) && stage === "approving" ? (
								<>
									<Loader2 className="mr-2 size-4 animate-spin" /> Approving…
								</>
							) : (
								"Approve USDC"
							)}
						</Button>
					) : (
						<Button
							className="w-full"
							disabled={!amount || amount === 0n || insufficient || isPending || isConfirming}
							onClick={onDeposit}
						>
							{(isPending || isConfirming) && stage === "depositing" ? (
								<>
									<Loader2 className="mr-2 size-4 animate-spin" /> Depositing…
								</>
							) : (
								"Deposit"
							)}
						</Button>
					)}

					<p className="text-xs leading-relaxed text-[var(--pon-fg-4)]">
						Shares are minted the moment your deposit lands. Their value moves with the vault: a 2%
						annual management fee and 20% of gains above the vault's previous high accrue to the
						protocol, and both are already reflected in the share price shown above.
					</p>
				</>
			)}
		</div>
	);
}

function BlockedNotice({ vault }: { vault: Vault }) {
	return (
		<div className="flex gap-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/10 px-4 py-3">
			<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--pon-amber)]" />
			<div className="text-sm text-[var(--pon-fg-2)]">
				{vault.paused ? (
					<>
						<p className="font-medium text-[var(--pon-fg-0)]">Deposits are paused</p>
						<p className="mt-1">
							An operator has paused this vault. Withdrawals can still be requested, and existing
							shares are unaffected.
						</p>
					</>
				) : (
					<>
						<p className="font-medium text-[var(--pon-fg-0)]">Waiting on a valuation</p>
						<p className="mt-1">
							The agent has not reported what the position is worth recently, so the vault will not
							price a deposit. It resumes on its own once a fresh report lands.
						</p>
					</>
				)}
			</div>
		</div>
	);
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<dt className={cn("text-[var(--pon-fg-3)]", hint && "cursor-help")} title={hint}>
				{label}
			</dt>
			<dd className="text-right font-medium text-[var(--pon-fg)] tabular-nums">{value}</dd>
		</div>
	);
}
