import { Brand } from "@app/components/pons/Brand";
import { Link } from "react-router";

/**
 * Site footer.
 *
 * Pons closes a page with one framed panel: the brand and a short disclosure on
 * the left, three link columns beside it, and a hairline above a bottom row
 * carrying the copyright. The columns are equal-weight rather than a marketing
 * grid, because in Pons the footer is a directory, not a pitch.
 */

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
	{
		title: "Product",
		links: [
			{ label: "Trade perps", to: "/trade" },
			{ label: "Buy spot", to: "/spot" },
			{ label: "Baskets", to: "/baskets" },
			{ label: "Cash & carry", to: "/carry" },
		],
	},
	{
		title: "Account",
		links: [
			{ label: "Portfolio", to: "/portfolio" },
			{ label: "Accounts", to: "/accounts" },
			{ label: "Leaderboard", to: "/leaderboard" },
			{ label: "Docs", to: "/docs" },
		],
	},
];

const RISK_NOTES = [
	"Transactions are irreversible once submitted.",
	"Leverage carries risk of total loss.",
	"Not investment advice.",
];

export function Footer() {
	return (
		<div className="px-[var(--section-x)] pb-12">
			<footer className="mx-auto w-full max-w-[var(--content-max)] rounded-[var(--pon-r-2xl)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-8 md:p-10">
				<div className="flex flex-wrap justify-between gap-10">
					<div className="max-w-[280px]">
						<Brand size={26} />
						<p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--pon-fg-3)]">
							Trade tokenized stocks and FX on Base. Your wallet submits every transaction — Lemon
							Markets never custodies your assets.
						</p>
					</div>

					{COLUMNS.map((column) => (
						<nav key={column.title}>
							<p className="mb-3 t-caption text-[var(--pon-fg-3)]">{column.title}</p>
							{column.links.map((link) => (
								<Link
									key={link.to}
									to={link.to}
									className="mb-2.5 block text-[13px] text-[var(--pon-fg-2)] transition-colors hover:text-[var(--pon-lime)]"
								>
									{link.label}
								</Link>
							))}
						</nav>
					))}

					<div className="max-w-[220px]">
						<p className="mb-3 t-caption text-[var(--pon-fg-3)]">Risk notice</p>
						{RISK_NOTES.map((note) => (
							<p key={note} className="mb-2.5 text-[13px] leading-snug text-[var(--pon-fg-2)]">
								{note}
							</p>
						))}
					</div>
				</div>

				<div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--pon-line)] pt-[18px]">
					<span className="t-caption text-[var(--pon-fg-4)]">
						© {new Date().getFullYear()} Lemon Markets. All rights reserved.
					</span>
					<span className="inline-flex items-center gap-2 t-caption text-[var(--pon-fg-2)]">
						<span
							aria-hidden
							className="animate-pon-pulse size-1.5 rounded-full bg-[var(--pon-lime)]"
						/>
						Live on Base mainnet
					</span>
				</div>
			</footer>
		</div>
	);
}
