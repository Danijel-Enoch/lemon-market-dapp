import { useMiniApp } from "@app/components/providers/MiniAppProvider";
import { ConnectWallet } from "@app/components/ui/ConnectWallet";
import { Brand, cn } from "@lemon/ui";
import { Activity, BookOpen, ChartNoAxesColumn, Vault, Wallet } from "lucide-react";
import { Link, useLocation } from "react-router";

/**
 * Application header.
 *
 * The app has five destinations now, which is few enough for a flat row — the
 * grouped dropdowns this replaced existed to hold perps, spot and baskets, and
 * a dropdown wrapping a single link is worse than no dropdown. Below md the bar
 * keeps only the brand and the wallet, and navigation moves to a pill tab bar
 * at the bottom.
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

export function Header() {
	const { pathname } = useLocation();
	const { isMiniApp, context } = useMiniApp();

	const safeAreaStyle =
		isMiniApp && context?.client.safeAreaInsets
			? { paddingTop: context.client.safeAreaInsets.top }
			: {};

	return (
		<>
			{/* Desktop bar. */}
			<header
				className="fixed inset-x-0 top-0 z-50 hidden bg-[var(--pon-bg)] px-4 py-3 md:block"
				style={safeAreaStyle}
			>
				<div className="mx-auto flex w-full max-w-[var(--shell-max)] items-center justify-between gap-4 rounded-full border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-2">
					<div className="flex min-w-0 items-center gap-5">
						{/* `Brand` is itself the link home — wrapping it in another one
						    nests an <a> inside an <a>, which is invalid HTML and makes
						    React throw out the whole SSR tree and re-render on hydration. */}
						<Brand size={26} className="pl-1.5" />

						<nav className="hidden items-center gap-1 md:flex">
							{LINKS.map((link) => (
								<Link
									key={link.href}
									to={link.href}
									data-tour={link.href === "/portfolio" ? "nav-portfolio" : undefined}
									className={cn(
										"rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
										isActive(pathname, link.href)
											? "bg-[var(--pon-surface-2)] font-semibold text-[var(--pon-fg)]"
											: "font-medium text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]",
									)}
								>
									{link.label}
								</Link>
							))}
						</nav>
					</div>

					<div className="shrink-0">
						<ConnectWallet />
					</div>
				</div>
			</header>

			{/*
			  Mobile top bar — brand and wallet only; navigation lives in the tab
			  bar. Translucent with a blur so content scrolling under it reads as
			  depth rather than as a hard cut, which is what makes a web page feel
			  like a page instead of an app.
			*/}
			<header
				className="fixed inset-x-0 top-0 z-40 flex w-full items-center gap-3 overflow-clip border-b border-[var(--pon-line)] bg-[var(--pon-bg)]/85 px-4 py-2.5 backdrop-blur-xl md:hidden"
				style={safeAreaStyle}
			>
				<Brand size={24} className="min-w-px flex-1" />
				<ConnectWallet />
			</header>

			{/*
			  Mobile tab bar — one floating pill track, the active tab filled.
			  Sits above the home indicator rather than under it: `env()` is zero
			  on a device without one, so the max() keeps a sensible gap on both.
			*/}
			<nav
				className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[var(--pon-bg)] via-[var(--pon-bg)] to-transparent px-3 pt-4 md:hidden"
				style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
			>
				<ul className="flex w-full items-stretch rounded-full border border-[var(--pon-line)] bg-[var(--pon-bg-2)]/95 p-1 backdrop-blur-xl">
					{TABS.map((item) => {
						const Icon = item.icon;
						const active = isActive(pathname, item.href);
						return (
							<li key={item.href} className="flex min-w-px flex-1">
								<Link
									to={item.href}
									data-tour={item.href === "/portfolio" ? "nav-portfolio" : undefined}
									aria-current={active ? "page" : undefined}
									// 48px clears the 44px touch-target floor with the
									// padding the pill track already contributes.
									className={cn(
										"flex min-h-12 w-full flex-col items-center justify-center gap-1 overflow-clip rounded-full px-2 py-1.5 transition-colors active:scale-[0.97]",
										active ? "bg-[var(--pon-surface-2)]" : "",
									)}
								>
									<Icon
										size={17}
										aria-hidden
										className={active ? "text-[var(--pon-lime)]" : "text-[var(--pon-fg-3)]"}
									/>
									<span
										className={cn(
											"whitespace-nowrap text-center text-[10px] leading-none",
											active
												? "font-bold text-[var(--pon-fg)]"
												: "font-medium text-[var(--pon-fg-3)]",
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
