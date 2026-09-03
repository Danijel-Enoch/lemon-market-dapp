import { Brand } from "@app/components/pons/Brand";
import { cn } from "@app/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";

/**
 * Marketing header.
 *
 * Pons runs one nav shape: a single pill bar on the well surface holding the
 * brand, the links as pill segments, and the call to action as a solid lime
 * pill on the right. It replaces the three detached blocks the previous system
 * used — one bar reads as navigation, three read as three separate widgets.
 * Below sm it collapses to a solid strip with a sheet menu.
 */

const NAV = [
	{ label: "Trade", to: "/trade" },
	{ label: "Spot", to: "/spot" },
	{ label: "Baskets", to: "/baskets" },
	{ label: "Carry", to: "/carry" },
	{ label: "Docs", to: "/docs" },
];

function isActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
	const [open, setOpen] = useState(false);
	const { pathname } = useLocation();

	return (
		<>
			{/* Desktop — one pill bar. */}
			<header className="sticky top-0 z-50 mx-auto hidden w-full max-w-[var(--shell-max)] bg-[var(--pon-bg)] px-4 py-4 sm:block">
				<div className="flex items-center justify-between gap-4 rounded-full border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-2.5">
					<div className="flex min-w-0 items-center gap-5">
						<Brand size={28} className="pl-1.5" />

						<nav className="flex items-center gap-1">
							{NAV.map((item) => (
								<Link
									key={item.to}
									to={item.to}
									className={cn(
										"rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
										isActive(pathname, item.to)
											? "bg-[var(--pon-surface-2)] font-semibold text-[var(--pon-fg)]"
											: "font-medium text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]",
									)}
								>
									{item.label}
								</Link>
							))}
						</nav>
					</div>

					<Link
						to="/trade"
						className="shrink-0 whitespace-nowrap rounded-full bg-[var(--pon-lime)] px-[18px] py-2 text-[13px] font-semibold text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)]"
					>
						Launch app
					</Link>
				</div>
			</header>

			{/* Mobile — solid strip with a hairline below. */}
			<header className="sticky top-0 z-50 flex items-center justify-between border-b border-[var(--pon-line)] bg-[var(--pon-bg)] px-4 py-4 sm:hidden">
				<Brand size={26} />
				<button
					type="button"
					onClick={() => setOpen((value) => !value)}
					aria-label={open ? "Close menu" : "Open menu"}
					aria-expanded={open}
					className="flex size-9 items-center justify-center rounded-full border border-[var(--pon-line-2)] text-[var(--pon-fg-2)]"
				>
					{open ? <X size={18} /> : <Menu size={18} />}
				</button>
			</header>

			<AnimatePresence>
				{open && (
					<motion.nav
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
						className="sticky top-[69px] z-40 overflow-hidden border-b border-[var(--pon-line)] bg-[var(--pon-bg-2)] sm:hidden"
					>
						<div className="flex flex-col gap-1 p-3">
							{NAV.map((item) => (
								<Link
									key={item.to}
									to={item.to}
									onClick={() => setOpen(false)}
									className={cn(
										"rounded-full px-4 py-2.5 text-sm transition-colors",
										isActive(pathname, item.to)
											? "bg-[var(--pon-surface-2)] font-semibold text-[var(--pon-fg)]"
											: "text-[var(--pon-fg-2)] hover:bg-[var(--pon-surface-2)]",
									)}
								>
									{item.label}
								</Link>
							))}
							<Link
								to="/trade"
								onClick={() => setOpen(false)}
								className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-[var(--pon-lime)] px-4 py-3 text-sm font-semibold text-[var(--pon-on-lime)]"
							>
								Launch app <ArrowUpRight size={15} aria-hidden />
							</Link>
						</div>
					</motion.nav>
				)}
			</AnimatePresence>
		</>
	);
}

/** Network chip — the hairline pill Pons puts beside the nav to name the chain. */
export function BaseChip({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex w-fit items-center gap-2 rounded-full border border-[var(--pon-line)] px-3.5 py-1.5 t-caption text-[var(--pon-fg-3)]",
				className,
			)}
		>
			<span aria-hidden className="size-1.5 rounded-full bg-[var(--pon-lime)]" />
			Built on and backed by <span className="text-[var(--pon-lime)]">Base</span>
		</span>
	);
}
