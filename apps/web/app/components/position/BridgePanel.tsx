import { useSignedSteps } from "@app/hooks/useSignedSteps";
import { type BridgeQuote, formatUsd, selfApi, type UserBalances } from "@lemon/client";
import { Button, Callout, cn } from "@lemon/ui";
import { ENABLED_CHAINS } from "@lemon/wallet";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * Moving USDC to where a position needs it.
 *
 * Two routes that look similar and are not. **To margin** sends USDC to the
 * derived Solana address and then credits it to Pacifica — two transactions,
 * signed by two different parties, minutes apart. **Between chains** moves USDC
 * between the user's own EVM wallets and never touches Solana at all; it exists
 * because the spot leg is chain-specific and USDC on Base cannot buy an X Layer
 * market.
 *
 * The panel keeps them as one control with one destination picker, because from
 * the user's side the question really is just "where does this money need to
 * be". What it does not do is hide the difference in what happens afterwards: a
 * margin bridge has a second step that only the server can take, and a bridge
 * that has landed but not been credited is USDC earning nothing and backing
 * nothing.
 *
 * ## Why the deposit is a separate button
 *
 * It could be automatic, and making it automatic would be worse. Crediting a
 * deposit is signed by the MPC network and paid for by a platform fee payer, and
 * both can be briefly unavailable. Folded into the bridge, that failure would
 * present as "your bridge failed" when the money has in fact arrived safely —
 * the most alarming possible framing of a delay. Kept separate, the bridge
 * succeeds, the funds are visibly in the margin wallet, and one button finishes
 * the job whenever it is pressed.
 */

type Destination = "margin" | string;

