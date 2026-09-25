import type { DerivedWallet, OnboardingCosts, UserBalances } from "@lemon/client";
import { formatUsd } from "@lemon/client";
import { Callout, cn } from "@lemon/ui";
import { Check, Copy, ExternalLink, Wallet } from "lucide-react";
import { useState } from "react";

/**
 * The derived wallet, and how far through setup it is.
 *
 * This panel carries the one explanation the product cannot do without. A user
 * arrives holding an EVM wallet and is shown a Solana address they have never
 * seen, holding their margin — and unless that is explained in the same glance,
 * the reasonable conclusion is that the app has done something odd with their
 * money. So the address, where it came from, what it can and cannot do, and how
 * to get funds out of it are all here rather than in documentation.
 *
 * The honesty about custody is deliberate and not hedged. This address is signed
 * for by the deployment's NEAR relayer. Calling it "your wallet" without saying
 * so would be the single most misleading sentence in the app.
 */
export function WalletPanel({
	wallet,
	balances,
	costs,
}: {
	wallet: DerivedWallet;
	balances: UserBalances;
	costs?: OnboardingCosts;
}) {
	const idle = Number(balances.solana.idleUsdc) / 1e6;
	const available =
		balances.pacifica.availableUsdc === null ? null : Number(balances.pacifica.availableUsdc) / 1e6;

	return (
		<div className="space-y-4 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
			<div className="flex items-start gap-3">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--pon-bg-3)]">
					<Wallet size={16} className="text-[var(--pon-fg-2)]" aria-hidden />
				</span>
				<div className="min-w-0">
					<h2 className="firm-label text-[var(--pon-fg-0)]">Your margin wallet</h2>
					<p className="mt-1 text-[11.5px] leading-relaxed text-[var(--pon-fg-3)]">
						A Solana address derived from the wallet you connected. It holds the margin for your
						shorts and is also your Pacifica account — the venue keys balances by the address that
						signs, so there is no separate account number.
					</p>
				</div>
			</div>

			<AddressRow label="Solana / Pacifica" value={wallet.solanaAddress} />

			<div className="grid grid-cols-2 gap-3">
				<Figure
					label="On Pacifica"
					value={
						balances.pacifica.equityUsdc === null
							? "not funded"
							: formatUsd(balances.pacifica.equityUsdc)
					}
					hint={
						available === null
							? "no deposit yet"
							: `${formatUsd(balances.pacifica.availableUsdc)} free`
					}
				/>
				<Figure
					label="Waiting to deposit"
					value={formatUsd(balances.solana.idleUsdc)}
					hint={idle > 0 ? "bridged, not yet credited" : "nothing in transit"}
					tone={idle > 0 ? "warning" : undefined}
				/>
			</div>

			{/*
			  The minimums, stated before anyone bridges rather than after.

			  This is the failure the panel exists to prevent: a deposit below
			  Pacifica's floor is accepted by the bridge and rejected on arrival,
			  which strands USDC on Solana with no visible cause and no obvious fix.
			*/}
			<div className="rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-3 py-2.5">
				<p className="firm-label text-[var(--pon-fg-3)]">Pacifica minimums</p>
				<dl className="mt-2 space-y-1.5 text-[11.5px]">
					<div className="flex items-baseline justify-between gap-3">
						<dt className="text-[var(--pon-fg-3)]">Smallest deposit accepted</dt>
						<dd className="font-fono font-bold text-[var(--pon-fg)]">
							${balances.minimums.depositUsdc}
						</dd>
					</div>
					<div className="flex items-baseline justify-between gap-3">
						<dt className="text-[var(--pon-fg-3)]">Workable margin</dt>
						<dd className="font-fono font-bold text-[var(--pon-fg)]">
							${balances.minimums.positionUsdc}
						</dd>
					</div>
				</dl>
				<p className="mt-2 text-[10.5px] leading-relaxed text-[var(--pon-fg-3)]">
					A deposit under ${balances.minimums.depositUsdc} is rejected on arrival and the USDC sits
					on Solana until you sweep it. The second figure is not a venue rule — it is roughly what
					you need before anything on the board is actually enterable, because each market has its
					own minimum position size on top of the deposit floor.
				</p>
			</div>

			{idle > 0 && (
				<Callout tone="warning" title="USDC is sitting outside Pacifica">
					{formatUsd(balances.solana.idleUsdc)} has reached your Solana address but has not been
					credited to Pacifica. It is not backing any position and is not earning anything.
					{idle < balances.minimums.depositUsdc
						? ` It is also below the $${balances.minimums.depositUsdc} deposit minimum, so it cannot be credited until more is bridged across.`
						: ""}
				</Callout>
			)}

			{costs && !costs.feePayerConfigured && (
				<Callout tone="danger" title="This deployment cannot fund deposits">
					No Solana fee payer is configured, so nothing can pay the transaction fee that credits a
					deposit. Bridged USDC would arrive and stay stuck. This is an operator setting —
					`SOLANA_FEE_PAYER_SECRET`.
				</Callout>
			)}

			{!balances.solana.tokenAccountReady && costs && (
				<p className="text-[11px] leading-relaxed text-[var(--pon-fg-3)]">
					Your USDC account on Solana does not exist yet. Creating it costs a one-off rent of about{" "}
					{(Number(costs.tokenAccountRentLamports) / 1e9).toFixed(4)} SOL, paid by the platform
					rather than by you — a derived address holds USDC and never SOL, so it could not pay for
					its own account.
				</p>
			)}

			<details className="text-[11.5px]">
				<summary className="cursor-pointer text-[var(--pon-fg-3)]">
					Who controls this address?
				</summary>
				<div className="mt-2 space-y-2 leading-relaxed text-[var(--pon-fg-2)]">
					<p>
						Signing for it happens through the NEAR MPC network, which acts when this deployment's
						relayer asks it to. So: the funds are yours and nobody else's are pooled with them, you
						can withdraw at any time, and the address is reproducible from your connected wallet
						alone — lose this app entirely and the same wallet still derives the same account. But
						this deployment <em>can</em> sign for it. It is the same trust boundary the vault agents
						sit behind.
					</p>
					<p>
						That is exactly why your spot leg is not here. It stays in the wallet you connected,
						where we cannot reach it, and it is the larger half of every position.
					</p>
					<p className="font-fono text-[10.5px] text-[var(--pon-fg-3)]">
						Derivation path: {wallet.path}
					</p>
				</div>
			</details>
		</div>
	);
}

