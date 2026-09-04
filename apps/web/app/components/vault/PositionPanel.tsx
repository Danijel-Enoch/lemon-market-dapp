import type { LivePosition } from "@lemon/client";
import { formatRelative, formatUnits, formatUsd, toBigInt } from "@lemon/client";
import { cn } from "@lemon/ui";
import { AlertTriangle, ArrowDownLeft, Check, Copy, ExternalLink, TrendingUp } from "lucide-react";
import { useState } from "react";

/**
 * What the vault is holding, right now.
 *
 * The distinction from the activity feed matters and the panel says it out loud:
 * those rows are the agent's account of what it *did*, and these numbers are
 * what independently *exists*. The spot leg is an ERC-20 balance on Base and the
 * perp leg is a public Pacifica account — both are shown next to the addresses
 * they were read from, so none of it has to be taken on trust.
 *
 * The discrepancy line is the point of showing both. If what the agent reported
 * and what the venues hold drift apart, that is exactly the number a depositor
 * wants, and reconciling it away silently would remove the only signal that
 * catches a bad report.
 */
export function PositionPanel({ position }: { position: LivePosition }) {
	const spotValue = position.spot.valueUsd;
	const perpMargin = position.perp.marginUsd;
	const discrepancy = position.discrepancyUsd ? BigInt(position.discrepancyUsd) : null;

	return (
		<section className="space-y-4 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
			<div>
				<h2 className="font-medium text-[var(--pon-fg-0)]">Open position</h2>
				<p className="mt-0.5 text-sm text-[var(--pon-fg-3)]">
					Read from Base and Pacifica directly, not from what the agent reported. Both addresses are
					below — you can check either yourself.
				</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				{/* --- spot leg ------------------------------------------------ */}
				<div className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4">
					<div className="flex items-center gap-2">
						<TrendingUp className="size-4 text-[var(--pon-up)]" />
						<span className="text-sm font-medium text-[var(--pon-fg-0)]">
							Long spot{position.spot.symbol ? ` · ${position.spot.symbol}` : ""}
						</span>
					</div>

					<p className="mt-3 text-2xl font-semibold tabular-nums text-[var(--pon-fg-0)]">
						{spotValue === null ? (
							<span
								className="text-[var(--pon-amber)]"
								title="The pool cannot be routed right now, so the holding has no executable price. That is unknown, not zero."
							>
								Unpriced
							</span>
						) : (
							formatUsd(spotValue)
						)}
					</p>

					<dl className="mt-3 space-y-1 text-xs">
						<Row
							label="Held"
							value={
								position.spot.decimals !== null
									? `${formatUnits(position.spot.balance, position.spot.decimals, 4)} ${position.spot.symbol ?? ""}`.trim()
									: "—"
							}
						/>
						<Row
							label="Price"
							value={
								position.spot.priceUsd === null ? "—" : `$${position.spot.priceUsd.toFixed(4)}`
							}
							hint="From a live sell quote at the full holding size, not a mid — a thin pool moves against a real-sized exit."
						/>
						{position.spot.token && (
							<Row
								label="Token"
								value={
									<a
										href={`https://basescan.org/token/${position.spot.token}?a=${position.wallets.evm}`}
										target="_blank"
										rel="noreferrer noopener"
										className="inline-flex items-center gap-1 text-[var(--pon-fg-2)] underline decoration-dotted underline-offset-2 hover:text-[var(--pon-lime)]"
									>
										Base <ExternalLink className="size-3" />
									</a>
								}
							/>
						)}
					</dl>
				</div>

				{/* --- perp leg ------------------------------------------------ */}
				<div className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4">
					<div className="flex items-center gap-2">
						<ArrowDownLeft className="size-4 text-[var(--pon-down)]" />
						<span className="text-sm font-medium text-[var(--pon-fg-0)]">
							Short perp{position.perp.symbol ? ` · ${position.perp.symbol}` : ""}
						</span>
					</div>

					<p className="mt-3 text-2xl font-semibold tabular-nums text-[var(--pon-fg-0)]">
						{position.perp.notionalUsd === null
							? "—"
							: `$${position.perp.notionalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
					</p>

					<dl className="mt-3 space-y-1 text-xs">
						<Row
							label="Size"
							value={
								position.perp.size === 0
									? "—"
									: `${position.perp.size.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
							}
							hint="Negative is short, which is the side a basis position holds."
						/>
						<Row label="Margin" value={perpMargin === null ? "—" : `$${perpMargin.toFixed(2)}`} />
						<Row
							label="Leverage"
							value={
								position.perp.leverage === null ? "—" : `${position.perp.leverage.toFixed(2)}x`
							}
						/>
						<Row
							label="Unrealised"
							value={
								position.perp.unrealisedPnlUsd === null
									? "—"
									: `${position.perp.unrealisedPnlUsd >= 0 ? "+" : ""}$${position.perp.unrealisedPnlUsd.toFixed(2)}`
							}
							tone={
								position.perp.unrealisedPnlUsd === null
									? undefined
									: position.perp.unrealisedPnlUsd >= 0
										? "up"
										: "down"
							}
						/>
						<Row
							label="Funding"
							value={
								position.perp.fundingRateHourlyPercent === null
									? "—"
									: `${position.perp.fundingRateHourlyPercent.toFixed(4)}%/h`
							}
							hint="Positive means the short side receives it. This is the whole return."
						/>
					</dl>
				</div>
			</div>

			{/* --- the two wallets ---------------------------------------------- */}
			<div className="space-y-2 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)] p-4">
				<div className="flex items-center justify-between gap-2">
					<h3 className="text-sm font-medium text-[var(--pon-fg-0)]">The agent's wallets</h3>
					{position.wallets.derivationVerified && (
						<span
							className="inline-flex items-center gap-1 text-xs text-[var(--pon-up)]"
							title="Both addresses were re-derived from the same NEAR path, and the EVM one matches what the vault has on-chain."
						>
							<Check className="size-3.5" /> Derivation checked
						</span>
					)}
				</div>

				{/* The derivation path used to be printed here as a third row. It is
				    still on the API response for anyone reproducing the addresses, but
				    on the page it was an opaque string a depositor cannot act on,
				    sitting directly under two addresses they can. */}
				<p className="text-xs leading-relaxed text-[var(--pon-fg-3)]">
					One NEAR path controls both. No private key exists anywhere — the MPC network signs on
					request — and the EVM address is fixed in the vault as the only place it can send funds.
				</p>

				<AddressRow label="Base (EVM)" value={position.wallets.evm} explorer="basescan" />
				{position.wallets.solana ? (
					<AddressRow label="Solana" value={position.wallets.solana} explorer="solscan" />
				) : (
					<p className="text-xs text-[var(--pon-amber)]">
						The Solana address is not being shown — see the notes below.
					</p>
				)}
			</div>

			{/* --- reconciliation ----------------------------------------------- */}
			<div className="space-y-1.5 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)] p-4 text-xs">
				<Row label="Idle at the agent" value={formatUsd(position.idleAtAgentUsd)} />
				<Row
					label="Observed total"
					value={position.observedValueUsd === null ? "—" : formatUsd(position.observedValueUsd)}
					hint="The legs above, added up from what the venues actually hold."
				/>
				<Row
					label="Agent reported"
					value={formatUsd(position.reportedDeployedUsd)}
					hint="What the vault currently prices its shares against."
				/>
				{discrepancy !== null && (
					<Row
						label="Difference"
						value={`${discrepancy > 0n ? "+" : ""}${formatUsd(discrepancy)}`}
						tone={
							// A few dollars is a bridge in flight or a quote that moved
							// between two calls. A large gap is worth a look, so it is
							// coloured rather than buried.
							absBigInt(discrepancy) > 50_000_000n ? "down" : undefined
						}
						hint="Reported minus observed. Small values are timing — a bridge mid-flight, or a quote that moved between two reads."
					/>
				)}
				<p className="pt-1 text-[var(--pon-fg-4)]">Read {formatRelative(position.observedAt)}.</p>
			</div>

			{position.notes.length > 0 && (
				<div className="flex gap-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/10 p-4">
					<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--pon-amber)]" />
					<ul className="space-y-1 text-xs leading-relaxed text-[var(--pon-fg-2)]">
						{position.notes.map((note) => (
							<li key={note}>{note}</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}

function AddressRow({
	label,
	value,
	explorer,
}: {
	label: string;
	value: string;
	explorer?: "basescan" | "solscan";
}) {
	const [copied, setCopied] = useState(false);
	const href =
		explorer === "basescan"
			? `https://basescan.org/address/${value}`
			: explorer === "solscan"
				? `https://solscan.io/account/${value}`
				: null;

	return (
		<div className="flex items-center justify-between gap-2 text-xs">
			<span className="shrink-0 text-[var(--pon-fg-3)]">{label}</span>
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate font-mono text-[var(--pon-fg)]">{value}</span>
				<button
					type="button"
					aria-label={`Copy ${label}`}
					onClick={() => {
						navigator.clipboard.writeText(value);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
					className="shrink-0 text-[var(--pon-fg-4)] hover:text-[var(--pon-lime)]"
				>
					{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
				</button>
				{href && (
					<a
						href={href}
						target="_blank"
						rel="noreferrer noopener"
						className="shrink-0 text-[var(--pon-fg-4)] hover:text-[var(--pon-lime)]"
					>
						<ExternalLink className="size-3.5" />
					</a>
				)}
			</div>
		</div>
	);
}

function Row({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: React.ReactNode;
	hint?: string;
	tone?: "up" | "down";
}) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className={cn("text-[var(--pon-fg-3)]", hint && "cursor-help")} title={hint}>
				{label}
			</dt>
			<dd
				className={cn(
					"text-right tabular-nums",
					tone === "up"
						? "text-[var(--pon-up)]"
						: tone === "down"
							? "text-[var(--pon-down)]"
							: "text-[var(--pon-fg)]",
				)}
			>
				{value}
			</dd>
		</div>
	);
}

function absBigInt(value: bigint): bigint {
	return value < 0n ? -value : value;
}

export { toBigInt };
