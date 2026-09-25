import { useSignedSteps } from "@app/hooks/useSignedSteps";
import { type BasisMarket, selfApi, useAccountSession } from "@lemon/client";
import { Button, Callout, cn } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAccount } from "wagmi";

/**
 * The button that actually opens a position, and the flow behind it.
 *
 * Three acts, two of them invisible when they go well. The server prepares the
 * spot buy; the wallet signs and confirms it; the server hedges what actually
 * filled. The middle act is the only one the user participates in, and the
 * component's job is to make the other two legible — particularly the third,
 * because between the buy confirming and the hedge landing the user is holding
 * an unhedged long and has every right to know it.
 *
 * ## The failure this is mostly written for
 *
 * The spot buy can succeed and the hedge fail. That is not hypothetical — it is
 * a venue call across a chain signature, and it has every ordinary reason to
 * fail that a network request does. When it happens the user has spent real
 * money and holds a directional position they did not ask for, so the component
 * says exactly that, in those words, and offers the retry that fixes it rather
 * than a generic error. Anything vaguer here would leave someone believing a
 * failed *open* left them with nothing, when it left them long.
 */
export function OpenPosition({
	market,
	notionalUsd,
	leverage,
	disabled,
	disabledReason,
}: {
	market: BasisMarket;
	notionalUsd: number;
	leverage: number;
	disabled: boolean;
	disabledReason?: string;
}) {
	const { address, isConnected } = useAccount();
	const { data: session } = useAccountSession();
	const queryClient = useQueryClient();
	const [stepState, runSteps] = useSignedSteps();

	const [phase, setPhase] = useState<"idle" | "preparing" | "hedging" | "done">("idle");
	const [error, setError] = useState<string | null>(null);
	const [unhedged, setUnhedged] = useState<string | null>(null);
	const [result, setResult] = useState<{ filled: number; shorted: number } | null>(null);

	const signedIn =
		session?.account?.address !== undefined &&
		session.account.address.toLowerCase() === address?.toLowerCase();

	const busy = phase === "preparing" || phase === "hedging" || stepState.running;

	async function onOpen() {
		setError(null);
		setUnhedged(null);
		setPhase("preparing");

		try {
			const prepared = await selfApi.openPosition({
				ticker: market.ticker,
				chainId: market.chainId,
				notionalUsd,
				leverage,
			});

			const hash = await runSteps(prepared.steps);
			if (!hash) throw new Error("No transaction was sent.");

			// From here the spot leg is real. Anything that fails below leaves the
			// user long and unhedged, which is why the catch distinguishes it.
			setPhase("hedging");

			const confirmed = await selfApi.confirmOpen({
				actionId: prepared.actionId,
				txHash: hash,
			});

			setResult({ filled: confirmed.filled, shorted: confirmed.shorted });
			setPhase("done");

			await queryClient.invalidateQueries({ queryKey: ["self-positions"] });
			await queryClient.invalidateQueries({ queryKey: ["self-balances"] });
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);

			// A 502 from the confirm step means the spot went through and the hedge
			// did not. The distinction is the difference between "nothing happened"
			// and "you are now holding an unhedged position", and it must not be
			// flattened into one error box.
			if (phase === "hedging") setUnhedged(message);
			else setError(message);

			setPhase("idle");
			await queryClient.invalidateQueries({ queryKey: ["self-positions"] });
		}
	}

	if (!isConnected) {
		return (
			<Message tone="muted">
				Connect a wallet to open this position. The spot leg is bought by, and stays in, the wallet
				you connect.
			</Message>
		);
	}

	if (!signedIn) {
		return (
			<Message tone="muted">
				<Link to="/positions" className="underline">
					Sign in
				</Link>{" "}
				to open a position. One signature, so the server knows which margin wallet is yours.
			</Message>
		);
	}

	if (phase === "done" && result) {
		return (
			<div className="space-y-2">
				<div className="flex items-start gap-2 rounded-[var(--pon-r-sm)] border border-[var(--pon-up)] px-3 py-2.5">
					<CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[var(--pon-up)]" aria-hidden />
					<div className="text-[11.5px] leading-relaxed text-[var(--pon-fg-2)]">
						<p className="font-medium text-[var(--pon-fg-0)]">Position open and hedged.</p>
						<p className="mt-1">
							Bought {result.filled} {market.spot.symbol} and shorted {result.shorted}{" "}
							{market.perp.symbol} against it — sized to what actually filled, not to the quote.
						</p>
					</div>
				</div>
				<Link
					to="/positions"
					className="block w-full rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-4 py-2.5 text-center text-[13px] font-medium text-[var(--pon-fg-0)] transition-colors hover:bg-[var(--pon-lime-dim)]"
				>
					View it in Positions
				</Link>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<Button className="w-full" onClick={onOpen} disabled={disabled || busy}>
				{busy ? <Loader2 className="size-4 animate-spin" /> : null}
				{busyLabel(phase, stepState.progress) ?? `Open ${market.ticker} position`}
			</Button>

			{disabled && disabledReason && (
				<p className="text-[11px] leading-relaxed text-[var(--pon-fg-3)]">{disabledReason}</p>
			)}

			{busy && (
				<p className="text-[11px] leading-relaxed text-[var(--pon-fg-3)]">
					{phase === "hedging"
						? "Your buy has confirmed. Placing the short now — you are holding an unhedged long until it lands."
						: "Nothing is spent until you approve the swap in your wallet."}
				</p>
			)}

			{stepState.error && !unhedged && <Callout tone="warning">{stepState.error}</Callout>}

			{error && <Callout tone="warning">{error}</Callout>}

			{/*
			  The one error worth a different shape. The user has spent money and
			  holds a directional position; a plain error box would read as "that
			  did not work" and send them away believing nothing happened.
			*/}
			{unhedged && (
				<Callout tone="danger" title="Your buy went through — the hedge did not">
					<p>{unhedged}</p>
					<p className="mt-2">
						You are holding {market.spot.symbol} with nothing short against it, so this is a price
						bet right now rather than a basis position.{" "}
						<Link to="/positions" className="underline">
							Open Positions
						</Link>{" "}
						and use <strong>Place hedge</strong> — it needs no wallet signature and does not buy
						anything again.
					</p>
				</Callout>
			)}
		</div>
	);
}

/** What the button should say while something is happening. */
function busyLabel(
	phase: string,
	progress: { label: string; phase: string; index: number; total: number } | null,
): string | null {
	if (phase === "preparing") return "Quoting the route…";
	if (phase === "hedging") return "Placing the hedge…";
	if (!progress) return null;

	return progress.phase === "signing"
		? `Approve in your wallet — ${progress.label.toLowerCase()} (${progress.index + 1}/${progress.total})`
		: `Confirming ${progress.label.toLowerCase()}…`;
}

function Message({ children, tone }: { children: React.ReactNode; tone: "muted" }) {
	return (
		<p
			className={cn(
				"rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-3 py-2.5 text-[11.5px] leading-relaxed",
				tone === "muted" && "text-[var(--pon-fg-3)]",
			)}
		>
			{children}
		</p>
	);
}

/** Exported for the planner's own disabled state, so the two agree on wording. */
export const OPEN_BLOCKED_ICON = ShieldAlert;
