import { Link } from "react-router";

/**
 * Site footer, built on the Avantis pattern: one big rounded panel floating
 * inside the page gutter rather than a full-bleed bar, split into a brand
 * column, two link columns and a subscribe column on a 10-track grid.
 */

const PRODUCT_LINKS = [
	{ label: "Trade perps", to: "/trade" },
	{ label: "Buy spot", to: "/spot" },
	{ label: "Baskets", to: "/baskets" },
	{ label: "Cash & carry", to: "/carry" },
];

const RESOURCE_LINKS = [
	{ label: "Accounts", to: "/accounts" },
	{ label: "Leaderboard", to: "/leaderboard" },
	{ label: "Docs", to: "/docs" },
];

function LinkColumn({ links }: { links: { label: string; to: string }[] }) {
	return (
		<div className="flex flex-col gap-2">
			{links.map((link) => (
				<Link
					key={link.to}
					to={link.to}
					className="t-label text-white/80 transition-colors hover:text-lime-400 hover:underline"
				>
					{link.label}
				</Link>
			))}
		</div>
	);
}

function Brand() {
	return (
		<div className="flex flex-col items-start gap-4">
			<Link to="/" className="inline-flex items-center gap-2.5">
				<img src="/image/logo.png" alt="" width={30} height={32} aria-hidden />
				<span className="text-lg font-semibold text-white">Lemon Markets</span>
			</Link>
			<span className="t-label text-white/50">
				© {new Date().getFullYear()} Lemon Markets. All rights reserved.
			</span>
		</div>
	);
}

function Subscribe() {
	return (
		<div className="flex flex-col items-start gap-4 lg:items-end">
			<span className="t-label text-[var(--ink-2)] lg:text-right">
				Built on Base. Non-custodial, and open to anyone with a wallet.
			</span>
			{/* Stacks below sm so "Launch app" never wraps inside its own button. */}
			<div className="flex w-full flex-col gap-3 rounded-lg bg-[var(--surface-4)] p-2 sm:flex-row sm:items-center sm:py-2 sm:pl-4 sm:pr-2 lg:w-auto">
				<span className="flex items-center gap-2 px-2 sm:flex-1 sm:px-0">
					<span className="flex size-1.5 shrink-0 rounded-full bg-lime-400" aria-hidden />
					<span className="whitespace-nowrap t-label text-[var(--ink-2)]">
						Live on Base mainnet
					</span>
				</span>
				<Link
					to="/trade"
					className="whitespace-nowrap rounded-md bg-lime-500 px-4 py-2.5 text-center t-label font-semibold text-black transition-colors hover:bg-lime-400"
				>
					Launch app
				</Link>
			</div>
			<p className="t-caption text-white/35 lg:text-right">
				Leverage carries risk of total loss. Not investment advice.
			</p>
		</div>
	);
}

export function Footer() {
	return (
		<div className="px-[var(--section-x)] pb-12">
			{/* Desktop: 10-track grid, matching the Avantis proportions (3/2/2/3). */}
			<footer className="mx-auto hidden w-full max-w-[var(--content-max)] grid-cols-10 gap-8 rounded-3xl bg-[var(--surface-4)] px-12 pb-24 pt-[72px] lg:grid xl:px-32">
				<div className="col-span-3">
					<Brand />
				</div>
				<div className="col-span-2">
					<LinkColumn links={PRODUCT_LINKS} />
				</div>
				<div className="col-span-2">
					<LinkColumn links={RESOURCE_LINKS} />
				</div>
				<div className="col-span-3">
					<Subscribe />
				</div>
			</footer>

			{/* Mobile: same panel, stacked — subscribe first, then brand and links. */}
			<footer className="mx-auto flex w-full max-w-[640px] flex-col gap-12 rounded-3xl bg-[var(--surface-4)] p-8 lg:hidden">
				<Subscribe />
				<div className="flex flex-col items-start gap-10">
					<Brand />
					<div className="flex items-start gap-20">
						<LinkColumn links={PRODUCT_LINKS} />
						<LinkColumn links={RESOURCE_LINKS} />
					</div>
				</div>
			</footer>
		</div>
	);
}
