import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { APP_CHAIN } from "./chain";

/**
 * Keep the wallet on Base mainnet, adding it if the wallet does not have it.
 *
 * `switchChain` is doing two jobs here. For a wallet that already knows Base it
 * sends `wallet_switchEthereumChain`; for one that does not, wagmi falls back
 * to `wallet_addEthereumChain` using the chain object from the config — which
 * is why `APP_CHAIN` keeps viem's full Base definition, name, native currency
 * and explorer included, rather than being an id with a transport bolted on. A
 * partial chain object makes that call fail with an error most wallets do not
 * explain.
 */
export function useAppChain() {
	const { isConnected, chainId } = useAccount();
	const { switchChain, isPending, error } = useSwitchChain();

	const onWrongChain = isConnected && chainId !== undefined && chainId !== APP_CHAIN.id;

	const promptSwitch = useCallback(() => {
		switchChain({ chainId: APP_CHAIN.id });
	}, [switchChain]);

	return { chain: APP_CHAIN, onWrongChain, promptSwitch, isSwitching: isPending, error };
}

/**
 * Ask once, automatically, on connecting to the wrong chain.
 *
 * Once per connection, not once per render: a user who declines the wallet
 * prompt would otherwise be asked again on the next state change, which is
 * indistinguishable from the app being broken. After a decline the banner is
 * still there and the button still works — the difference is that pressing it
 * is their decision.
 */
export function useAutoSwitchAppChain() {
	const state = useAppChain();
	const { isConnected, chainId } = useAccount();
	const asked = useRef<number | null>(null);

	useEffect(() => {
		if (!isConnected) {
			asked.current = null;
			return;
		}
		if (!state.onWrongChain || state.isSwitching) return;
		if (asked.current === chainId) return;
		asked.current = chainId ?? null;
		state.promptSwitch();
	}, [isConnected, chainId, state.onWrongChain, state.isSwitching, state.promptSwitch]);

	return state;
}

/**
 * The banner shown while the wallet is on the wrong chain.
 *
 * Deliberately not a modal. Everything read-only on both apps works regardless
 * of what the wallet is connected to — the data comes from the indexer, not the
 * wallet — so blocking the whole page would hide working information to complain
 * about a condition that only affects the buttons.
 */
export function WrongNetworkBanner({ className }: { className?: string }) {
	const { onWrongChain, promptSwitch, isSwitching, error, chain } = useAutoSwitchAppChain();
	const [dismissed, setDismissed] = useState(false);

	if (!onWrongChain || dismissed) return null;

	return (
		<div
			className={
				className ??
				"flex flex-wrap items-center justify-between gap-3 rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-warn,#a16207)] bg-[var(--pon-surface)] px-4 py-3"
			}
		>
			<div className="min-w-0 text-sm">
				<p className="font-medium text-[var(--pon-fg-0)]">Wrong network</p>
				<p className="text-[var(--pon-fg-3)]">
					This app runs on {chain.name}. Switch, and your wallet will add it if it does not have it
					yet.
					{error ? ` (${error.message})` : ""}
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<button
					type="button"
					onClick={promptSwitch}
					disabled={isSwitching}
					className="rounded-full bg-[var(--pon-lime)] px-3.5 py-1.5 text-xs font-semibold text-[var(--pon-on-lime)] disabled:opacity-60"
				>
					{isSwitching ? "Switching…" : `Switch to ${chain.name}`}
				</button>
				<button
					type="button"
					onClick={() => setDismissed(true)}
					className="rounded-full border border-[var(--pon-line-2)] px-3 py-1.5 text-xs text-[var(--pon-fg-2)]"
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}
