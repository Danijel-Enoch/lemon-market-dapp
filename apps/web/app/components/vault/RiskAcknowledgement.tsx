import type { Vault } from "@lemon/client";
import { Button } from "@lemon/ui";
import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * What someone is agreeing to when they put money in.
 *
 * Shown before every deposit rather than once per visit, because the thing
 * being consented to is the deposit itself — a person who acknowledged this
 * before sending $10 has not thereby agreed to it for the $10,000 they send a
 * month later. It is one checkbox and one button in the way of a transaction
 * that cannot be undone, against contracts that have not been audited.
 *
 * Every line below is a risk this app actually runs, taken from the disclaimer
 * in the README rather than written fresh. That matters: a risk notice
 * assembled from the usual phrases would be longer, vaguer, and would not
 * mention the two things most likely to surprise someone here — that a
 * delta-neutral position still loses money when funding turns negative, and
 * that withdrawals are queued for days because a real position has to be
 * unwound before anyone can be paid.
 *
 * Deliberately not dismissible by clicking away. Escape and Cancel both work
 * and both mean "no"; there is no path through this dialog that deposits
 * without the box ticked.
 */
export function RiskAcknowledgement({
	vault,
	amountLabel,
	onConfirm,
	onCancel,
}: {
	vault: Vault;
	/** The amount about to be deposited, already formatted. */
	amountLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const [agreed, setAgreed] = useState(false);
	const checkboxId = useId();
	const titleId = useId();
	const cancelRef = useRef<HTMLButtonElement>(null);

	// Focus lands on Cancel, not Confirm: the safe option should be the one a
	// stray keypress takes, and the destructive one should need aiming at.
	useEffect(() => {
		cancelRef.current?.focus();
	}, []);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") onCancel();
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onCancel]);

	const leveraged = vault.tier === "LEVERAGED";

	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--pon-ink)]/70 p-0 sm:items-center sm:p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			data-testid="risk-acknowledgement"
		>
			<div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5 sm:rounded-[var(--pon-r-lg,16px)]">
				<div className="flex items-start gap-3">
					<AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--pon-amber)]" />
					<div className="min-w-0">
						<h2 id={titleId} className="text-base font-medium text-[var(--pon-fg-0)]">
							You can lose money in this vault
						</h2>
						<p className="mt-1 text-sm text-[var(--pon-fg-2)]">
							You are about to deposit <span className="tabular-nums">{amountLabel}</span> into{" "}
							{vault.name}. Read this before you do.
						</p>
					</div>
				</div>

				<ul className="mt-4 space-y-2.5 text-sm text-[var(--pon-fg-2)]">
					<Risk title="Hedged is not safe">
						The vault holds an asset and shorts the same size against it, so a price move gains on
						one leg what it loses on the other. That removes the price bet. It does not remove the
						risk, and it does not promise a return.
					</Risk>
					<Risk title="Funding can turn against you">
						What the vault earns is the funding rate the perp market pays to be held. That rate can
						go negative, and while it is negative the position costs money to keep open.
					</Risk>
					<Risk title="The spot leg can become illiquid">
						The hedge only works while both legs can be traded. A spot market that thins out or
						stops routing leaves a position that cannot be closed at the price the vault is marked
						at.
					</Risk>
					{leveraged && (
						<Risk title="This vault is leveraged, so the short can be liquidated">
							A leveraged vault borrows to size its hedge. A fast enough move against the short can
							liquidate it before the vault can add margin, and a liquidated leg is a realised loss
							that the spot side does not give back.
						</Risk>
					)}
					<Risk title="Your USDC is held by a contract and traded by an agent">
						This is custodial. An automated agent moves the money between venues and reports what
						the position is worth. Limits bound what a compromised agent can do and every trade is
						published, but the position itself lives off-chain and its value has to be reported
						rather than read.
					</Risk>
					<Risk title="The contracts have not been independently audited">
						A bug in them can lose everything in them.
					</Risk>
					<Risk title="You cannot withdraw on demand">
						Withdrawals are queued for roughly 3 to 7 days, because a real position has to be
						unwound before anyone can be paid. If the agent stops reporting a value, deposits and
						payouts freeze until it resumes.
					</Risk>
				</ul>

				<label
					htmlFor={checkboxId}
					className="mt-5 flex cursor-pointer items-start gap-3 rounded-[var(--pon-r-md,10px)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-3"
				>
					<input
						id={checkboxId}
						type="checkbox"
						checked={agreed}
						onChange={(event) => setAgreed(event.target.checked)}
						className="mt-0.5 size-4 shrink-0 accent-[var(--pon-accent)]"
						data-testid="risk-acknowledgement-agree"
					/>
					<span className="text-sm text-[var(--pon-fg)]">
						I understand I could lose some or all of this money, and by depositing I accept every
						risk described above and every other risk this protocol runs.
					</span>
				</label>

				<div className="mt-4 flex gap-3">
					<Button ref={cancelRef} variant="outline" className="flex-1" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						className="flex-1"
						disabled={!agreed}
						onClick={onConfirm}
						data-testid="risk-acknowledgement-confirm"
					>
						Deposit {amountLabel}
					</Button>
				</div>
			</div>
		</div>
	);
}

function Risk({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<li>
			<span className="font-medium text-[var(--pon-fg-0)]">{title}.</span>{" "}
			<span className="text-[var(--pon-fg-2)]">{children}</span>
		</li>
	);
}