export function BridgePanel({ balances }: { balances: UserBalances }) {
	const queryClient = useQueryClient();
	const [stepState, runSteps] = useSignedSteps();

	const chains = ENABLED_CHAINS;
	const [originChainId, setOriginChainId] = useState<number>(chains[0]?.chain.id ?? 8453);
	const [destination, setDestination] = useState<Destination>("margin");
	const [amountInput, setAmountInput] = useState("100");

	const [quote, setQuote] = useState<BridgeQuote | null>(null);
	const [busy, setBusy] = useState<"quoting" | "sending" | "depositing" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const amount = Number(amountInput) || 0;
	const idle = Number(balances.solana.idleUsdc) / 1e6;
	const anyBusy = busy !== null || stepState.running;

	const belowMinimum =
		destination === "margin" && amount > 0 && amount < balances.minimums.depositUsdc;

	async function onQuote() {
		setBusy("quoting");
		setError(null);
		setNotice(null);
		setQuote(null);
		try {
			const result = await selfApi.bridgeQuote({
				to: destination === "margin" ? "margin" : "chain",
				originChainId,
				destinationChainId: destination === "margin" ? undefined : Number(destination),
				amount: String(BigInt(Math.round(amount * 1e6))),
			});
			setQuote(result);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	}

	async function onSend() {
		if (!quote) return;
		setBusy("sending");
		setError(null);
		try {
			const hash = await runSteps(quote.steps);
			if (!hash) throw new Error("No transaction was sent.");

			await selfApi.bridgeSent({
				requestId: quote.requestId,
				to: destination === "margin" ? "margin" : "chain",
				originChainId: quote.originChainId,
				recipient: quote.recipient,
				amount: quote.amount,
				txRef: hash,
			});

			setNotice(
				destination === "margin"
					? "Sent. It usually lands in a few minutes — the balance above will pick it up, and then “Credit to Pacifica” finishes the job."
					: "Sent. It usually lands in a few minutes.",
			);
			setQuote(null);
			await queryClient.invalidateQueries({ queryKey: ["self-balances"] });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	}

	async function onDeposit() {
		setBusy("depositing");
		setError(null);
		setNotice(null);
		try {
			const result = await selfApi.depositMargin();
			setNotice(
				result.signature
					? `Credited ${result.deposited} USDC to Pacifica. It is margin now and can back a position.`
					: (result.reason ?? "There was nothing to credit."),
			);
			await queryClient.invalidateQueries({ queryKey: ["self-balances"] });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="space-y-4 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
			<div>
				<h2 className="firm-label text-[var(--pon-fg-0)]">Move USDC</h2>
				<p className="mt-1 text-[11.5px] leading-relaxed text-[var(--pon-fg-3)]">
					Margin has to be on Pacifica before a position can be opened, and the spot leg has to be
					bought on the chain the market lives on. This moves USDC to either.
				</p>
			</div>

			<div className="space-y-2">
				<span className="firm-label block text-[var(--pon-fg-3)]">From</span>
				<div className="flex flex-wrap gap-1.5">
					{chains.map((entry) => (
						<button
							key={entry.chain.id}
							type="button"
							onClick={() => setOriginChainId(entry.chain.id)}
							className={cn(
								"rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
								originChainId === entry.chain.id
									? "border-[var(--pon-ink)] bg-[var(--pon-lime-dim)] text-[var(--pon-fg-0)]"
									: "border-[var(--pon-line)] text-[var(--pon-fg-3)] hover:border-[var(--pon-ink)]",
							)}
						>
							{entry.chain.name}
						</button>
					))}
				</div>
			</div>

			<div className="flex justify-center">
				<ArrowDown size={14} className="text-[var(--pon-fg-3)]" aria-hidden />
			</div>

			<div className="space-y-2">
				<span className="firm-label block text-[var(--pon-fg-3)]">To</span>
				<div className="flex flex-wrap gap-1.5">
					<button
						type="button"
						onClick={() => setDestination("margin")}
						className={cn(
							"rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
							destination === "margin"
								? "border-[var(--pon-ink)] bg-[var(--pon-lime-dim)] text-[var(--pon-fg-0)]"
								: "border-[var(--pon-line)] text-[var(--pon-fg-3)] hover:border-[var(--pon-ink)]",
						)}
					>
						Margin wallet
					</button>
					{chains
						.filter((entry) => entry.chain.id !== originChainId)
						.map((entry) => (
							<button
								key={entry.chain.id}
								type="button"
								onClick={() => setDestination(String(entry.chain.id))}
								className={cn(
									"rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
									destination === String(entry.chain.id)
										? "border-[var(--pon-ink)] bg-[var(--pon-lime-dim)] text-[var(--pon-fg-0)]"
										: "border-[var(--pon-line)] text-[var(--pon-fg-3)] hover:border-[var(--pon-ink)]",
								)}
							>
								{entry.chain.name}
							</button>
						))}
				</div>
			</div>

			<div className="space-y-1.5">
				<label htmlFor="bridge-amount" className="firm-label block text-[var(--pon-fg-3)]">
					Amount (USDC)
				</label>
				<input
					id="bridge-amount"
					type="number"
					inputMode="decimal"
					min={0}
					value={amountInput}
					onChange={(event) => {
						setAmountInput(event.target.value);
						setQuote(null);
					}}
					className="font-fono w-full rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] bg-[var(--pon-bg)] px-3 py-2.5 text-[15px] font-bold text-[var(--pon-fg)] focus:border-[var(--pon-ink)] focus:outline-none"
				/>
			</div>

			{/*
			  Stated before the bridge rather than after it, because this is the one
			  failure with no clean recovery: a deposit under the minimum is accepted
			  by the bridge and refused on arrival, leaving USDC on Solana that
			  cannot be credited until more is sent after it.
			*/}
			{belowMinimum && (
				<Callout tone="warning">
					Pacifica refuses deposits under ${balances.minimums.depositUsdc}. This would bridge
					successfully and then fail to credit, leaving the USDC sitting in your margin wallet until
					you send more across.
				</Callout>
			)}

			{quote ? (
				<div className="space-y-2">
					<div className="rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-3 py-2.5 text-[11.5px]">
						<p className="text-[var(--pon-fg-3)]">
							Expected to arrive:{" "}
							<span className="font-fono font-bold text-[var(--pon-fg)]">
								{quote.destinationAmountFormatted || "—"} USDC
							</span>
						</p>
						<p className="mt-1 break-all text-[10.5px] text-[var(--pon-fg-3)]">
							to {quote.recipient}
						</p>
						<p className="mt-1 text-[10.5px] text-[var(--pon-fg-3)]">
							{quote.steps.length === 1
								? "One transaction to approve."
								: `${quote.steps.length} transactions to approve, in order.`}
						</p>
					</div>
					<Button className="w-full" onClick={onSend} disabled={anyBusy}>
						{anyBusy ? <Loader2 className="size-4 animate-spin" /> : null}
						{sendLabel(stepState.progress)}
					</Button>
				</div>
			) : (
				<Button
					className="w-full"
					variant="secondary"
					onClick={onQuote}
					disabled={anyBusy || amount <= 0}
				>
					{busy === "quoting" ? <Loader2 className="size-4 animate-spin" /> : null}
					Get a quote
				</Button>
			)}

			{/* Only offered when there is something to credit. */}
			{idle > 0 && (
				<div className="space-y-1.5 border-t border-[var(--pon-line)] pt-4">
					<p className="text-[11.5px] leading-relaxed text-[var(--pon-fg-2)]">
						{formatUsd(balances.solana.idleUsdc)} has landed in your margin wallet and is not yet on
						Pacifica. It backs nothing until it is credited.
					</p>
					<Button
						className="w-full"
						variant="secondary"
						onClick={onDeposit}
						disabled={anyBusy || idle < balances.minimums.depositUsdc}
					>
						{busy === "depositing" ? <Loader2 className="size-4 animate-spin" /> : null}
						Credit to Pacifica
					</Button>
					{idle < balances.minimums.depositUsdc && (
						<p className="text-[10.5px] leading-relaxed text-[var(--pon-fg-3)]">
							Below the ${balances.minimums.depositUsdc} minimum, so Pacifica would reject it.
							Bridge a little more across and both amounts credit together.
						</p>
					)}
				</div>
			)}

			{notice && <p className="text-[11.5px] leading-relaxed text-[var(--pon-up)]">{notice}</p>}
			{stepState.error && <Callout tone="warning">{stepState.error}</Callout>}
			{error && <Callout tone="warning">{error}</Callout>}
		</div>
	);
}

function sendLabel(
	progress: { label: string; phase: string; index: number; total: number } | null,
) {
	if (!progress) return "Send";
	return progress.phase === "signing"
		? `Approve — ${progress.label.toLowerCase()} (${progress.index + 1}/${progress.total})`
		: "Confirming…";
}
