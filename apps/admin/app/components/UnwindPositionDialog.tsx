import {
	adminApi,
	formatRelative,
	formatUsd,
	type OperatorAction,
	type OperatorStep,
	type PositionSnapshot,
	useVaultPosition,
	useVaultPositionSteps,
	type Vault,
} from "@lemon/client";
import { Button, cn } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Close a vault's position by hand, one step at a time.
 *
 * The close order beside this is an instruction to the *agent*: it is recorded,
 * the agent reads it on its next tick, and the agent does everything in one
 * call. This is the other thing — the operator doing it themselves, with the
 * agent stopped, which is what is left when:
 *
 *  - the agent is on a build that predates a fix the position needs, and
 *    redeploying it is a slow answer to money that is exposed now;
 *  - a close got most of the way through and failed, so what is left is a short
 *    with no spot behind it and margin stranded at the venue;
 *  - the capital should come home and must not be re-deployed by a tick five
 *    minutes later.
 *
 * Four steps, in order, each run and reported separately. That separation is the
 * whole point: an all-or-nothing close that failed at the bridge has nothing
 * useful to offer except another all-or-nothing close.
 *
 * **Between step 1 and step 2 the vault is one-sided.** Selling the spot leaves
 * the short standing with nothing long against it, and the vault is directionally
 * exposed until the short is closed — minutes, usually. The agent's own close
 * never leaves that window open for longer than a single Base transaction,
 * because it closes both legs of a market together. Taking the steps apart is
 * what makes them useful and it is also what opens that window, so it is said
 * plainly here rather than buried.
 */
