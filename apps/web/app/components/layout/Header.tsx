import { Ticker } from "@app/components/layout/Ticker";
import { useMiniApp } from "@app/components/providers/MiniAppProvider";
import { ConnectWallet } from "@app/components/ui/ConnectWallet";
import { formatUsdCompact, useProtocolStats } from "@lemon/client";
import { Brand, cn, ThemeToggle } from "@lemon/ui";
import { Activity, BookOpen, ChartNoAxesColumn, Vault, Wallet } from "lucide-react";
import { Link, useLocation } from "react-router";

/**
 * Application header.
 *
 * A masthead rather than a floating pill: the bar spans the page, sits on the
 * field with a hairline under it, and carries the brand, the destinations, the
 * two figures that describe the protocol and the wallet — in that order, left
 * to right, the way The Firm runs its own. Under it the ticker.
 *
 * The app has five destinations, which is few enough for a flat row. Below md
 * the bar keeps only the brand and the wallet, and navigation moves to a tab
 * bar at the bottom.
 */

type NavLeaf = { href: string; label: string; icon: typeof Vault };

const LINKS: NavLeaf[] = [
	{ href: "/vaults", label: "Vaults", icon: Vault },
	{ href: "/portfolio", label: "Portfolio", icon: Wallet },
	// Activity is a first-class destination rather than a tab inside a vault.
	// The claim that anyone can audit the agents is only credible if the ledger
	// is somewhere you can reach without knowing which vault to look in first.
	{ href: "/activity", label: "Activity", icon: Activity },
	{ href: "/stats", label: "Stats", icon: ChartNoAxesColumn },
	{ href: "/docs", label: "Docs", icon: BookOpen },
];

/**
 * The bottom bar drops Docs and Stats.
 *
 * Both are reads rather than destinations mid-session, and five tabs on a phone
 * leaves each one too narrow to hit.
 */
const TABS: NavLeaf[] = LINKS.filter((link) => link.href !== "/docs" && link.href !== "/stats");

function isActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

/** A figure in the bar: spaced caps label, tabular value, hairline to its left. */
function BarStat({ label, value }: { label: string; value: string }) {
	return (
		<span className="flex items-baseline gap-2 border-l border-[var(--pon-line)] pl-4">
			<span className="firm-label text-[var(--pon-fg-3)]">{label}</span>
			<span className="font-fono text-[12.5px] font-bold text-[var(--pon-fg-0)]">{value}</span>
		</span>
	);
}

export function Header() {
	const { pathname } = useLocation();
	const { isMiniApp, context } = useMiniApp();
	const { data: stats } = useProtocolStats();

	const safeAreaStyle =
		isMiniApp && context?.client.safeAreaInsets
			? { paddingTop: context.client.safeAreaInsets.top }
			: {};

	return (
		<>
			{/* Desktop bar. */}
			<header
				className="fixed inset-x-0 top-0 z-50 hidden bg-[var(--pon-bg)] md:block"
				style={safeAreaStyle}
			>
				<div className="border-b border-[var(--pon-line-2)]">
					<div className="mx-auto flex w-full max-w-[var(--rule-max)] items-center justify-between gap-5 px-5 py-2.5 md:px-8">
						<div className="flex min-w-0 items-center gap-7">
							{/* `Brand` is itself the link home — wrapping it in another one
							    nests an <a> inside an <a>, which is invalid HTML and makes
							    React throw out the whole SSR tree and re-render on hydration. */}
							<Brand size={26} />

							<nav className="hidden items-center gap-1 md:flex">
								{LINKS.map((link) => (
									<Link
										key={link.href}
										to={link.href}
										data-tour={link.href === "/portfolio" ? "nav-portfolio" : undefined}
										className={cn(
											"px-2.5 py-1 font-mono text-[12.5px] tracking-[-0.02em] transition-colors",
											isActive(pathname, link.href)
												? "bg-[var(--pon-ink)] text-[var(--pon-on-lime)]"
												: "text-[var(--pon-fg-2)] hover:text-[var(--pon-fg-0)]",
										)}
									>
										{link.label}
									</Link>
								))}
							</nav>
						</div>

						<div className="flex shrink-0 items-center gap-4">
							{/* The two figures that describe the protocol, quoted in the bar
							    the way a terminal quotes a book. Hidden below lg, where the
							    nav and the wallet already fill the row. */}
							<span className="hidden items-center gap-4 lg:flex">
								<BarStat label="TVL" value={formatUsdCompact(stats?.tvl ?? "0")} />
								<BarStat label="Vaults" value={String(stats?.vaultCount ?? 0)} />
							</span>
							<ThemeToggle />
							<ConnectWallet />
						</div>
					</div>
				</div>
				<Ticker />
			</header>

			{/*
			  Mobile top bar — brand and wallet only; navigation lives in the tab
			  bar. Opaque rather than translucent: the field is a flat colour and
			  a blur over it reads as a smudge rather than as depth.
			*/}
			<header className="fixed inset-x-0 top-0 z-40 md:hidden" style={safeAreaStyle}>
				<div className="flex w-full items-center gap-3 overflow-clip border-b border-[var(--pon-line-2)] bg-[var(--pon-bg)] px-4 py-2">
					<Brand size={22} className="min-w-px flex-1" />
					<ThemeToggle />
					<ConnectWallet />
				</div>
				{/* The wire runs on a phone too. It is the one piece of chrome that
				    tells you the vaults are live, and dropping it on the size where
				    most people arrive would drop it for most people. */}
				<Ticker />
			</header>

			{/*
			  Mobile tab bar — one ruled track, the active tab inverted. Sits above
			  the home indicator rather than under it: `env()` is zero on a device
			  without one, so the max() keeps a sensible gap on both.
			*/}
			<nav
				className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--pon-line-2)] bg-[var(--pon-bg)] md:hidden"
				style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
			>
				<ul className="flex w-full items-stretch">
					{TABS.map((item) => {
						const Icon = item.icon;
						const active = isActive(pathname, item.href);
						return (
							<li
								key={item.href}
								className="flex min-w-px flex-1 border-l border-[var(--pon-line)] first:border-l-0"
							>
								<Link
									to={item.href}
									data-tour={item.href === "/portfolio" ? "nav-portfolio" : undefined}
									aria-current={active ? "page" : undefined}
									// 48px clears the 44px touch-target floor.
									className={cn(
										"flex min-h-12 w-full flex-col items-center justify-center gap-1 overflow-clip px-2 py-2 transition-colors",
										active ? "bg-[var(--pon-ink)]" : "",
									)}
								>
									<Icon
										size={16}
										aria-hidden
										className={active ? "text-[var(--pon-on-lime)]" : "text-[var(--pon-fg-2)]"}
									/>
									<span
										className={cn(
											"firm-label whitespace-nowrap text-center text-[9px] leading-none",
											active ? "text-[var(--pon-on-lime)]" : "text-[var(--pon-fg-2)]",
										)}
									>
										{item.label}
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
		</>
	);
}
