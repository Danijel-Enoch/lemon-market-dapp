import { adminApi, formatRelative, type Vault } from "@lemon/client";
import { Button } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

/**
 * Tell a vault's agent to close everything and send the money home — or lift
 * that order.
 *
 * The confirmation exists because this is the most consequential button on the
 * console. It sells every depositor's position at whatever the market is when
 * the agent's next tick runs, and the sale is not reversible: lifting the order
 * afterwards buys back in at a different price, having paid two round trips of
 * fees in between.
 *
 * What it deliberately is *not* is a pause or a stop. Both of those are already
 * available and neither does this:
 *
 *  - **Pausing the vault** is on-chain and stops deposits. The position stays
 *    open and the agent keeps running it.
 *  - **Stopping the agent** stops it reporting, which stales the NAV and blocks
 *    deposits *and* the withdrawal queue on-chain. The position also stays open,
 *    unmanaged, with nobody rebalancing the hedge.
 *
 * Under a close order the agent keeps ticking: it reports NAV, it fulfils
 * redemptions, it simply holds no position and opens no new one. That is the
 * state an operator winding a vault down actually wants, and it is why this is
 * its own lever rather than a use of one of the other two.
 */
export function CloseVaultDialog({ vault, onClose }: { vault: Vault; onClose: () => void }) {
	const queryClient = useQueryClient();
	const standing = vault.closeRequestedAt !== null;

	const [reason, setReason] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const label = vault.ticker ?? vault.symbol;
	// Typed rather than clicked. A button that closes every position in a vault
	// is one an operator should not be able to reach by muscle memory from the
	// row above it.
	const confirmed = confirmation.trim().toUpperCase() === label.toUpperCase();

	async function submit(closing: boolean) {
		setBusy(true);
		setError(null);
		try {
			await adminApi.setCloseOrder(vault.address, closing, reason || undefined);
			queryClient.invalidateQueries({ queryKey: ["admin-vaults"] });
			queryClient.invalidateQueries({ queryKey: ["vaults"] });
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
			<div
				role="dialog"
				aria-modal="true"
				aria-label={standing ? `Resume trading ${label}` : `Close all positions in ${label}`}
				className="w-full max-w-lg rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-6"
			>
				{standing ? (
					<>
						<h2 className="text-lg font-medium text-[var(--pon-fg-0)]">Resume trading {label}</h2>
						<p className="mt-2 text-sm text-[var(--pon-fg-2)]">
							A close order has stood since {since(vault.closeRequestedAt)}
							{vault.closeCompletedAt
								? `, and the agent reported the vault flat ${since(vault.closeCompletedAt)}.`
								: ". The agent has not yet reported the position flat."}
						</p>
						<p className="mt-2 text-sm text-[var(--pon-fg-3)]">
							Lifting it lets the agent deploy again on its next tick. It will buy back into the
							vault's markets at whatever the market is then — which is not the price it sold at,
							and the round trip has already cost two sets of fees.
						</p>

						{error && <Problem>{error}</Problem>}

						<footer className="mt-6 flex justify-end gap-2">
							<Button variant="ghost" onClick={onClose}>
								Cancel
							</Button>
							<Button variant="shine" disabled={busy} onClick={() => submit(false)}>
								{busy ? "Working…" : "Lift the order"}
							</Button>
						</footer>
					</>
				) : (
					<>
						<h2 className="text-lg font-medium text-[var(--pon-fg-0)]">
							Close all positions in {label}
						</h2>
						<p className="mt-2 text-sm text-[var(--pon-fg-2)]">
							The agent will sell every spot leg, close every short, sweep the margin account, and
							send all of it back to the vault. It starts on the next tick and takes minutes per
							market — venue orders, a bridge, and a return transaction.
						</p>
						<p className="mt-2 text-sm text-[var(--pon-fg-3)]">
							The order stands until you lift it. The agent keeps reporting NAV and keeps paying
							redemptions — it just holds no position. Depositors can still deposit and withdraw;
							their money simply sits idle.
						</p>

						<label className="mt-5 block">
							<span className="text-sm text-[var(--pon-fg-2)]">Why (optional)</span>
							<input
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								maxLength={500}
								placeholder="Funding has been negative for a week"
								className="mt-1 w-full rounded-[var(--pon-r-sm,8px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3 py-2 text-[var(--pon-fg-0)]"
							/>
							<span className="mt-1 block text-xs text-[var(--pon-fg-4)]">
								Kept after the order is lifted. "Who unwound this vault in March and why" gets asked
								long after the answer has left anyone's memory.
							</span>
						</label>

						<label className="mt-4 block">
							<span className="text-sm text-[var(--pon-fg-2)]">
								Type <span className="font-mono text-[var(--pon-fg-0)]">{label}</span> to confirm
							</span>
							<input
								value={confirmation}
								onChange={(e) => setConfirmation(e.target.value)}
								autoComplete="off"
								className="mt-1 w-full rounded-[var(--pon-r-sm,8px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3 py-2 font-mono text-[var(--pon-fg-0)]"
							/>
						</label>

						{error && <Problem>{error}</Problem>}

						<footer className="mt-6 flex justify-end gap-2">
							<Button variant="ghost" onClick={onClose}>
								Cancel
							</Button>
							<Button variant="outline" disabled={busy || !confirmed} onClick={() => submit(true)}>
								{busy ? "Working…" : "Close all positions"}
							</Button>
						</footer>
					</>
				)}
			</div>
		</div>
	);
}

/**
 * An ISO timestamp as "3 hours ago".
 *
 * `formatRelative` takes unix seconds, which is what everything read from the
 * chain is measured in; these two columns are Postgres timestamps and arrive as
 * ISO strings. Converted at the boundary rather than changing the formatter,
 * because a formatter that accepted both would silently treat a mistaken
 * millisecond value as a date fifty thousand years out.
 */
function since(iso: string | null): string {
	if (!iso) return "an unknown time";
	return formatRelative(Math.floor(new Date(iso).getTime() / 1000));
}

function Problem({ children }: { children: React.ReactNode }) {
	return (
		<div className="mt-5 flex gap-2 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-down)] bg-[var(--pon-lime-dim)] p-3 text-sm">
			<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--pon-down)]" />
			<p className="text-[var(--pon-fg-2)]">{children}</p>
		</div>
	);
}
