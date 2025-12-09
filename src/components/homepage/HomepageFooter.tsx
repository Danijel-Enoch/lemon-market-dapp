import { memo } from "react";
import { Link } from "react-router-dom";

export type LinkItem = Readonly<{
	label: string;
	href: string;
	external?: boolean;
}>;

export type HomepageFooterProps = Readonly<{
	brand?: Readonly<{ name: string; logoSrc: string; tagline: string }>;
	navigation?: ReadonlyArray<LinkItem>;
	socials?: ReadonlyArray<LinkItem>;
	legal?: ReadonlyArray<LinkItem>;
}>;

const defaultBrand = {
	name: "Lemon Markets",
	logoSrc: "/image/logo.png",
	tagline:
		"Trade with confidence on the most efficient decentralized perpetual protocol. Unlimited markets, unmatched liquidity."
} as const;

const defaultNavigation: ReadonlyArray<LinkItem> = [
	{ label: "Why Lemon Markets?", href: "/perp" },
	{ label: "Trending", href: "/trending" },
	{ label: "Positions", href: "/positions" },
	{ label: "Leaderboard", href: "/leaderboard" },
	{ label: "Stake", href: "/staking" }
];

const defaultSocials: ReadonlyArray<LinkItem> = [
	{
		label: "X (Twitter)",
		href: "https://x.com/LemonMarkets",
		external: true
	},
	// { label: "Discord", href: "https://discord.gg/LemonMarkets", external: true },
	{
		label: "Telegram",
		href: "https://t.me/+8qzsPVfrYrMxYjdk",
		external: true
	},
	{
		label: "GitHub",
		href: "https://github.com/Lemon-Markets-Perp",
		external: true
	}
];

const defaultLegal: ReadonlyArray<LinkItem> = [
	{ label: "Terms Of Service", href: "#" },
	{ label: "Privacy Policy", href: "#" }
];

const navId = "footer-nav";
const socialsId = "footer-socials";
const legalId = "footer-legal";

export const HomepageFooter = memo(function HomepageFooter({
	brand = defaultBrand,
	navigation = defaultNavigation,
	socials = defaultSocials,
	legal = defaultLegal
}: HomepageFooterProps) {
	return (
		<footer>
			<div className="p-6 md:px-12 md:pb-24 bg-[linear-gradient(172.34deg,#0a1a0300_-34.4%,#0a1a031c_51.7%,#1c6200_161.09%)]">
				<div className="w-full max-w-7xl mx-auto">
					<div className="my-28 h-px w-full bg-[#4dad31]/60" />
					<div className="py-12 grid gap-8 md:grid-cols-6">
						<div className="flex flex-col gap-4 md:col-span-3">
							<div className="flex items-center gap-3">
								<img
									src={brand.logoSrc}
									alt={brand.name}
									width={40}
									height={40}
									loading="lazy"
									decoding="async"
								/>
								<p className="text-xl md:text-2xl font-semibold bg-clip-text text-transparent bg-[linear-gradient(101.95deg,#ffffff_3.88%,#f8f8f8_60.64%)]">
									{brand.name}
								</p>
							</div>
							<p className="text-base leading-8 max-w-xs bg-clip-text text-transparent bg-[linear-gradient(99.67deg,#ffffff_3.72%,#f8f8f8_60.28%)]">
								{brand.tagline}
							</p>
						</div>
						<nav aria-labelledby={navId}>
							<p
								id={navId}
								className="text-white font-medium mb-4"
							>
								Navigation
							</p>
							<ul className="flex flex-col gap-4 text-white/70">
								{navigation.map((item) => (
									<li key={item.label}>
										{item.external ? (
											<a
												href={item.href}
												className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
												target="_blank"
												rel="noopener noreferrer"
											>
												{item.label}
											</a>
										) : (
											<Link
												to={item.href}
												className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
											>
												{item.label}
											</Link>
										)}
									</li>
								))}
							</ul>
						</nav>
						<nav aria-labelledby={socialsId}>
							<p
								id={socialsId}
								className="text-white font-medium mb-4"
							>
								Socials
							</p>
							<ul className="flex flex-col gap-4 text-white/70">
								{socials.map((item) => (
									<li key={item.label}>
										{item.external ? (
											<a
												href={item.href}
												target="_blank"
												rel="noopener noreferrer"
												className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
											>
												{item.label}
											</a>
										) : (
											<Link
												to={item.href}
												className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
											>
												{item.label}
											</Link>
										)}
									</li>
								))}
							</ul>
						</nav>
						<nav aria-labelledby={legalId}>
							<p
								id={legalId}
								className="text-white font-medium mb-4"
							>
								Legal
							</p>
							<ul className="flex flex-col gap-4 text-white/70">
								{legal.map((item) => (
									<li key={item.label}>
										<Link
											to={item.href}
											className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
										>
											{item.label}
										</Link>
									</li>
								))}
							</ul>
						</nav>
					</div>
					<p className="mt-10 text-white/50 text-sm">
						Copyright © 2025 Lemon Markets. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	);
});

export default HomepageFooter;
