import type { AdlRisk, LivePosition } from "@lemon/client";
import { formatRelative, formatUnits, formatUsd, toBigInt } from "@lemon/client";
import { cn } from "@lemon/ui";
import {
	AlertTriangle,
	ArrowDownLeft,
	Check,
	Copy,
	ExternalLink,
	ShieldAlert,
	TrendingUp,
} from "lucide-react";
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

			<AdlPanel adl={position.perp.adl} spotSymbol={position.spot.symbol} />

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

/**
 * Auto-deleveraging exposure, stated as a risk to the *hedge* rather than as a
 * venue curiosity.
 *
 * The framing is deliberate. A depositor reading "ADL" learns nothing; what they
 * need to know is that the venue can close the short — the leg protecting them —
 * without asking, and that it becomes able to do so precisely when the spot leg
 * is falling. So the panel leads with the plain-language consequence and keeps
 * the score underneath it.
 *
 * It is shown when the position is idle too, reading "not in the queue". A risk
 * indicator that only appears once the risk is live teaches nobody what it means
 * and looks like an alarm when it finally shows up.
 */
function AdlPanel({ adl, spotSymbol }: { adl: AdlRisk; spotSymbol: string | null }) {
	const alarming = adl.lamps >= 3;
	const tone = alarming
		? "border-[var(--pon-down)]/40 bg-[var(--pon-down)]/10"
		: adl.lamps > 0
			? "border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/[0.07]"
			: "border-[var(--pon-line)]";

	return (
		<div className={cn("space-y-3 rounded-[var(--pon-r-md,12px)] border p-4", tone)}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<ShieldAlert
						className={cn(
							"size-4",
							alarming
								? "text-[var(--pon-down)]"
								: adl.lamps > 0
									? "text-[var(--pon-amber)]"
									: "text-[var(--pon-fg-3)]",
						)}
					/>
					<h3 className="text-sm font-medium text-[var(--pon-fg-0)]">Auto-deleveraging risk</h3>
				</div>
				<div className="flex items-center gap-2">
					<Lamps lit={adl.lamps} />
					<span
						className={cn(
							"text-xs font-medium uppercase tracking-wide",
							alarming
								? "text-[var(--pon-down)]"
								: adl.lamps > 0
									? "text-[var(--pon-amber)]"
									: "text-[var(--pon-fg-3)]",
						)}
					>
						{adl.band === "none" ? "Not in the queue" : adl.band}
					</span>
				</div>
			</div>

			<p className="text-xs leading-relaxed text-[var(--pon-fg-2)]">
				{adl.eligible ? (
					<>
						Pacifica can close this short without warning to cover a trader it could not liquidate
						cleanly. It only takes <em>winning</em> positions — so the hedge becomes eligible
						exactly when {spotSymbol ?? "the spot leg"} is falling and the hedge is what is
						protecting you. If that happens, the vault is left holding spot that is down, unhedged,
						until the agent can re-open the short.
					</>
				) : (
					<>
						Pacifica can close a short without warning to cover a trader it could not liquidate
						cleanly, but it only takes <em>winning</em> positions. This one is not winning, so it is
						not in the queue. That changes the moment {spotSymbol ?? "the spot leg"} falls below the
						short's entry — which is also when the hedge starts mattering most.
					</>
				)}
			</p>

			<dl className="space-y-1 text-xs">
				<Row
					label="Queue score"
					value={adl.eligible ? adl.score.toFixed(3) : "—"}
					hint="Unrealised profit as a fraction of entry, times effective leverage. This is what venues rank the queue by."
				/>
				<Row
					label="Leg profit"
					value={`${adl.profitPercent >= 0 ? "+" : ""}${adl.profitPercent.toFixed(2)}%`}
					tone={adl.profitPercent > 0 ? "down" : undefined}
					hint="Profit on the short. Counterintuitively this is the risk direction: only profitable positions are auto-deleveraged."
				/>
				<Row
					label="Effective leverage"
					value={adl.effectiveLeverage === null ? "—" : `${adl.effectiveLeverage.toFixed(2)}x`}
					hint="The only input the vault controls. The score is linear in it, so a 3x vault sits three times deeper in the queue than a 1x vault at the same drawdown."
				/>
				{adl.nextBand &&
					(adl.nextBandReachable ? (
						<Row
							label={`Until "${adl.nextBand}"`}
							value={
								adl.headroomPercent === null
									? "—"
									: `${adl.headroomPercent.toFixed(2)}% further fall`
							}
							hint="How much further the mark has to fall to reach the next band, accounting for the equity that fall adds along the way."
						/>
					) : (
						<Row
							label={`Until "${adl.nextBand}"`}
							value="Unreachable"
							hint="Profit adds equity faster than it adds rank, so this position's score peaks below that band at any price."
						/>
					))}
				{adl.stress.markVsOraclePercent !== null && (
					<Row
						label="Mark vs oracle"
						value={`${adl.stress.markVsOraclePercent >= 0 ? "+" : ""}${adl.stress.markVsOraclePercent.toFixed(3)}%`}
						tone={adl.stress.markVsOraclePercent < -0.5 ? "down" : undefined}
						hint="Mark below oracle means forced selling is under way — the conditions in which the queue actually gets processed. Context, not part of the score."
					/>
				)}
			</dl>

			<p className="text-[11px] leading-relaxed text-[var(--pon-fg-4)]">
				The queue is ranked against every other position on Pacifica, and those are not public. This
				score is where the vault sits <em>if</em> the queue is processed — not the chance that it
				will be. Pacifica publishes no ADL endpoint; this is computed from the public position and
				price data shown above.
			</p>
		</div>
	);
}

/** Five lamps, the convention every venue uses for this. */
function Lamps({ lit }: { lit: number }) {
	return (
		// Decorative. The band name is rendered as text directly beside these, so
		// a screen reader gets the meaning without having to interpret lamps.
		<span className="flex items-center gap-0.5" aria-hidden="true">
			{[1, 2, 3, 4, 5].map((n) => (
				<span
					key={n}
					className={cn(
						"h-3 w-1.5 rounded-[1px]",
						n > lit
							? "bg-[var(--pon-line-2)]"
							: lit >= 3
								? "bg-[var(--pon-down)]"
								: "bg-[var(--pon-amber)]",
					)}
				/>
			))}
		</span>
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
