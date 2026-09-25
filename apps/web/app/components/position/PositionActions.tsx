import { useSignedSteps } from "@app/hooks/useSignedSteps";
import { type SelfPosition, selfApi } from "@lemon/client";
import { Button, Callout } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Scale, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

/**
 * What a holder can do to a position, and what each one costs them.
 *
 * The three actions are deliberately not equal, and the layout says so. Two of
 * them — rebalance and hedge — need **no wallet signature at all**, because both
 * resize the perp and the perp is the leg this server can move alone. Closing
 * does need one, because it sells the spot leg out of the user's own wallet.
 *
 * That distinction is worth surfacing rather than hiding behind three identical
 * buttons. The maintenance of a hedge should feel free, because it nearly is;
 * the exit should feel like a decision, because it is one.
 */
export function PositionActions({ position }: { position: SelfPosition }) {
	const queryClient = useQueryClient();
	const [stepState, runSteps] = useSignedSteps();

	const [busy, setBusy] = useState<"close" | "rebalance" | "hedge" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [exposed, setExposed] = useState<string | null>(null);

	const closed = Boolean(position.closedAt);
	const anyBusy = busy !== null || stepState.running;

	async function refresh() {
		await queryClient.invalidateQueries({ queryKey: ["self-positions"] });
		await queryClient.invalidateQueries({ queryKey: ["self-balances"] });
	}

	async function onRebalance() {
		setBusy("rebalance");
		setError(null);
		setNotice(null);
		try {
			const result = await selfApi.rebalance(position.id);
			setNotice(
				result.direction === "none"
					? "The legs are already level; nothing needed changing."
					: `The short was ${result.direction} by ${result.adjusted} ${position.ticker}. The position is level again.`,
			);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	}

	async function onHedge() {
		setBusy("hedge");
		setError(null);
		setNotice(null);
		try {
			const result = await selfApi.hedge(position.id);
			setNotice(
				`Shorted ${result.shorted} ${position.ticker}. The position is hedged again — nothing was bought and no signature was needed.`,
			);
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	}

	async function onClose() {
		setBusy("close");
		setError(null);
		setNotice(null);
		setExposed(null);

		let spotSold = false;
		try {
			const prepared = await selfApi.closePosition(position.id);

			// An empty step list is a real case, not a failure: a position whose
			// spot leg is already gone needs no signature, only the short bought
			// back. Treating it as an error would strand exactly those positions.
			const hash = prepared.steps.length > 0 ? await runSteps(prepared.steps) : null;
			if (hash) spotSold = true;

			await selfApi.confirmClose({
				actionId: prepared.actionId,
				txHash: hash ?? undefined,
			});

			setNotice(
				"Closed. Your USDC is in your own wallet and the margin is free on Pacifica for the next position — it was not bridged back, which would have cost a fee and a wait you may not want.",
			);
			await refresh();
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			// Spot sold and the short still on is a position that is now net
			// *short*, which is the direction nobody expects to be left holding.
			if (spotSold) setExposed(message);
			else setError(message);
			await refresh();
		} finally {
			setBusy(null);
		}
	}

	if (closed) return null;

	return (
		<div className="space-y-3 border-t border-[var(--pon-line)] px-5 py-4">
			<div className="flex flex-wrap gap-2">
				{/* The recovery action, shown only when there is something to recover. */}
				{!position.hedge.balanced && position.status !== "PERP_ONLY" && (
					<Button size="sm" onClick={onHedge} disabled={anyBusy}>
						{busy === "hedge" ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<ShieldCheck className="size-4" />
						)}
						Place hedge
					</Button>
				)}

				<Button size="sm" variant="secondary" onClick={onRebalance} disabled={anyBusy}>
					{busy === "rebalance" ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Scale className="size-4" />
					)}
					Rebalance
				</Button>

				<Button size="sm" variant="secondary" onClick={onClose} disabled={anyBusy}>
					{busy === "close" ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<X className="size-4" />
					)}
					{closeLabel(busy === "close", stepState.progress)}
				</Button>
			</div>

			<p className="text-[10.5px] leading-relaxed text-[var(--pon-fg-3)]">
				Rebalancing and hedging resize the short only, so neither asks your wallet for anything.
				Closing sells the spot leg out of your wallet and needs a signature.
			</p>

			{notice && <p className="text-[11.5px] leading-relaxed text-[var(--pon-up)]">{notice}</p>}

			{stepState.error && !exposed && <Callout tone="warning">{stepState.error}</Callout>}
			{error && <Callout tone="warning">{error}</Callout>}

			{exposed && (
				<Callout tone="danger" title="Your sale went through — the short did not close">
					<p>{exposed}</p>
					<p className="mt-2">
						The spot leg is sold and the short is still open, so this position is now directionally{" "}
						<strong>short</strong>. Press Close again to retry buying it back — there is nothing
						left to sell, so it will not ask for another signature.
					</p>
				</Callout>
			)}
		</div>
	);
}

function closeLabel(active: boolean, progress: { label: string; phase: string } | null): string {
	if (!active) return "Close";
	if (!progress) return "Closing…";
	return progress.phase === "signing" ? "Approve in wallet" : "Confirming…";
}
