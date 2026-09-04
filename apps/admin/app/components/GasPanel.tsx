import type { GasBalance, VaultGas } from "@lemon/client";
import { Button, cn } from "@lemon/ui";
import { AlertTriangle, Check, Copy, ExternalLink, Fuel, Loader2 } from "lucide-react";
import { useState } from "react";
import { parseEther } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";

/**
 * Agent gas, and topping it up.
 *
 * This is the running cost the protocol cannot cover for itself. An agent's
 * wallets hold the position but are ordinary accounts on their chains: the EVM
 * one needs ETH to send a Base transaction, the Solana one needs SOL. The vault
 * contract holds USDC and may only ever send USDC to one address, so neither can
 * be funded from protocol capital — an operator has to do it.
 *
 * The panel exists because the failure is silent. An agent out of gas does not
 * crash; it fails every write, stops reporting a valuation, and the vault goes
 * stale — which blocks deposits and withdrawals on-chain. From the outside that
 * looks like a broken agent rather than an empty wallet.
 *
 * Base can be funded from here: it is a plain ETH transfer from the operator's
 * own wallet. Solana cannot — a Base wallet cannot send SOL — so that half shows
 * the address and says plainly that it has to be funded elsewhere, rather than
 * offering a button that would not work.
 */
export function GasPanel({ gas }: { gas: VaultGas[] }) {
	const low = gas.filter((g) => g.needsTopUp);

	return (
		<section className="space-y-4">
			<div>
				<h2 className="font-medium text-[var(--pon-fg-0)]">Agent gas</h2>
				<p className="mt-0.5 text-sm text-[var(--pon-fg-3)]">
					Each agent pays its own transaction fees. An agent that runs dry stops reporting, and its
					vault goes stale — which blocks deposits and withdrawals until it is funded.
				</p>
			</div>

			{low.length > 0 && (
				<div className="flex gap-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/10 p-4">
					<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--pon-amber)]" />
					<div className="text-sm">
						<p className="font-medium text-[var(--pon-fg-0)]">
							{low.length} agent{low.length === 1 ? "" : "s"} need topping up
						</p>
						<p className="mt-1 text-[var(--pon-fg-2)]">
							{low.map((g) => g.ticker ?? g.vault.slice(0, 8)).join(", ")}
						</p>
					</div>
				</div>
			)}

			{gas.length === 0 ? (
				<p className="rounded-[var(--pon-r-lg,16px)] border border-dashed border-[var(--pon-line)] px-5 py-10 text-center text-sm text-[var(--pon-fg-3)]">
					No agents to check.
				</p>
			) : (
				<ul className="space-y-3">
					{gas.map((entry) => (
						<GasRow key={entry.vault} entry={entry} />
					))}
				</ul>
			)}
		</section>
	);
}

function GasRow({ entry }: { entry: VaultGas }) {
	return (
		<li
			className={cn(
				"rounded-[var(--pon-r-lg,16px)] border bg-[var(--pon-bg-2)] p-5",
				entry.needsTopUp ? "border-[var(--pon-amber)]/30" : "border-[var(--pon-line)]",
			)}
		>
			<div className="flex items-center gap-2">
				<Fuel className="size-4 text-[var(--pon-fg-2)]" />
				<span className="font-medium text-[var(--pon-fg-0)]">
					{entry.ticker ?? entry.vault.slice(0, 10)}
				</span>
				<span className="text-xs text-[var(--pon-fg-4)]">{entry.vault.slice(0, 10)}…</span>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				<BaseGas balance={entry.base} />
				<SolanaGas balance={entry.solana} />
			</div>
		</li>
	);
}

