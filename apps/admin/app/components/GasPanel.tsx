import { adminApi, type GasBalance, useWithdrawableGas, type VaultGas } from "@lemon/client";
import { chainInfo, explorerAddress } from "@lemon/core";
import { Button, cn, Segmented } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, ExternalLink, Fuel, Loader2, Undo2 } from "lucide-react";
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
 *
 * Both directions, though. Gas goes *out* through the server rather than the
 * operator's wallet, because that is the only party that can sign for an
 * MPC-derived address — see `GasWithdraw` below for why that has to exist.
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

			<GasWithdraw vault={entry.vault} />
		</li>
	);
}

/**
 * Taking the gas back out.
 *
 * The other direction of this panel, and the reason it exists is redeployment.
 * A vault is immutable, so a new version of the contracts is a new set of
 * vaults with new agents — and the ETH and SOL an operator put into the old
 * agents to keep them writing is stranded at wallets no private key exists for.
 * Nothing but this can reach it: the wallets are MPC-derived, so there is no
 * seed phrase to import somewhere else.
 *
 * Collapsed by default and never the first thing on the row. Topping up is the
 * routine operation and draining is the rare one, and a "withdraw" button
 * sitting next to "send gas" on a healthy agent is an accident waiting for a
 * tired evening.
 */
function GasWithdraw({ vault }: { vault: string }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="mt-3 border-t border-[var(--pon-line-2)] pt-3">
			<button
				type="button"
				onClick={() => setOpen((was) => !was)}
				className="inline-flex items-center gap-1.5 text-xs text-[var(--pon-fg-4)] hover:text-[var(--pon-fg-0)]"
				aria-expanded={open}
			>
				<Undo2 className="size-3.5" />
				{open ? "Hide" : "Recover gas"}
			</button>

			{open && <GasWithdrawForm vault={vault} />}
		</div>
	);
}

function GasWithdrawForm({ vault }: { vault: string }) {
	const { address: connected } = useAccount();
	const queryClient = useQueryClient();
	const { data, isLoading, error: loadError } = useWithdrawableGas(vault, true);

	const [chain, setChain] = useState<"EVM" | "SOLANA">("EVM");
	const [to, setTo] = useState("");
	const [amount, setAmount] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sent, setSent] = useState<{ formatted: string; symbol: string; url: string } | null>(null);

	const side = chain === "EVM" ? data?.base : data?.solana;
	// The connected wallet is the obvious destination for an EVM sweep and a
	// meaningless one for SOL, so it prefills only where it is actually usable.
	const destination = to.trim() || (chain === "EVM" ? (connected ?? "") : "");
	const nothingToSend = side ? side.spendable === "0" : false;

	async function onWithdraw() {
		setBusy(true);
		setError(null);
		setSent(null);
		try {
			const { withdrawal } = await adminApi.withdrawGas(vault, {
				chain,
				to: destination,
				// Empty means everything the wallet can spare. The server decides
				// what that is, net of the fee, rather than the browser guessing.
				amount: amount.trim() || undefined,
			});
			setSent({
				formatted: withdrawal.formatted,
				symbol: withdrawal.symbol,
				url: withdrawal.explorerUrl,
			});
			setAmount("");
			queryClient.invalidateQueries({ queryKey: ["admin-gas"] });
			queryClient.invalidateQueries({ queryKey: ["admin-gas-withdrawable", vault] });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	if (isLoading) {
		return (
			<p className="mt-3 flex items-center gap-2 text-xs text-[var(--pon-fg-4)]">
				<Loader2 className="size-3.5 animate-spin" /> Reading what these wallets can send…
			</p>
		);
	}

	// The server refuses to drain a running agent, and its refusal names the fix.
	// Repeating it here rather than paraphrasing keeps one sentence in one place.
	if (loadError) {
		return (
			<p className="mt-3 rounded-[var(--pon-r-sm,8px)] border border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/10 p-3 text-xs leading-relaxed text-[var(--pon-fg-2)]">
				{loadError instanceof Error ? loadError.message : String(loadError)}
			</p>
		);
	}

	return (
		<div className="mt-3 space-y-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4">
			<p className="text-xs leading-relaxed text-[var(--pon-fg-3)]">
				Sends the agent's own gas token or SOL somewhere else. Only the native unit moves — USDC,
				the spot token and the Pacifica balance are depositor capital and leave through the vault,
				not through here.
			</p>

			<Segmented<"EVM" | "SOLANA">
				options={[
					// Labelled from the balance the API returned rather than written
					// here, because neither half is fixed any more: the chain is the
					// vault's, and its native unit is ETH on Base and Arbitrum but OKB
					// on X Layer.
					{
						value: "EVM",
						label: data?.base
							? `${data.base.symbol} on ${chainInfo(data.base.chainId)?.name ?? "its chain"}`
							: "Native token",
					},
					{ value: "SOLANA", label: "SOL" },
				]}
				value={chain}
				onChange={(value) => {
					setChain(value);
					setTo("");
					setAmount("");
					setSent(null);
					setError(null);
				}}
			/>

			<dl className="space-y-1 text-xs">
				<div className="flex justify-between gap-2">
					<dt className="text-[var(--pon-fg-3)]">From</dt>
					<dd className="truncate font-mono text-[var(--pon-fg)]">{side?.address}</dd>
				</div>
				<div className="flex justify-between gap-2">
					<dt className="text-[var(--pon-fg-3)]">Available to send</dt>
					<dd className="tabular-nums text-[var(--pon-fg)]">
						{side ? `${side.formattedSpendable} ${side.symbol}` : "—"}
					</dd>
				</div>
			</dl>

			{side?.note && <p className="text-xs text-[var(--pon-amber)]">{side.note}</p>}

			<label className="block space-y-1">
				<span className="text-xs text-[var(--pon-fg-3)]">Send to</span>
				<input
					value={destination}
					onChange={(e) => setTo(e.target.value)}
					placeholder={chain === "EVM" ? "0x…" : "A Solana address"}
					spellCheck={false}
					className="w-full rounded-[var(--pon-r-sm,8px)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-2 py-1.5 font-mono text-xs text-[var(--pon-fg-0)] outline-none"
				/>
			</label>

			<label className="block space-y-1">
				<span className="text-xs text-[var(--pon-fg-3)]">
					Amount in {side?.symbol ?? "native units"} — leave blank to send everything
				</span>
				<input
					inputMode="decimal"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					placeholder={side ? `${side.formattedSpendable} (everything)` : "everything"}
					className="w-full rounded-[var(--pon-r-sm,8px)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-2 py-1.5 text-xs tabular-nums text-[var(--pon-fg-0)] outline-none"
				/>
			</label>

			<Button
				size="sm"
				variant="outline"
				className="w-full"
				disabled={busy || nothingToSend || destination.trim() === ""}
				onClick={onWithdraw}
			>
				{busy ? (
					<>
						<Loader2 className="mr-1.5 size-3.5 animate-spin" /> Sending…
					</>
				) : (
					`Withdraw ${side?.symbol ?? "gas"}`
				)}
			</Button>

			{sent && (
				<p className="text-xs text-[var(--pon-up)]">
					Sent {sent.formatted} {sent.symbol}.{" "}
					<a
						href={sent.url}
						target="_blank"
						rel="noreferrer noopener"
						className="underline hover:text-[var(--pon-lime)]"
					>
						Transaction
					</a>
				</p>
			)}
			{error && <p className="text-xs leading-relaxed text-[var(--pon-down)]">{error}</p>}
		</div>
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
						balance.chain === "EVM" && balance.chainId !== null
							? explorerAddress(balance.chainId, balance.address)
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
