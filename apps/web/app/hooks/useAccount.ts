import {
	type AccountSummary,
	ApiError,
	authApi,
	pacificaApi,
	type SessionState,
} from "@app/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useConnection, useSignMessage } from "wagmi";

/**
 * Account state and the two-step sign-in behind it.
 *
 * The steps are separate on purpose. Signing in derives the user's wallets and
 * opens a session; activating authorises a specific agent key to trade. A user
 * who stops after the first can see their account but cannot have orders placed
 * for them, which is a distinction worth the extra prompt.
 */

export type OnboardingStep = "connect" | "sign-in" | "activate" | "ready";

export function useSession() {
	return useQuery({
		queryKey: ["session"],
		queryFn: () => authApi.session(),
		// The session outlives a page, but a wallet can change under it, so this
		// is re-read on focus rather than cached for the tab's lifetime.
		staleTime: 30_000,
		retry: false,
	});
}

/**
 * Where the user is in onboarding.
 *
 * Derived rather than stored: a session that disagrees with the connected
 * wallet is not a state to track, it is a sign-in that has to happen again.
 */
export function useOnboarding(): {
	step: OnboardingStep;
	account: AccountSummary | null;
	available: boolean;
	reason: string | null;
	isLoading: boolean;
	/** True when the session belongs to a different wallet than the connected one. */
	staleSession: boolean;
	/**
	 * True when the user trades fine but their orders earn this app nothing,
	 * because they have not approved the current builder fee.
	 */
	builderApprovalRequired: boolean;
	/** The fee this deployment charges, as a percentage. Null when none. */
	builderFee: string | null;
} {
	const { address, isConnected } = useConnection();
	const { data, isLoading } = useSession();

	const account = data?.account ?? null;
	const matches = Boolean(
		account && address && account.address.toLowerCase() === address.toLowerCase(),
	);

	let step: OnboardingStep = "connect";
	if (isConnected) {
		if (!matches) step = "sign-in";
		else if (!account?.tradingEnabled) step = "activate";
		else step = "ready";
	}

	return {
		step,
		account: matches ? account : null,
		available: data?.available ?? true,
		reason: data?.reason ?? null,
		isLoading,
		staleSession: Boolean(account && address && !matches),
		builderApprovalRequired: Boolean(matches && account?.builderApprovalRequired),
		builderFee: data?.builderFee ?? null,
	};
}

/** True when the user can place orders. The single gate the trade UI reads. */
export function useCanTrade(): boolean {
	return useOnboarding().step === "ready";
}

/**
 * Run both signatures.
 *
 * Exposed as one mutation per step rather than a single "onboard" call: the
 * second prompt should follow the first closely enough to feel like one flow,
 * but a failure in either has to be recoverable on its own — a user who
 * rejected the activation prompt is signed in, and should not have to sign in
 * again to retry.
 */
export function useSignIn() {
	const { address } = useConnection();
	const { signMessageAsync } = useSignMessage();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			if (!address) throw new Error("Connect a wallet first.");

			const challenge = await authApi.signInChallenge(address);
			const signature = await signMessageAsync({ message: challenge.message });

			return authApi.signIn({ address, nonce: challenge.nonce, signature });
		},
		onSuccess: (result) => {
			queryClient.setQueryData(["session"], (previous: SessionState | undefined) => ({
				available: true,
				reason: null,
				builderFee: previous?.builderFee ?? null,
				account: result.account,
			}));
		},
	});
}

export function useActivatePacifica() {
	const { signMessageAsync } = useSignMessage();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			const challenge = await authApi.pacificaChallenge();
			const signature = await signMessageAsync({ message: challenge.message });

			return authApi.activatePacifica({
				nonce: challenge.nonce,
				signature,
				agentPublicKey: challenge.agentPublicKey,
			});
		},
		onSuccess: (result) => {
			queryClient.setQueryData(["session"], (previous: SessionState | undefined) => ({
				available: true,
				reason: null,
				builderFee: previous?.builderFee ?? null,
				account: result.account,
			}));
			queryClient.invalidateQueries({ queryKey: ["pacifica-account"] });
		},
	});
}

export function useSignOut() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => authApi.signOut(),
		onSettled: () => {
			// Clear on settle rather than on success: if the request failed the
			// cookie may still be gone, and showing a signed-in UI that every
			// call rejects is worse than an extra sign-in.
			queryClient.setQueryData(["session"], { available: true, reason: null, account: null });
			queryClient.invalidateQueries({ queryKey: ["pacifica-account"] });
		},
	});
}

/**
 * Sign out automatically when the connected wallet changes.
 *
 * Otherwise the previous user's session survives a wallet switch, and the
 * account page would show one wallet's holdings beside another's positions.
 */
export function useSessionWalletGuard(): void {
	const { address } = useConnection();
	const { data } = useSession();
	const signOut = useSignOut();
	const lastSeen = useRef<string | undefined>(undefined);

	useEffect(() => {
		const sessionAddress = data?.account?.address;
		if (!sessionAddress) {
			lastSeen.current = address;
			return;
		}

		// Only act on a genuine change: an absent address means "disconnected",
		// which the user may undo in a moment, and dropping the session then
		// would make a flaky wallet connection look like being logged out.
		if (address && address.toLowerCase() !== sessionAddress.toLowerCase()) {
			signOut.mutate();
		}
		lastSeen.current = address;
	}, [address, data?.account?.address, signOut.mutate]);
}

/** The Pacifica side of the account: equity, positions, open orders. */
export function usePacificaAccount() {
	const { step } = useOnboarding();

	return useQuery({
		queryKey: ["pacifica-account"],
		queryFn: () => pacificaApi.account(),
		enabled: step === "ready" || step === "activate",
		refetchInterval: 10_000,
		retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
	});
}

/** A stable callback that refreshes everything an order can change. */
export function useRefreshAccount(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: ["pacifica-account"] });
	}, [queryClient]);
}