function Figure({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: string;
	hint?: string;
	tone?: "warning";
}) {
	return (
		<div className="rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-3 py-2.5">
			<p className="firm-label text-[var(--pon-fg-3)]">{label}</p>
			<p
				className={cn(
					"font-fono mt-1.5 text-[17px] font-bold leading-tight",
					tone === "warning" ? "text-[var(--pon-amber)]" : "text-[var(--pon-fg)]",
				)}
			>
				{value}
			</p>
			{hint && <p className="mt-0.5 text-[10.5px] text-[var(--pon-fg-3)]">{hint}</p>}
		</div>
	);
}

/**
 * An address with a copy button and a link out.
 *
 * Copyable because this one genuinely has to be: it is where a user sends USDC
 * from an exchange, and an address retyped by hand is an address that loses the
 * transfer. Linked out because a balance the app asserts should be checkable
 * against the chain without taking the app's word for it.
 */
function AddressRow({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard access is denied in some embedded contexts — a mini-app
			// frame among them. The address is selectable text either way, so a
			// failed copy is a minor inconvenience rather than something to report.
		}
	};

	return (
		<div className="rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-3 py-2.5">
			<p className="firm-label text-[var(--pon-fg-3)]">{label}</p>
			<div className="mt-1.5 flex items-center gap-2">
				<code className="min-w-0 flex-1 truncate font-fono text-[11.5px] text-[var(--pon-fg)]">
					{value}
				</code>
				<button
					type="button"
					onClick={copy}
					aria-label={`Copy ${label} address`}
					className="shrink-0 rounded p-1 text-[var(--pon-fg-3)] transition-colors hover:text-[var(--pon-fg-0)]"
				>
					{copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
				</button>
				<a
					href={`https://solscan.io/account/${value}`}
					target="_blank"
					rel="noreferrer"
					aria-label={`View ${label} address on Solscan`}
					className="shrink-0 rounded p-1 text-[var(--pon-fg-3)] transition-colors hover:text-[var(--pon-fg-0)]"
				>
					<ExternalLink size={13} aria-hidden />
				</a>
			</div>
		</div>
	);
}