/** Base: fundable from the operator's own wallet, so it gets a button. */
function BaseGas({ balance }: { balance: GasBalance }) {
	const { isConnected } = useAccount();
	const [amount, setAmount] = useState("0.01");
	const { sendTransaction, data: hash, isPending, error } = useSendTransaction();
	const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

	const parsed = safeParseEther(amount);

	return (
		<div className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4">
			<Header balance={balance} label="Base" />

			{balance.address && (
				<div className="mt-3 space-y-2">
					<div className="flex items-center gap-2">
						<input
							inputMode="decimal"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							className="w-24 rounded-[var(--pon-r-sm,8px)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-2 py-1 text-sm tabular-nums text-[var(--pon-fg-0)] outline-none"
						/>
						<span className="text-xs text-[var(--pon-fg-3)]">ETH</span>
						<Button
							size="sm"
							disabled={!isConnected || parsed === null || isPending || isConfirming}
							onClick={() =>
								parsed !== null &&
								sendTransaction({
									to: balance.address as `0x${string}`,
									value: parsed,
								})
							}
						>
							{isPending || isConfirming ? (
								<>
									<Loader2 className="mr-1.5 size-3.5 animate-spin" /> Sending…
								</>
							) : (
								"Send gas"
							)}
						</Button>
					</div>

					{!isConnected && (
						<p className="text-xs text-[var(--pon-fg-3)]">Connect a wallet to top this up.</p>
					)}
					{parsed === null && amount.trim() !== "" && (
						<p className="text-xs text-[var(--pon-down)]">That is not an amount.</p>
					)}
					{isSuccess && (
						<p className="text-xs text-[var(--pon-up)]">
							Sent. The balance updates on the next refresh.
						</p>
					)}
					{error && (
						<p className="text-xs text-[var(--pon-down)]">{error.message.split("\n")[0]}</p>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * Solana: not fundable from here, and the panel says so.
 *
 * A Base wallet cannot send SOL. Offering a button that opens a wallet which
 * then cannot sign is worse than no button — so this shows the address, makes it
 * easy to copy, and states what has to happen.
 */
function SolanaGas({ balance }: { balance: GasBalance }) {
	// With no address there is nothing to show but the reason, and `Header`
	// already renders that — repeating it below was saying the same sentence
	// twice in a row.
	const [copied, setCopied] = useState(false);

	return (
		<div className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4">
			<Header balance={balance} label="Solana" />

			{balance.address ? (
				<div className="mt-3 space-y-2">
					<button
						type="button"
						onClick={() => {
							navigator.clipboard.writeText(balance.address as string);
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						}}
						className="flex w-full items-center justify-between gap-2 rounded-[var(--pon-r-sm,8px)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-2 py-1.5 text-left"
					>
						<span className="truncate font-mono text-xs text-[var(--pon-fg)]">
							{balance.address}
						</span>
						{copied ? (
							<Check className="size-3.5 shrink-0 text-[var(--pon-up)]" />
						) : (
							<Copy className="size-3.5 shrink-0 text-[var(--pon-fg-4)]" />
						)}
					</button>
					<p className="text-xs leading-relaxed text-[var(--pon-fg-3)]">
						Send SOL to this address from a Solana wallet. It cannot be funded from a Base wallet,
						so there is deliberately no button here.
					</p>
				</div>
			) : null}
		</div>
	);
}

function Header({ balance, label }: { balance: GasBalance; label: string }) {
	return (
		<>
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-sm font-medium text-[var(--pon-fg-0)]">{label}</span>
				<span
					className={cn(
						"text-sm tabular-nums",
						balance.formatted === null
							? "text-[var(--pon-fg-4)]"
							: balance.isLow
								? "text-[var(--pon-amber)]"
								: "text-[var(--pon-fg)]",
					)}
				>
					{balance.formatted === null ? "unknown" : `${trim(balance.formatted)} ${balance.symbol}`}
				</span>
			</div>

			<p className="mt-1 text-xs text-[var(--pon-fg-4)]">
				{balance.note ? (
					<span className="text-[var(--pon-amber)]">{balance.note}</span>
				) : balance.isLow ? (
					<span className="text-[var(--pon-amber)]">
						Below the {trim(balance.lowThreshold)} {balance.symbol} floor
						{balance.estimatedTransactions !== null &&
							` — roughly ${balance.estimatedTransactions.toLocaleString()} transactions left`}
						.
					</span>
				) : balance.estimatedTransactions !== null ? (
					`Roughly ${balance.estimatedTransactions.toLocaleString()} transactions of headroom.`
				) : (
					""
				)}
			</p>

			{balance.address && (
				<a
					href={
						balance.chain === "BASE"
							? `https://basescan.org/address/${balance.address}`
							: `https://solscan.io/account/${balance.address}`
					}
					target="_blank"
					rel="noreferrer noopener"
					className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--pon-fg-4)] hover:text-[var(--pon-lime)]"
				>
					Explorer <ExternalLink className="size-3" />
				</a>
			)}
		</>
	);
}

/** Never throws on a half-typed amount — the field is being edited as it parses. */
function safeParseEther(value: string): bigint | null {
	const trimmed = value.trim();
	if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;
	try {
		const wei = parseEther(trimmed as `${number}`);
		return wei > 0n ? wei : null;
	} catch {
		return null;
	}
}

/** Chain balances come back with 18 decimals of noise nobody reads. */
function trim(value: string): string {
	const n = Number(value);
	if (!Number.isFinite(n)) return value;
	return n < 0.0001 && n > 0
		? n.toExponential(2)
		: n.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}