export function UnwindPositionDialog({ vault, onClose }: { vault: Vault; onClose: () => void }) {
	const queryClient = useQueryClient();
	const label = vault.ticker ?? vault.symbol;

	const position = useVaultPosition(vault.address, true);
	const steps = useVaultPositionSteps(vault.address, true);

	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState<OperatorStep | null>(null);
	const [stoppingAgent, setStoppingAgent] = useState(false);

	const rows = steps.data?.steps ?? [];
	// A stale row is one whose process is gone. It holds nothing up — the API
	// reclaims the lock on the next request — so it must not disable the buttons.
	const running = rows.find((row) => row.status === "RUNNING" && !row.stale) ?? null;
	const agentRunning = position.data?.agentEnabled ?? vault.agentEnabled;

	/**
	 * Re-read the position when a step finishes, and only then.
	 *
	 * The snapshot costs a sell quote per market and a venue read, so it is not
	 * polled. The moment it has actually changed is the moment a step stops
	 * running, which is what this watches for.
	 */
	const wasRunning = useRef<string | null>(null);
	useEffect(() => {
		if (wasRunning.current && wasRunning.current !== running?.id) {
			position.refetch();
		}
		wasRunning.current = running?.id ?? null;
	}, [running?.id, position.refetch]);

	async function run(step: OperatorStep) {
		setError(null);
		setStarting(step);
		try {
			await adminApi.runPositionStep(vault.address, step);
			await steps.refetch();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setStarting(null);
		}
	}

	/**
	 * Stand the agent down from here.
	 *
	 * Every step is refused while the agent is running — it signs from the same
	 * wallet with the same nonce stream and trades the same venue account — and
	 * the control that fixes that is on the row behind this dialog. Offering it
	 * here too saves an operator closing a panel they are about to reopen.
	 */
	async function stopAgent() {
		setError(null);
		setStoppingAgent(true);
		try {
			await adminApi.setAgent(vault.address, false);
			queryClient.invalidateQueries({ queryKey: ["admin-vaults"] });
			await position.refetch();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setStoppingAgent(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
			<div
				role="dialog"
				aria-modal="true"
				aria-label={`Unwind ${label} by hand`}
				className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-6"
			>
				<header className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-lg font-medium text-[var(--pon-fg-0)]">Unwind {label} by hand</h2>
						<p className="mt-1 text-sm text-[var(--pon-fg-3)]">
							These run here and now, against the venues, without waiting for a tick — the same
							orders the agent would place, in four steps you take one at a time. Use them when the
							agent cannot do it: it is stopped, it is on an old build, or a close failed halfway
							and left one leg open.
						</p>
					</div>
					<Button variant="ghost" size="sm" onClick={onClose}>
						Close
					</Button>
				</header>

				{agentRunning && (
					<Notice tone="warning">
						<span>
							The agent is still running, and it signs from the wallet these steps sign from — two
							writers on one wallet is a nonce collision on Base and a pair of racing orders at the
							venue. Every step is refused until it is stopped.
						</span>
						<Button
							variant="outline"
							size="sm"
							className="mt-2"
							disabled={stoppingAgent}
							onClick={stopAgent}
						>
							{stoppingAgent ? "Stopping…" : "Stop the agent"}
						</Button>
					</Notice>
				)}

				<Position snapshot={position.data} loading={position.isLoading} />
				<div className="mt-2 flex justify-end">
					<Button
						variant="ghost"
						size="sm"
						disabled={position.isFetching}
						onClick={() => position.refetch()}
					>
						<RefreshCw className={cn("mr-1.5 size-3.5", position.isFetching && "animate-spin")} />
						{position.isFetching ? "Reading the venues…" : "Re-read the position"}
					</Button>
				</div>

				{error && <Notice tone="danger">{error}</Notice>}

				<ol className="mt-5 space-y-2">
					{STEPS.map((step) => (
						<li
							key={step.step}
							className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)] p-4"
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0 flex-1">
									<p className="font-medium text-[var(--pon-fg-0)]">{step.title}</p>
									<p className="mt-1 text-sm text-[var(--pon-fg-3)]">{step.body}</p>
									{step.caution && (
										<p className="mt-1 text-sm text-[var(--pon-amber)]">{step.caution}</p>
									)}
								</div>
								<Button
									variant="outline"
									size="sm"
									// Disabled while *any* step runs, not just this one. They share one
									// agent wallet, and the API refuses a second step for that reason —
									// better to say so with the control than with an error after the click.
									disabled={agentRunning || running !== null || starting !== null}
									onClick={() => run(step.step)}
								>
									{running?.step === step.step
										? "Running…"
										: starting === step.step
											? "Starting…"
											: step.action}
								</Button>
							</div>
						</li>
					))}
				</ol>

				{/* The thing an operator forgets at exactly the wrong moment. The steps
				    leave the vault flat but say nothing about what happens next, and
				    the agent's first tick after being restarted sees idle USDC and
				    does what it is for. */}
				<p className="mt-4 text-sm text-[var(--pon-fg-4)]">
					When you start the agent again it will see the returned USDC as capital to deploy and open
					the position back up on its first tick. If the vault should stay flat, give it a close
					order — "Close positions" on the row — before restarting it.
				</p>

				<History rows={rows} loading={steps.isLoading} />
			</div>
		</div>
	);
}

/** The four steps, in the order an unwind takes them. */
const STEPS: Array<{
	step: OperatorStep;
	title: string;
	body: string;
	/** The exposure this step opens or leaves open, when it opens one. */
	caution?: string;
	action: string;
}> = [
	{
		step: "CLOSE_SPOT",
		title: "1 · Sell every spot leg",
		body: "Sells each market's holding for USDC through the same router the agent trades on. The proceeds stay in the agent's wallet.",
		caution:
			"This leaves the shorts standing with nothing long against them, so the vault is directionally exposed until step 2 closes them.",
		action: "Close spot",
	},
	{
		step: "CLOSE_PERP",
		title: "2 · Close every short",
		body: "Reduce-only market orders at Pacifica, so they close what is open and cannot flip a leg long. The margin behind them stays in the venue account.",
		action: "Close perps",
	},
	{
		step: "BRIDGE_HOME",
		title: "3 · Bring the margin home",
		body: "Withdraws the venue's free margin, sweeps anything stranded in the Solana wallet, and bridges the lot back in one crossing.",
		caution:
			"The slow step. A venue withdrawal settles on Pacifica's schedule and a Relay fill takes minutes — up to about half an hour in total. Nothing is lost if it times out; run it again.",
		action: "Bridge home",
	},
	{
		step: "RETURN_TO_VAULT",
		title: "4 · Return everything to the vault",
		body: "Sends the agent's whole USDC balance back to the vault. Only after this is the money free assets, and only then can redemptions be paid out of it.",
		action: "Return funds",
	},
];

