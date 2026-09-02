import { useMiniApp } from "@app/components/providers/MiniAppProvider";
import { ConnectWallet } from "@app/components/ui/ConnectWallet";
import { cn } from "@app/lib/utils";
import {
	BookOpen,
	Briefcase,
	ChevronDown,
	Coins,
	Layers,
	Scale,
	TrendingUp,
	Trophy,
} from "lucide-react";
import { useId, useState } from "react";
import { Link, useLocation } from "react-router";

/**
 * Application header.
 *
 * Follows the Avantis app-shell pattern rather than the marketing one: a dense
 * fixed bar with grouped dropdowns on the left and the wallet on the right,
 * plus a three-tab bottom bar below md.
 */

type NavLeaf = { href: string; label: string; description: string; icon: typeof TrendingUp };
type NavGroup = { label: string; items: NavLeaf[] };

const GROUPS: NavGroup[] = [
	{
		label: "Trade",
		items: [
			{
				href: "/trade",
				label: "Perps",
				description: "Leverage on crypto, stocks, FX and metals",
				icon: TrendingUp,
			},
			{
				href: "/spot",
				label: "Spot",
				description: "Buy the real token on Base",
				icon: Coins,
			},
			{
				href: "/baskets",
				label: "Baskets",
				description: "Many correlated markets at one weight",
				icon: Layers,
			},
		],
	},
	{
		label: "Earn",
		items: [
			{
				href: "/carry",
				label: "Cash & carry",
				description: "Delta-neutral positions that collect funding",
				icon: Scale,
			},
			{
				href: "/leaderboard",
				label: "Leaderboard",
				description: "Points scored from verified onchain activity",
				icon: Trophy,
			},
		],
	},
];

const FLAT_LINKS: NavLeaf[] = [
	{
		href: "/portfolio",
		label: "Portfolio",
		description: "Open positions and balances",
		icon: Briefcase,
	},
	{ href: "/docs", label: "Docs", description: "How the app works", icon: BookOpen },
];

/** The bottom bar mirrors Avantis' three-tab mobile shell. */
const TABS: NavLeaf[] = [
	{ href: "/trade", label: "Trade", description: "", icon: TrendingUp },
	{ href: "/baskets", label: "Baskets", description: "", icon: Layers },
	{ href: "/carry", label: "Carry", description: "", icon: Scale },
	{ href: "/portfolio", label: "Portfolio", description: "", icon: Briefcase },
];

function isActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Hover/focus dropdown. Avantis keeps the panel mounted and animates opacity
 * and scale-y from the top edge, so it reads as a sheet unrolling rather than a
 * popover appearing.
 */
function NavDropdown({ group, pathname }: { group: NavGroup; pathname: string }) {
	const [open, setOpen] = useState(false);
	const menuId = useId();
	const groupActive = group.items.some((item) => isActive(pathname, item.href));

	return (
		<div
			className="relative inline-block text-left"
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
		>
			<button
				type="button"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen((value) => !value)}
				className={cn(
					"flex min-w-[82px] items-center gap-1 whitespace-nowrap rounded px-4 py-3 t-label transition-colors duration-150",
					groupActive ? "text-lime-400" : "text-[var(--ink-2)] hover:text-[var(--ink-1)]",
				)}
			>
				{group.label}
				<ChevronDown
					size={16}
					aria-hidden
					className={cn("shrink-0 transition-transform duration-200", open && "rotate-180")}
				/>
			</button>

			<div
				id={menuId}
				className={cn(
					"absolute left-0 top-full z-50 mt-1 origin-top overflow-hidden rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] shadow-lg transition-[opacity,transform] duration-200",
					open ? "scale-y-100 opacity-100" : "pointer-events-none scale-y-95 opacity-0",
				)}
			>
				<div className="w-[280px] p-1">
					{group.items.map((item) => {
						const Icon = item.icon;
						return (
							<Link
								key={item.href}
								to={item.href}
								onClick={() => setOpen(false)}
								className="group flex w-full items-center gap-3 rounded px-4 py-3 transition-colors hover:bg-[var(--surface-3)]"
							>
								<Icon
									size={18}
									aria-hidden
									className="mr-2 shrink-0 text-[var(--ink-2)] group-hover:text-lime-400"
								/>
								<span className="flex flex-col text-left leading-tight">
									<span className="mb-1 t-label text-[var(--ink-1)]">{item.label}</span>
									<span className="t-caption text-[var(--ink-2)]">{item.description}</span>
								</span>
							</Link>
						);
					})}
				</div>
			</div>
		</div>
	);
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
				className="fixed inset-x-0 top-0 z-50 hidden border-b border-[var(--line-soft)] bg-black py-2 pl-4 pr-1 md:block"
				style={safeAreaStyle}
			>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Link to="/" className="flex items-center gap-2.5 py-1.5">
							<img src="/image/logo.png" alt="Lemon Markets" width={28} height={30} />
							<span className="text-lg font-semibold text-white">Lemon</span>
						</Link>

						<nav className="hidden gap-2 lg:flex">
							{GROUPS.map((group) => (
								<NavDropdown key={group.label} group={group} pathname={pathname} />
							))}
							{FLAT_LINKS.map((link) => (
								<Link
									key={link.href}
									to={link.href}
									className={cn(
										"rounded px-4 py-3 t-label transition-colors",
										isActive(pathname, link.href)
											? "text-lime-400"
											: "text-[var(--ink-2)] hover:text-[var(--ink-1)]",
									)}
								>
									{link.label}
								</Link>
							))}
						</nav>
					</div>

					<div className="flex items-center gap-2 pr-3">
						<ConnectWallet />
					</div>
				</div>
			</header>

			{/* Mobile bar — brand and wallet only; navigation lives in the tab bar. */}
			<header
				className="fixed inset-x-0 top-0 z-40 flex w-full items-center gap-4 overflow-clip border-b border-[var(--line-soft)] bg-black p-4 md:hidden"
				style={safeAreaStyle}
			>
				<Link to="/" className="flex min-w-px flex-1 items-center gap-2">
					<img src="/image/logo.png" alt="Lemon Markets" width={26} height={28} />
					<span className="text-base font-semibold text-white">Lemon</span>
				</Link>
				<ConnectWallet />
			</header>

			{/*
			  Mobile tab bar — the primary navigation below md. Avantis frames the
			  tabs inside a single hairline box and fills the active one, rather
			  than tinting an icon. Padded for the home indicator.
			*/}
			<nav
				className="fixed inset-x-0 bottom-0 z-40 bg-[var(--surface-3)] p-2 md:hidden"
				style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
			>
				<ul className="flex w-full items-stretch rounded border border-[var(--line-soft)]">
					{TABS.map((item) => {
						const Icon = item.icon;
						const active = isActive(pathname, item.href);
						return (
							<li key={item.href} className="flex min-w-px flex-1">
								<Link
									to={item.href}
									className={cn(
										"flex min-h-11 w-full flex-col items-center justify-center gap-1 overflow-clip rounded px-3 py-2",
										active ? "bg-[var(--surface-4)]" : "",
									)}
								>
									<Icon
										size={16}
										aria-hidden
										className={active ? "text-lime-400" : "text-[var(--ink-2)] opacity-60"}
									/>
									<span
										className={cn(
											"whitespace-nowrap text-center t-micro",
											active ? "text-[var(--ink-1)]" : "text-[var(--ink-2)]",
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
