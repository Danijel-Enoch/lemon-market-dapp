import { authApi, useAdminSession } from "@lemon/client";
import { Button } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

/**
 * The console's sign-in.
 *
 * Connecting a wallet and *proving* you hold it are two different things, and
 * the console needs the second: every admin route is gated on a session cookie
 * that only a signature can mint. RainbowKit's button does the first and stops
 * there, so without this the dashboard connects, reports "Not available", and
 * offers nothing to do about it — the operator's own address is in
 * `ADMIN_ADDRESSES` and the API has still never been told who is asking.
 *
 * The signature grants nothing. It moves no funds and authorises no trade; it
 * is the API's way of learning an address it can look up in the admin table.
 */
export function AdminSignIn() {
	const { address, isConnected } = useAccount();
	const { signMessageAsync } = useSignMessage();
	const { data: session } = useAdminSession();
	const queryClient = useQueryClient();

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// A session for a *different* address is not a session for this one. The
	// operator has switched accounts in their wallet and needs to sign again,
	// which is not the same state as never having signed at all.
	const signedIn =
		session?.address !== undefined && session.address.toLowerCase() === address?.toLowerCase();

	if (!isConnected || signedIn) return null;

	async function onSignIn() {
		if (!address) return;
		setBusy(true);
		setError(null);
		try {
			const { nonce, message } = await authApi.challenge(address);
			const signature = await signMessageAsync({ message });
			await authApi.signIn({ address, nonce, signature });
			// Both queries key off the session: the dashboard's own gate, and the
			// vault list it will immediately try to fetch.
			await queryClient.invalidateQueries({ queryKey: ["admin-session"] });
			await queryClient.invalidateQueries({ queryKey: ["admin-vaults"] });
		} catch (e) {
			// A user who dismisses their wallet's prompt has not hit an error, but
			// they have hit a dead end if nothing says so.
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex items-center gap-3">
			{error && (
				<span className="hidden max-w-[280px] truncate text-xs text-[var(--pon-down)] sm:inline">
					{error}
				</span>
			)}
			<Button size="sm" onClick={onSignIn} disabled={busy} data-testid="admin-sign-in">
				{busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
				{busy ? "Check your wallet" : "Sign in"}
			</Button>
		</div>
	);
}