/**
 * What the venues say is there, read live.
 *
 * Deliberately not the vault's reported NAV. An operator reaching for this
 * dialog has usually stopped the agent, and a stopped agent is exactly what
 * makes the reported figure stale.
 */
function Position({ snapshot, loading }: { snapshot?: PositionSnapshot; loading: boolean }) {
	if (loading) {
		return (
			<p className="mt-5 flex items-center gap-2 text-sm text-[var(--pon-fg-3)]">
				<Loader2 className="size-4 animate-spin" /> Reading both venues…
			</p>
		);
	}

	if (!snapshot) return null;

	if (snapshot.unavailable) {
		return (
			<Notice tone="warning">
				The venues could not be read: {snapshot.unavailable}. The steps below still work — they read
				what is there as they run — but you are taking them without a picture.
			</Notice>
		);
	}

	return (
		<div className="mt-5 overflow-hidden rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)]">
			<table className="w-full text-sm">
				<thead className="bg-[var(--pon-surface)] text-left text-xs text-[var(--pon-fg-3)]">
					<tr>
						<th className="px-4 py-2 font-normal">Market</th>
						<th className="px-4 py-2 text-right font-normal">Spot held</th>
						<th className="px-4 py-2 text-right font-normal">Short open</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-[var(--pon-line)]">
					{snapshot.markets.length === 0 && (
						<tr>
							<td colSpan={3} className="px-4 py-4 text-center text-[var(--pon-fg-3)]">
								No markets configured, so there is nothing to close.
							</td>
						</tr>
					)}
					{snapshot.markets.map((market) => (
						<tr key={market.ticker}>
							<td className="px-4 py-2">
								<p className="text-[var(--pon-fg-0)]">{market.ticker}</p>
								<p className="font-mono text-[11px] text-[var(--pon-fg-4)]">
									{market.symbol} · {market.perpSymbol}
								</p>
							</td>
							<td className="px-4 py-2 text-right tabular-nums">
								<p className="text-[var(--pon-fg-0)]">{units(market.spotUnits)}</p>
								<p className="text-[11px] text-[var(--pon-fg-4)]">
									{/* Null is "no route today", which is not zero — and it is the
									    thing that decides whether the spot can be sold at all. */}
									{market.spotValueUsdc === null
										? "no route today"
										: formatUsd(market.spotValueUsdc)}
								</p>
							</td>
							<td className="px-4 py-2 text-right tabular-nums">
								<p className="text-[var(--pon-fg-0)]">{units(market.perpUnits)}</p>
								<p className="text-[11px] text-[var(--pon-fg-4)]">
									{formatUsd(market.perpNotionalUsdc)}
								</p>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<dl className="grid grid-cols-1 gap-px border-t border-[var(--pon-line)] bg-[var(--pon-line)] sm:grid-cols-3">
				<Figure
					label="Idle at the agent"
					value={formatUsd(snapshot.idleOnBase)}
					note={`USDC on ${snapshot.chainName}, waiting for step 4`}
				/>
				<Figure
					label="Free margin at the venue"
					value={formatUsd(snapshot.unallocatedMargin)}
					note="What step 3 would bring home"
				/>
				<Figure
					label="In flight"
					value={formatUsd(snapshot.inFlight)}
					note="Between the two chains, on neither balance"
				/>
			</dl>
		</div>
	);
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
	return (
		<div className="bg-[var(--pon-surface)] px-4 py-3">
			<dt className="text-xs text-[var(--pon-fg-3)]">{label}</dt>
			<dd className="mt-0.5 tabular-nums text-[var(--pon-fg-0)]">{value}</dd>
			<p className="text-[11px] text-[var(--pon-fg-4)]">{note}</p>
		</div>
	);
}

/**
 * What has been run against this vault, and what came of it.
 *
 * The failures are the half worth keeping. "The NVDA short is smaller than the
 * venue's lot size, so no order can close it" is the difference between
 * understanding a stuck vault and pressing the same button every hour.
 */
function History({ rows, loading }: { rows: OperatorAction[]; loading: boolean }) {
	if (loading) return null;

	return (
		<section className="mt-6">
			<h3 className="text-sm font-medium text-[var(--pon-fg-2)]">Steps run</h3>
			{rows.length === 0 ? (
				<p className="mt-2 text-sm text-[var(--pon-fg-4)]">
					Nothing has been run against this vault by hand.
				</p>
			) : (
				<ul className="mt-2 space-y-2">
					{rows.map((row) => (
						<li key={row.id} className="flex gap-3 text-sm">
							<StatusIcon row={row} />
							<div className="min-w-0">
								<p className="text-[var(--pon-fg)]">
									{STEP_LABEL[row.step]} ·{" "}
									<span className="text-[var(--pon-fg-4)]">{since(row.startedAt)}</span>
								</p>
								{row.status === "RUNNING" && !row.stale && (
									<p className="text-[var(--pon-fg-3)]">
										Running. It reports here when it lands — this page keeps watching, and so does
										the step if you close it.
									</p>
								)}
								{row.stale && (
									<p className="text-[var(--pon-amber)]">
										The process running this stopped reporting, so the record was abandoned.
										Whatever it had already done stands — re-read the position before running it
										again.
									</p>
								)}
								{row.detail && <p className="text-[var(--pon-fg-3)]">{row.detail}</p>}
								{row.error && <p className="text-[var(--pon-down)]">{row.error}</p>}
								{row.activityReported > 0 && (
									<p className="text-[11px] text-[var(--pon-fg-4)]">
										{row.activityReported} row(s) published to the vault's activity feed
									</p>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

const STEP_LABEL: Record<OperatorStep, string> = {
	CLOSE_SPOT: "Close spot",
	CLOSE_PERP: "Close perps",
	BRIDGE_HOME: "Bridge home",
	RETURN_TO_VAULT: "Return funds",
};

function StatusIcon({ row }: { row: OperatorAction }) {
	if (row.status === "RUNNING" && !row.stale) {
		return <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[var(--pon-fg-3)]" />;
	}
	if (row.status === "DONE") {
		return <Check className="mt-0.5 size-4 shrink-0 text-[var(--pon-lime)]" />;
	}
	if (row.status === "FAILED") {
		return <X className="mt-0.5 size-4 shrink-0 text-[var(--pon-down)]" />;
	}
	return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--pon-amber)]" />;
}

function Notice({ tone, children }: { tone: "warning" | "danger"; children: React.ReactNode }) {
	return (
		<div
			className={cn(
				"mt-5 flex flex-col gap-2 rounded-[var(--pon-r-md,12px)] border p-3 text-sm",
				tone === "warning"
					? "border-[var(--pon-amber)] text-[var(--pon-fg-2)]"
					: "border-[var(--pon-down)] text-[var(--pon-fg-2)]",
			)}
		>
			<div className="flex gap-2">
				<AlertTriangle
					className={cn(
						"mt-0.5 size-4 shrink-0",
						tone === "warning" ? "text-[var(--pon-amber)]" : "text-[var(--pon-down)]",
					)}
				/>
				<div>{children}</div>
			</div>
		</div>
	);
}

/**
 * Both legs are reported at a 1e18 basis so they can be compared directly,
 * whatever the spot token's own decimals are.
 */
function units(raw: string): string {
	return (Number(raw) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * An ISO timestamp as "3 minutes ago".
 *
 * `formatRelative` takes unix seconds, which is what everything read from the
 * chain is measured in; these columns are Postgres timestamps and arrive as ISO
 * strings. Converted at the boundary rather than changing the formatter, which
 * would then silently read a mistaken millisecond value as a date fifty thousand
 * years out.
 */
function since(iso: string): string {
	return formatRelative(Math.floor(new Date(iso).getTime() / 1000));
}
