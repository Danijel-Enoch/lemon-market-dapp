import { cn } from "@app/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, BookOpen, Coins, Layers, Menu, Scale, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

/**
 * Marketing header.
 *
 * The reference design splits the landing nav into three detached, blurred blocks — brand,
 * links, call to action — sitting on the page rather than inside a single bar.
 * Below sm it collapses to a solid strip with a sheet menu.
 */

const NAV = [
	{ label: "Trade", to: "/trade", icon: TrendingUp },
	{ label: "Spot", to: "/spot", icon: Coins },
	{ label: "Baskets", to: "/baskets", icon: Layers },
	{ label: "Carry", to: "/carry", icon: Scale },
	{ label: "Docs", to: "/docs", icon: BookOpen },
];

export function SiteHeader() {
	const [open, setOpen] = useState(false);

	return (
		<>
			{/* Desktop — three blocks, sticky to the top of the shell. */}
			<header className="sticky top-0 z-50 mx-auto hidden w-full max-w-[var(--shell-max)] bg-black p-4 sm:block">
				<div className="flex items-stretch gap-2.5">
					<Link
						to="/"
						className="flex shrink-0 items-center justify-center gap-2.5 rounded-lg bg-[var(--surface-4)] px-8 py-3 backdrop-blur-[24px] transition-colors hover:bg-[var(--surface-5)]"
					>
						<img src="/image/logo.png" alt="Lemon Markets" width={26} height={28} />
						<span className="hidden text-lg font-semibold text-white lg:inline">Lemon</span>
					</Link>

					<nav className="flex min-w-0 flex-1 items-center justify-center gap-8 rounded-lg bg-[var(--surface-4)] px-6 py-4 backdrop-blur-[24px] xl:gap-[60px]">
						{NAV.map((item) => {
							const Icon = item.icon;
							return (
								<Link
									key={item.to}
									to={item.to}
									className="group flex cursor-pointer items-center gap-3"
								>
									<Icon
										size={18}
										className="text-[var(--ink-2)] transition-colors group-hover:text-lime-400"
										aria-hidden
									/>
									<span className="t-body font-normal text-[var(--ink-2)] transition-colors group-hover:text-white">
										{item.label}
									</span>
								</Link>
							);
						})}
					</nav>

					<Link
						to="/trade"
						className="flex shrink-0 items-center justify-center rounded-lg bg-[var(--surface-4)] px-8 py-4 font-medium tracking-[-0.48px] text-white backdrop-blur-[24px] transition-colors hover:bg-[var(--surface-5)]"
					>
						Launch App
					</Link>
				</div>
			</header>

			{/* Mobile — solid strip with hairlines above and below. */}
			<header className="sticky top-0 z-50 flex items-center justify-between border-y border-[var(--line-soft)] bg-[var(--surface-3)] px-4 py-[23px] sm:hidden">
				<Link to="/" className="flex items-center gap-2">
					<img src="/image/logo.png" alt="Lemon Markets" width={26} height={28} />
					<span className="text-base font-semibold text-white">Lemon</span>
				</Link>
				<button
					type="button"
					onClick={() => setOpen((value) => !value)}
					aria-label={open ? "Close menu" : "Open menu"}
					aria-expanded={open}
					className="flex flex-col items-center gap-1"
				>
					{open ? <X size={22} /> : <Menu size={22} />}
				</button>
			</header>

			<AnimatePresence>
				{open && (
					<motion.nav
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
						className="sticky top-[70px] z-40 overflow-hidden border-b border-[var(--line-soft)] bg-[var(--surface-3)] sm:hidden"
					>
						<div className="flex flex-col p-2">
							{NAV.map((item) => {
								const Icon = item.icon;
								return (
									<Link
										key={item.to}
										to={item.to}
										onClick={() => setOpen(false)}
										className="flex items-center gap-3 rounded-md px-4 py-3 transition-colors hover:bg-[var(--surface-4)]"
									>
										<Icon size={18} className="text-[var(--ink-2)]" aria-hidden />
										<span className="t-body text-[var(--ink-1)]">{item.label}</span>
									</Link>
								);
							})}
							<Link
								to="/trade"
								onClick={() => setOpen(false)}
								className="mt-2 flex items-center justify-center gap-1.5 rounded-md bg-lime-500 px-4 py-3 t-body font-semibold text-black"
							>
								Launch App <ArrowUpRight size={16} aria-hidden />
							</Link>
						</div>
					</motion.nav>
				)}
			</AnimatePresence>
		</>
	);
}

/** Shared "Built on and backed by Base" chip from the reference hero. */
export function BaseChip({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"flex w-fit items-center gap-2 rounded-md bg-gradient-to-l from-[var(--surface-1)] to-[var(--surface-5)] px-4 py-2",
				className,
			)}
		>
			<span className="font-fono t-label font-medium text-[var(--ink-1)]">
				Built on and backed by
			</span>
			<span className="font-fono t-label font-semibold text-lime-400">Base</span>
		</div>
	);
}
