import { useMiniApp } from "@app/components/providers/MiniAppProvider";
import { Badge } from "@app/components/ui/badge";
import { ConnectWallet } from "@app/components/ui/ConnectWallet";
import { cn } from "@app/lib/utils";
import { motion } from "framer-motion";
import { BookOpen, Briefcase, Layers, Scale, TrendingUp, Trophy } from "lucide-react";
import { Link, useLocation } from "react-router";

const navItems = [
	{ href: "/trade", label: "Trade", icon: TrendingUp },
	{ href: "/baskets", label: "Baskets", icon: Layers },
	{ href: "/carry", label: "Carry", icon: Scale },
	{ href: "/portfolio", label: "Portfolio", icon: Briefcase },
	{ href: "/leaderboard", label: "Ranks", icon: Trophy },
	{ href: "/docs", label: "Docs", icon: BookOpen },
];

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
			<div className="fixed inset-x-0 top-0 z-50 md:p-4 lg:px-8" style={safeAreaStyle}>
				<motion.header
					initial={{ opacity: 0.5 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.4 }}
					className="mx-auto flex max-w-7xl items-center justify-between border border-white/10 bg-[#13151b]/70 px-4 py-3 backdrop-blur-md sm:rounded-xl lg:px-6"
				>
					<Link to="/" className="inline-flex items-center gap-2 md:gap-3">
						<img src="/image/logo.png" alt="" width={34} height={36} aria-hidden />
						<span className="inline-flex items-center bg-gradient-to-r from-white to-gray-300 bg-clip-text text-lg font-semibold text-transparent lg:text-xl">
							Lemon Markets
							<Badge
								variant="secondary"
								className="ml-2 border-lime-500 bg-transparent py-0.5 text-[9px] text-white"
							>
								BASE
							</Badge>
						</span>
					</Link>

					<nav className="hidden items-center gap-6 md:inline-flex xl:gap-8">
						{navItems.map((item) => (
							<Link
								key={item.href}
								to={item.href}
								className={cn(
									"text-sm leading-tight transition-colors",
									isActive(pathname, item.href)
										? "font-semibold text-lime-400"
										: "text-gray-300 hover:text-lime-400",
								)}
							>
								{item.label}
							</Link>
						))}
					</nav>

					<ConnectWallet />
				</motion.header>
			</div>

			{/*
			  Mobile tab bar — the primary navigation below md, matching the
			  native-app pattern. Padded for the home indicator so the last row
			  of labels is not sitting under it on gesture-nav devices.
			*/}
			<nav
				className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#13151b]/95 backdrop-blur-md md:hidden"
				style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
			>
				<ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
					{navItems.map((item) => {
						const Icon = item.icon;
						const active = isActive(pathname, item.href);
						return (
							<li key={item.href} className="flex-1">
								<Link
									to={item.href}
									className={cn(
										"flex flex-col items-center gap-1 px-1 py-2.5 text-[10px]",
										active ? "text-lime-400" : "text-gray-400",
									)}
								>
									<Icon size={18} aria-hidden />
									<span className="truncate">{item.label}</span>
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
		</>
	);
}
