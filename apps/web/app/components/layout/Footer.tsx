import { Brand } from "@lemon/ui";
import { Link } from "react-router";

/**
 * Footer.
 *
 * The page's one inversion. Everything above it is ink on the field; this band
 * flips to paper, which is how The Firm closes a page — the change of ground
 * is the full stop. The destinations sit in a solid ink block beside the
 * lockup rather than in a row of quiet links, because a list you can see the
 * edges of is easier to use than one you have to find.
 *
 * Only internal destinations are listed. There is no social row here because
 * the app does not have verified accounts to point at, and a footer linking
 * somewhere that isn't ours is worse than a footer that links nowhere.
 */

const DESTINATIONS = [
	{ href: "/vaults", label: "Vaults" },
	{ href: "/portfolio", label: "Portfolio" },
	{ href: "/activity", label: "Activity" },
	{ href: "/stats", label: "Stats" },
	{ href: "/docs", label: "Docs" },
];

export function Footer() {
	return (
		<footer className="firm-paper relative z-10 border-t-4 border-double border-[var(--pon-ink)]">
			<div className="mx-auto w-full max-w-[var(--rule-max)] px-5 py-10 md:px-8 md:py-14">
				<div className="flex flex-col gap-9 md:flex-row md:items-start md:justify-between md:gap-12">
					<div className="min-w-0">
						<Brand size={40} to={null} />
						<p className="t-body mt-4 max-w-[44ch] text-[var(--pon-fg-2)]">
							Own the asset, hedge it one-for-one, and collect what the market pays to hold it. An
							agent runs each vault, and publishes every trade it makes.
						</p>
					</div>

					{/* The ink block: the destinations, ruled into cells. */}
					<nav className="w-full shrink-0 md:w-[260px]">
						<ul className="firm-ink rounded-[var(--pon-r-lg)] border border-[var(--pon-ink)]">
							{DESTINATIONS.map((item) => (
								<li key={item.href} className="border-b border-[var(--pon-line)] last:border-b-0">
									<Link
										to={item.href}
										className="flex items-center justify-between gap-3 px-3.5 py-2.5 font-mono text-[12.5px] tracking-[-0.02em] text-[var(--pon-fg)] transition-colors hover:text-[var(--pon-lime)]"
									>
										{item.label}
										<span aria-hidden className="text-[var(--pon-fg-3)]">
											→
										</span>
									</Link>
								</li>
							))}
						</ul>
					</nav>
				</div>

				<div className="mt-10 flex flex-col gap-2 border-t border-dashed border-[var(--pon-line-2)] pt-4 md:flex-row md:items-center md:justify-between">
					<p className="t-caption text-[var(--pon-fg-3)]">
						© {new Date().getFullYear()} Lemon Markets · Base · USDC
					</p>
					<p className="t-caption text-[var(--pon-fg-3)]">
						Not investment advice. The contracts have not been independently audited.
					</p>
				</div>
			</div>
		</footer>
	);
}
