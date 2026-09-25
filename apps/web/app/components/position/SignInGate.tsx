import { authApi, useAccountSession } from "@lemon/client";
import { Button, EmptyState } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogIn, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

/**
 * The gate in front of anything that names a specific user's funds.
 *
 * Sign-in is optional everywhere else in this app, and that is not an
 * inconsistency to iron out — it is the correct answer to a different question.
 * Depositing into a vault and redeeming from it are ordinary wallet
 * transactions: the chain checks the signature, so the server never needs to
 * know who is asking. A self-managed position is not like that. It has a derived
 * wallet keyed to a user, and the execution layer will ask the MPC network to
 * sign for that path — so the server has to know, with proof, whose path it is.
 *
 * Connecting a wallet and proving you hold it are different things, and only the
 * second can gate this. The signature itself grants nothing: it moves no funds,
 * authorises no trade, and exists so the API learns an address it can key a
 * session to.
 */
export function SignInGate({ children }: { children: ReactNode }) {
	const { address, isConnected } = useAccount();
	const { signMessageAsync } = useSignMessage();
	const { data: session, isLoading } = useAccountSession();
	const queryClient = useQueryClient();

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!isConnected) {
		return (
			<EmptyState
				icon={Wallet}
				title="Connect a wallet"
				description="Your positions are keyed to the wallet that holds their spot legs, so there is nothing to show until one is connected."
			/>
		);
	}

	if (isLoading) return null;

	// A session belonging to a *different* address is not a session for this one.
	// Someone has switched accounts in their wallet, which is a different state
	// from never having signed at all — and showing the previous account's
	// positions under the new address would be the worst possible outcome here.
	const signedIn =
		session?.account?.address !== undefined &&
		session.account.address.toLowerCase() === address?.toLowerCase();

	if (signedIn) return <>{children}</>;

	async function onSignIn() {
		if (!address) return;
		setBusy(true);
		setError(null);
		try {
			const { nonce, message } = await authApi.challenge(address);
			const signature = await signMessageAsync({ message });
			await authApi.signIn({ address, nonce, signature });

			// Everything downstream keys off the session, and a stale cache here
			// means a signed-in user staring at the sign-in prompt they just cleared.
			await queryClient.invalidateQueries({ queryKey: ["account-session"] });
			await queryClient.invalidateQueries({ queryKey: ["self-wallet"] });
			await queryClient.invalidateQueries({ queryKey: ["self-balances"] });
			await queryClient.invalidateQueries({ queryKey: ["self-positions"] });
		} catch (e) {
			// Dismissing a wallet prompt is not an error, but it is a dead end if
			// nothing says so.
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-4 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-6 text-center">
			<div className="space-y-1.5">
				<h2 className="text-[17px] font-semibold text-[var(--pon-fg-0)]">Sign in to continue</h2>
				<p className="mx-auto max-w-[46ch] text-[12.5px] leading-relaxed text-[var(--pon-fg-3)]">
					One signature, so we know which wallet is asking. It moves nothing and approves no trade —
					your positions are held under an address derived from this wallet, and this is how the
					server confirms the wallet is yours.
				</p>
			</div>

			<div className="flex flex-col items-center gap-2">
				<Button onClick={onSignIn} disabled={busy}>
					{busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
					{busy ? "Check your wallet" : "Sign in"}
				</Button>
				{error && <p className="max-w-[46ch] text-[11.5px] text-[var(--pon-down)]">{error}</p>}
			</div>
		</div>
	);
}
