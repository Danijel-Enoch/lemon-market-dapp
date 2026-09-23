import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { APP_CHAIN, ENABLED_CHAINS } from "./chain";

/**
 * Keep the wallet on the chain the thing being acted on actually lives on.
 *
 * The target is a parameter rather than a constant now that vaults exist on
 * more than one chain. It defaults to `APP_CHAIN` because most callers are
 * page-level and genuinely mean "the chain this deployment starts on"; a
 * deposit panel for an Arbitrum vault passes that vault's chain id instead, and
 * an unknown or unconfigured id falls back rather than asking the wallet to
 * switch to a network this build cannot talk to.
 *
 * `switchChain` is doing two jobs here. For a wallet that already knows the
 * chain it sends `wallet_switchEthereumChain`; for one that does not, wagmi
 * falls back to `wallet_addEthereumChain` using the chain object from the
 * config — which is why `chain.ts` keeps viem's full definitions, name, native
 * currency and explorer included, rather than an id with a transport bolted on.
 * A partial chain object makes that call fail with an error most wallets do not
 * explain. It is also why every enabled chain is in the wagmi config and not
 * just the current one: wagmi can only offer to add a chain it was given.
 */
export function useAppChain(targetChainId?: number) {
	const { isConnected, chainId } = useAccount();
	const { switchChain, isPending, error } = useSwitchChain();

	const target =
		ENABLED_CHAINS.find((entry) => entry.chain.id === targetChainId)?.chain ?? APP_CHAIN;

	const onWrongChain = isConnected && chainId !== undefined && chainId !== target.id;

	const promptSwitch = useCallback(() => {
		switchChain({ chainId: target.id });
	}, [switchChain, target.id]);

	return { chain: target, onWrongChain, promptSwitch, isSwitching: isPending, error };
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
export function useAutoSwitchAppChain(targetChainId?: number) {
	const state = useAppChain(targetChainId);
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
export function WrongNetworkBanner({
	className,
	chainId,
}: {
	className?: string;
	/** The chain the action on this page needs. Omitted means the deployment default. */
	chainId?: number;
}) {
	const { onWrongChain, promptSwitch, isSwitching, error, chain } = useAutoSwitchAppChain(chainId);
	const [dismissed, setDismissed] = useState(false);

	if (!onWrongChain || dismissed) return null;

	return (
		<div
			className={
				className ??
				"flex flex-wrap items-center justify-between gap-3 rounded-[var(--pon-r-lg)] border border-[var(--pon-amber)] bg-[var(--pon-lime-dim)] px-4 py-3"
			}
		>
			<div className="min-w-0 text-sm">
				<p className="firm-label text-[var(--pon-fg-0)]">Wrong network</p>
				<p className="text-[var(--pon-fg-3)]">
					This vault is on {chain.name}. Switch, and your wallet will add it if it does not have it
					yet.
					{error ? ` (${error.message})` : ""}
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<button
					type="button"
					onClick={promptSwitch}
					disabled={isSwitching}
					className="rounded-[var(--pon-r-sm)] bg-[var(--pon-lime)] px-3.5 py-1.5 font-mono text-[11.5px] tracking-[-0.02em] text-[var(--pon-on-lime)] disabled:opacity-45"
				>
					{isSwitching ? "Switching…" : `Switch to ${chain.name}`}
				</button>
				<button
					type="button"
					onClick={() => setDismissed(true)}
					className="rounded-[var(--pon-r-sm)] border border-[var(--pon-line-2)] px-3 py-1.5 font-mono text-[11.5px] tracking-[-0.02em] text-[var(--pon-fg-2)]"
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}
