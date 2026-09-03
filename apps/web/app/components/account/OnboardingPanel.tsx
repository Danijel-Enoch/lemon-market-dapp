import { Callout } from "@app/components/common/Callout";
import { Button } from "@app/components/ui/button";
import { ConnectWallet } from "@app/components/ui/ConnectWallet";
import {
	type OnboardingStep,
	useActivatePacifica,
	useOnboarding,
	useSignIn,
} from "@app/hooks/useAccount";
import { ApiError } from "@app/lib/api";
import { cn } from "@app/lib/utils";
import { Check, KeyRound, Loader2, PenLine, Wallet } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Onboarding, as three visible steps.
 *
 * Both signatures are shown up front, done or not, because the second one
 * arrives seconds after the first and an unexplained second wallet prompt reads
 * as something having gone wrong. Naming them in advance turns a suspicious
 * repeat into an expected step.
 */

function steps(
	builderFee: string | null,
): { key: OnboardingStep; label: string; detail: string; icon: typeof Wallet }[] {
	return [
		{
			key: "connect",
			label: "Connect wallet",
			detail: "The wallet you already trade with.",
			icon: Wallet,
		},
		{
			key: "sign-in",
			label: "Sign in",
			detail: "Creates the wallets that hold your funds. Moves nothing.",
			icon: PenLine,
		},
		{
			key: "activate",
			label: "Activate trading",
			// The fee is named here as well as in the signing dialog. Someone who
			// only skims the panel should still learn what the step costs them
			// before their wallet asks them to approve it.
			detail: builderFee
				? `Authorises a key to place orders, and a builder fee of up to ${builderFee} of order value. It cannot withdraw.`
				: "Authorises a key to place orders. It cannot withdraw.",
			icon: KeyRound,
		},
	];
}

function stepIndex(step: OnboardingStep, total: number): number {
	const order: OnboardingStep[] = ["connect", "sign-in", "activate"];
	return step === "ready" ? total : order.indexOf(step);
}

function errorMessage(error: unknown): string {
	if (error instanceof ApiError) return error.message;
	if (error instanceof Error) {
		// Wallets phrase a user-cancelled prompt a dozen different ways, and none
		// of them are worth showing as a failure.
		if (/user rejected|denied|cancell?ed/i.test(error.message)) {
			return "You dismissed the signature request.";
		}
		return error.message;
	}
	return "Something went wrong.";
}

export function OnboardingPanel({ className }: { className?: string }) {
	const { step, available, builderFee, reason, isLoading, staleSession } = useOnboarding();
	const signIn = useSignIn();
	const activate = useActivatePacifica();

	const entries = steps(builderFee);
	const current = stepIndex(step, entries.length);
	const pending = signIn.isPending || activate.isPending;
	const failure = signIn.error ?? activate.error;

	if (!available) {
		return (
			<Callout tone="warning" title="Accounts are unavailable" className={className}>
				{reason ?? "This deployment has not been configured for accounts."}
			</Callout>
		);
	}

	return (
		<div
			className={cn(
				"space-y-5 rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6",
				className,
			)}
		>
			<div className="space-y-1.5">
				<h2 className="font-display text-[17px] font-bold text-[var(--pon-fg)]">
					Set up your account
				</h2>
				<p className="text-[13px] leading-relaxed text-[var(--pon-fg-2)]">
					Two signatures, once. After that you trade without signing every order.
				</p>
			</div>

			{staleSession && (
				<Callout tone="info">
					You are signed in with a different wallet. Sign in again to use this one.
				</Callout>
			)}

			<ol className="space-y-2.5">
				{entries.map((entry, index) => {
					const done = index < current;
					const active = index === current;
					const Icon = done ? Check : entry.icon;

					return (
						<li
							key={entry.key}
							className={cn(
								"flex gap-3 rounded-[var(--pon-r-md)] border px-3.5 py-3 transition-colors",
								active ? "border-[var(--pon-lime)] bg-[var(--pon-lime-dim)]" : "border-transparent",
							)}
						>
							<span
								className={cn(
									"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
									done && "bg-[var(--pon-lime)] text-[var(--pon-on-lime)]",
									active && "bg-[var(--pon-lime)]/20 text-[var(--pon-lime)]",
									!done && !active && "bg-[var(--pon-surface-2)] text-[var(--pon-fg-3)]",
								)}
							>
								{active && pending ? (
									<Loader2 size={12} className="animate-spin" aria-hidden />
								) : (
									<Icon size={12} aria-hidden />
								)}
							</span>
							<div className="min-w-0">
								<p
									className={cn(
										"text-[13px] font-semibold",
										done || active ? "text-[var(--pon-fg)]" : "text-[var(--pon-fg-3)]",
									)}
								>
									{entry.label}
								</p>
								<p className="mt-0.5 t-micro leading-relaxed text-[var(--pon-fg-3)]">
									{entry.detail}
								</p>
							</div>
						</li>
					);
				})}
			</ol>

			{failure && (
				<Callout tone="danger" title="That did not go through">
					{errorMessage(failure)}
				</Callout>
			)}

			<StepAction
				step={step}
				pending={pending}
				onSignIn={() => signIn.mutate()}
				onActivate={() => activate.mutate()}
				isLoading={isLoading}
			/>
		</div>
	);
}

