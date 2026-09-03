import { Brand } from "@app/components/pons/Brand";
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
	Wallet,
} from "lucide-react";
import { useId, useState } from "react";
import { Link, useLocation } from "react-router";

/**
 * Application header.
 *
 * The app surface wears the same Pons nav as the marketing one — a single pill
 * bar on the well surface — but keeps its grouped dropdowns, because the app
 * has more destinations than a flat row can hold. Groups open as a hairline
 * sheet on the popover surface. Below md the bar keeps only the brand and the
 * wallet, and navigation moves to a pill tab bar at the bottom.
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
			{ href: "/spot", label: "Spot", description: "Buy the real token on Base", icon: Coins },
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
		icon: Wallet,
	},
	{
		href: "/accounts",
		label: "Accounts",
		description: "Pacifica positions and wallet balances",
		icon: Briefcase,
	},
	{ href: "/docs", label: "Docs", description: "How the app works", icon: BookOpen },
];

/** The bottom bar carries the four surfaces a trader returns to. */
const TABS: NavLeaf[] = [
	{ href: "/trade", label: "Trade", description: "", icon: TrendingUp },
	{ href: "/baskets", label: "Baskets", description: "", icon: Layers },
	{ href: "/carry", label: "Carry", description: "", icon: Scale },
	{ href: "/accounts", label: "Accounts", description: "", icon: Briefcase },
];

function isActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

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
					"flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
					groupActive
						? "bg-[var(--pon-surface-2)] font-semibold text-[var(--pon-fg)]"
						: "font-medium text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]",
				)}
			>
				{group.label}
				<ChevronDown
					size={14}
					aria-hidden
					className={cn("shrink-0 transition-transform duration-200", open && "rotate-180")}
				/>
			</button>

			<div
				id={menuId}
				className={cn(
					"absolute left-0 top-full z-50 mt-2 origin-top overflow-hidden rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-surface-3)] transition-[opacity,transform] duration-200",
					open ? "scale-y-100 opacity-100" : "pointer-events-none scale-y-95 opacity-0",
				)}
			>
				<div className="w-[290px] p-1.5">
					{group.items.map((item) => {
						const Icon = item.icon;
						return (
							<Link
								key={item.href}
								to={item.href}
								onClick={() => setOpen(false)}
								className="group flex w-full items-center gap-3 rounded-[var(--pon-r-md)] px-3 py-2.5 transition-colors hover:bg-[var(--pon-surface-2)]"
							>
								<Icon
									size={17}
									aria-hidden
									className="shrink-0 text-[var(--pon-fg-3)] group-hover:text-[var(--pon-lime)]"
								/>
								<span className="flex flex-col text-left leading-tight">
									<span className="text-[13px] font-semibold text-[var(--pon-fg)]">
										{item.label}
									</span>
									<span className="mt-0.5 t-micro text-[var(--pon-fg-3)]">{item.description}</span>
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
				className="fixed inset-x-0 top-0 z-50 hidden bg-[var(--pon-bg)] px-4 py-3 md:block"
				style={safeAreaStyle}
			>
				<div className="mx-auto flex w-full max-w-[var(--shell-max)] items-center justify-between gap-4 rounded-full border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-2">
					<div className="flex min-w-0 items-center gap-5">
						<Brand size={26} className="pl-1.5" />

						<nav className="hidden items-center gap-1 lg:flex">
							{GROUPS.map((group) => (
								<NavDropdown key={group.label} group={group} pathname={pathname} />
							))}
							{FLAT_LINKS.map((link) => (
								<Link
									key={link.href}
									to={link.href}
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

			{/* Mobile bar — brand and wallet only; navigation lives in the tab bar. */}
			<header
				className="fixed inset-x-0 top-0 z-40 flex w-full items-center gap-4 overflow-clip border-b border-[var(--pon-line)] bg-[var(--pon-bg)] p-3.5 md:hidden"
				style={safeAreaStyle}
			>
				<Brand size={26} className="min-w-px flex-1" />
				<ConnectWallet />
			</header>

			{/* Mobile tab bar — one pill track, the active tab filled. */}
			<nav
				className="fixed inset-x-0 bottom-0 z-40 bg-[var(--pon-bg)] p-2.5 md:hidden"
				style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
			>
				<ul className="flex w-full items-stretch rounded-full border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-1">
					{TABS.map((item) => {
						const Icon = item.icon;
						const active = isActive(pathname, item.href);
						return (
							<li key={item.href} className="flex min-w-px flex-1">
								<Link
									to={item.href}
									className={cn(
										"flex min-h-11 w-full flex-col items-center justify-center gap-0.5 overflow-clip rounded-full px-2 py-1.5 transition-colors",
										active ? "bg-[var(--pon-surface-2)]" : "",
									)}
								>
									<Icon
										size={16}
										aria-hidden
										className={active ? "text-[var(--pon-lime)]" : "text-[var(--pon-fg-3)]"}
									/>
									<span
										className={cn(
											"whitespace-nowrap text-center t-micro",
											active ? "font-semibold text-[var(--pon-fg)]" : "text-[var(--pon-fg-3)]",
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
