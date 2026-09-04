import { Brand } from "@lemon/ui";
import { Outlet } from "react-router";
import { useAccount, useConnect, useDisconnect } from "wagmi";

/**
 * The console shell.
 *
 * One bar, no navigation: the dashboard is a single page with tabs, and a nav
 * row holding one link is worse than none. What the bar does carry is the
 * connected wallet, because every write on this page spends the operator's own
 * funds and they should be able to see which account is about to do it.
 */
export default function ViewLayout() {
	const { address, isConnected } = useAccount();
	const { connect, connectors, isPending } = useConnect();
	const { disconnect } = useDisconnect();
	const injected = connectors[0];

	return (
		<div className="min-h-dvh bg-[var(--pon-bg)]">
			<header className="sticky top-0 z-50 border-b border-[var(--pon-line)] bg-[var(--pon-bg)]/90 backdrop-blur">
				<div className="mx-auto flex w-full max-w-[var(--shell-max)] items-center justify-between gap-4 px-4 py-3">
					<div className="flex items-center gap-3">
						<Brand size={24} />
						<span className="rounded-full border border-[var(--pon-line-2)] px-2 py-0.5 text-[11px] font-medium tracking-wide text-[var(--pon-fg-3)] uppercase">
							Operator
						</span>
					</div>

					{isConnected ? (
						<button
							type="button"
							onClick={() => disconnect()}
							className="rounded-full border border-[var(--pon-line-2)] px-3 py-1.5 font-mono text-xs text-[var(--pon-fg-2)] hover:border-[var(--pon-lime)] hover:text-[var(--pon-lime)]"
							title="Disconnect"
						>
							{address?.slice(0, 6)}…{address?.slice(-4)}
						</button>
					) : (
						<button
							type="button"
							disabled={!injected || isPending}
							onClick={() => injected && connect({ connector: injected })}
							className="rounded-full bg-[var(--pon-lime)] px-3.5 py-1.5 text-xs font-semibold text-[var(--pon-on-lime)] disabled:opacity-60"
						>
							{isPending ? "Connecting…" : "Connect"}
						</button>
					)}
				</div>
			</header>

			<main className="mx-auto w-full max-w-[var(--shell-max)] px-4 py-6 md:py-8">
				<Outlet />
			</main>
		</div>
	);
}