function StepAction({
	step,
	pending,
	isLoading,
	onSignIn,
	onActivate,
}: {
	step: OnboardingStep;
	pending: boolean;
	isLoading: boolean;
	onSignIn: () => void;
	onActivate: () => void;
}): ReactNode {
	if (step === "connect") return <ConnectWallet />;

	if (step === "sign-in") {
		return (
			<Button onClick={onSignIn} disabled={pending || isLoading} className="w-full sm:w-auto">
				{pending ? "Check your wallet…" : "Sign in"}
			</Button>
		);
	}

	if (step === "activate") {
		return (
			<div className="space-y-2">
				<Button onClick={onActivate} disabled={pending} className="w-full sm:w-auto">
					{pending ? "Authorising…" : "Activate trading"}
				</Button>
				<p className="t-micro leading-relaxed text-[var(--pon-fg-3)]">
					{/* The slow step, and the only one that waits on another network. */}
					This one takes a few seconds — your account key signs through the NEAR MPC network.
				</p>
			</div>
		);
	}

	return null;
}

/**
 * Wrap anything that needs a fully set-up account.
 *
 * Replaces the old connect-only gate: a connected wallet is no longer enough to
 * trade, so a check for `isConnected` would let a user reach an order form that
 * every submission would reject.
 */
export function AccountGate({
	children,
	title = "Set up your account to trade",
	inline = false,
}: {
	children: ReactNode;
	title?: string;
	inline?: boolean;
}) {
	const { step } = useOnboarding();

	if (step === "ready") return <>{children}</>;

	return (
		<div className={inline ? undefined : "mx-auto max-w-xl py-10"}>
			<OnboardingPanel />
			<span className="sr-only">{title}</span>
		</div>
	);
}

/**
 * Asks an already-set-up user to approve the builder fee.
 *
 * Two people see this: someone who set their account up before the fee existed,
 * and someone whose approved ceiling no longer covers it. Neither is blocked —
 * their orders fill exactly as before, just unattributed — so this is worded as
 * a request rather than a warning, and it stays dismissible by simply ignoring
 * it. Blocking trading to collect a fee would be the wrong trade.
 */
export function BuilderApprovalNotice({ className }: { className?: string }) {
	const { step, builderApprovalRequired, builderFee } = useOnboarding();
	const activate = useActivatePacifica();

	if (step !== "ready" || !builderApprovalRequired) return null;

	return (
		<Callout tone="info" title="Approve the trading fee" className={className}>
			<div className="space-y-2.5">
				<p>
					{builderFee
						? `This app charges up to ${builderFee} of order value. Approving it takes one signature — your trading is unaffected either way.`
						: "This app's trading fee needs your approval. It takes one signature, and your trading is unaffected either way."}
				</p>
				{activate.error && <p className="text-[var(--pon-down)]">{errorMessage(activate.error)}</p>}
				<Button size="sm" disabled={activate.isPending} onClick={() => activate.mutate()}>
					{activate.isPending ? "Approving…" : "Approve"}
				</Button>
			</div>
		</Callout>
	);
}
