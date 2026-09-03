import { Callout } from "@app/components/common/Callout";
import { cn } from "@app/lib/utils";
import {
	ArrowLeftRight,
	Bot,
	Check,
	Circle,
	Coins,
	Layers,
	Scale,
	TrendingUp,
	Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, type MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Docs — Lemon Markets" },
	{
		name: "description",
		content:
			"How to deposit, trade perps and spot, and run delta-neutral cash-and-carry on Lemon Markets.",
	},
];

const SECTIONS = [
	{ id: "getting-started", label: "Getting started" },
	{ id: "trading", label: "Trading" },
	{ id: "spot", label: "Spot" },
	{ id: "carry", label: "Cash & carry" },
	{ id: "fees", label: "Fees & funding" },
	{ id: "points", label: "Points" },
	{ id: "risks", label: "Risks" },
	{ id: "roadmap", label: "Roadmap" },
	{ id: "faq", label: "FAQ" },
] as const;

function Section({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section id={id} className="scroll-mt-28 space-y-3">
			<h2 className="font-display text-[22px] font-bold text-[var(--pon-fg-0)]">{title}</h2>
			<div className="space-y-3 text-[13.5px] leading-relaxed text-[var(--pon-fg-2)]">
				{children}
			</div>
		</section>
	);
}

/**
 * Numbered step.
 *
 * Pons runs a sequence as hairline-separated rows with a tabular ordinal in the
 * margin — no counter badges. The rule between rows is what carries the order.
 */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
	return (
		<li className="flex gap-3.5 border-b border-[var(--pon-line)] py-3 last:border-b-0">
			<span className="font-fono shrink-0 t-caption text-[var(--pon-fg-3)]">
				{String(n).padStart(2, "0")}
			</span>
			<div className="min-w-0">
				<p className="text-[13.5px] font-semibold text-[var(--pon-fg)]">{title}</p>
				<p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--pon-fg-3)]">{children}</p>
			</div>
		</li>
	);
}

type Status = "live" | "building" | "planned";

const ROADMAP: { status: Status; title: string; body: string; icon: typeof Coins }[] = [
	{
		status: "live",
		title: "Perps on every Pacifica market",
		body: "Crypto, tokenized equities, FX, commodities and metals — 90+ markets, gasless order signing, market/limit/stop orders with TP and SL.",
		icon: TrendingUp,
	},
	{
		status: "live",
		title: "Spot via KyberSwap",
		body: "Market and limit orders on every Base token that has a matching Pacifica market.",
		icon: Coins,
	},
	{
		status: "live",
		title: "Cash & carry",
		body: "Delta-neutral positions across both legs with honest funding maths and recovery for half-filled opens.",
		icon: Scale,
	},
	{
		status: "planned",
		title: "Cross-chain deposits",
		body: "Fund from any supported chain with a Relay deposit address — a plain transfer rather than a bridging UI. The integration is built; the surface is not enabled yet.",
		icon: ArrowLeftRight,
	},
	{
		status: "building",
		title: "Leveraged spot via Morpho and Aave",
		body: "Borrow against a spot position to lever it up, using Morpho and Aave markets on Base. Lets you hold real tokens with leverage instead of synthetic exposure, and pairs with carry for higher capital efficiency.",
		icon: Layers,
	},
	{
		status: "building",
		title: "AI trading agent",
		body: "Describe a position in plain language and have it built, sized and risk-checked for you — including scanning every market for the best live carry rather than checking them one at a time.",
		icon: Bot,
	},
	{
		status: "planned",
		title: "Portfolio margin and auto-rebalancing",
		body: "Keep carry positions delta-neutral automatically as prices drift, and net margin across positions.",
		icon: Wallet,
	},
];

const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
	live: {
		label: "Live",
		className: "border-[var(--pon-lime)] bg-[var(--pon-lime-dim)] text-[var(--pon-lime)]",
	},
	building: {
		label: "Coming soon",
		className: "border-[var(--pon-amber)] bg-[var(--pon-amber)]/10 text-[var(--pon-amber)]",
	},
	planned: {
		label: "Planned",
		className: "border-[var(--pon-line-2)] bg-[var(--pon-surface-2)] text-[var(--pon-fg-3)]",
	},
};

export default function DocsPage() {
	const [active, setActive] = useState<string>(SECTIONS[0].id);

	// Highlight the section currently in view in the table of contents.
	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
				if (visible) setActive(visible.target.id);
			},
			{ rootMargin: "-96px 0px -60% 0px" },
		);

		for (const section of SECTIONS) {
			const element = document.getElementById(section.id);
			if (element) observer.observe(element);
		}
		return () => observer.disconnect();
	}, []);

	return (
		<div className="overflow-hidden rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-bg)]">
			{/*
			  Pons opens its docs with a full-width band tinted by the accent and
			  fading to nothing, so the reading column below starts on a clean
			  surface rather than under a floating title.
			*/}
			<header className="border-b border-[var(--pon-line)] bg-gradient-to-b from-[var(--pon-lime-dim)] to-transparent px-7 py-9 sm:px-10">
				<p className="t-eyebrow text-[var(--pon-lime)]">Protocol</p>
				<h1 className="font-display mt-3 text-[clamp(28px,4vw,38px)] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--pon-fg-0)]">
					Everything about Lemon Markets,
					<br />
					in one place.
				</h1>
				<p className="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--pon-fg-2)]">
					Everything on Lemon Markets settles in USDC. Perps run on Pacifica and spot routes through
					KyberSwap.
				</p>
			</header>

			<div className="grid lg:grid-cols-[220px_1fr]">
				{/* Table of contents */}
				<nav
					className="border-b border-[var(--pon-line)] px-5 py-6 lg:sticky lg:top-[92px] lg:self-start lg:border-b-0 lg:border-r"
					aria-label="Table of contents"
				>
					<p className="mb-3 t-caption text-[var(--pon-fg-3)]">Contents</p>
					<ul className="space-y-0.5">
						{SECTIONS.map((section) => (
							<li key={section.id}>
								<a
									href={`#${section.id}`}
									className={cn(
										"block rounded-[var(--pon-r-sm)] px-2.5 py-1.5 text-[13px] transition-colors",
										active === section.id
											? "bg-[var(--pon-lime-dim)] font-semibold text-[var(--pon-lime)]"
											: "text-[var(--pon-fg-2)] hover:text-[var(--pon-fg)]",
									)}
								>
									{section.label}
								</a>
							</li>
						))}
					</ul>
				</nav>

				<div className="min-w-0 space-y-9 px-6 py-7 sm:px-8">
					<Section id="getting-started" title="Getting started">
						<ol className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-4">
							<Step n={1} title="Connect a wallet">
								Any Base-compatible wallet works. The app only ever asks you to sign — it never
								takes custody.
							</Step>
							<Step n={2} title="Fund with USDC on Base">
								Send USDC to your wallet on Base. Bridging from another chain is on the roadmap
								below.
							</Step>
							<Step n={3} title="Approve USDC once">
								The first perp order asks for a one-time approval so the protocol can pull
								collateral. Spot approves the router the first time you swap a given token.
							</Step>
							<Step n={4} title="Trade">
								Open the{" "}
								<Link to="/trade" className="font-semibold text-[var(--pon-lime)] underline">
									terminal
								</Link>
								, pick a market from the selector, and switch between Perp and Spot in the order
								panel.
							</Step>
						</ol>
					</Section>

					<Section id="trading" title="Trading">
						<p>
							Perps are provided by Pacifica. Every listed market is available: crypto, tokenized US
							equities, FX majors, commodities and metals. Leverage caps are per-market and enforced
							by the protocol — up to 500x on FX majors, and typically 2–10x on equities.
						</p>
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">Order types.</strong> Market
							fills at the oracle price immediately. Limit and Stop rest on-chain until triggered,
							escrowing their collateral; cancelling refunds it. Take-profit and stop-loss can be
							attached to any order.
						</p>
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">Gasless.</strong> Orders are
							signed as EIP-712 agent key you authorise once, so no wallet prompt and no gas are
							needed on Base to trade. If the operator is unavailable the app falls back to a normal
							transaction that you pay gas for.
						</p>
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">Market hours.</strong> Crypto
							trades 24/7. Equities and FX follow real trading calendars — blue chips 24/5,
							longer-tail names during US market hours only — and orders are rejected while a market
							is closed. The terminal shows the session state and the next open.
						</p>
					</Section>

					<Section id="spot" title="Spot">
						<p>
							Spot buys and sells real tokens on Base, routed through the KyberSwap aggregator. The
							tradable set is deliberately limited to underlyings that Pacifica also lists, so
							anything you can hold you can also hedge.
						</p>
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">
								Availability is measured, not assumed.
							</strong>{" "}
							Several tokenized equities have thin or one-sided liquidity on Base. The app probes
							live routes and shows each token as buyable, sell-only, or unavailable rather than
							letting an order fail at signing time.
						</p>
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">Limit orders</strong> are
							signed off-chain and cost no gas. They rest in KyberSwap's orderbook until a taker
							fills them — on thin pools an order can sit unfilled until it expires, which is normal
							behaviour for a limit order rather than a failure. Cancelling is also gasless and
							takes effect within a few minutes.
						</p>
						<Callout tone="info" title="Price impact is not a footnote">
							Tokenized-equity pools on Base are shallow. A $100 trade can move the price over 1%.
							The quoted impact is shown on the order panel before you sign.
						</Callout>
					</Section>

					<Section id="carry" title="Cash &amp; carry">
						<p>
							A cash-and-carry buys the spot token and shorts the matching perp at equal notional.
							Because the legs offset, price movement cancels out and what remains is funding minus
							costs.
						</p>
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">
								It only earns when funding is positive on the short side
							</strong>
							, which happens when longs are crowded. When shorts are crowded the position pays
							funding instead. The builder shows the real sign, the round-trip cost, and how long
							you would have to hold to break even — before you commit.
						</p>
						<p>
							Opening is two transactions: the spot buy, then the hedging short. If the second fails
							you are left holding unhedged spot, so the position is recorded as needing attention
							and offers to either complete the short or sell the spot back out. It is never
							silently abandoned.
						</p>
						<Callout tone="warning" title="Equity carries have a weekend gap">
							Spot tokens trade 24/7 but equity perps close nights and weekends. While the perp is
							shut you can sell the spot leg but cannot close the short, which breaks the hedge.
						</Callout>
					</Section>

					<Section id="fees" title="Fees &amp; funding">
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">Perp fees</strong> are set by
							Pacifica: roughly 4.5bps taker on crypto majors, and zero commission on real-world
							assets while they are in growth mode, where you pay the spread instead.
						</p>
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">
								Funding applies to perps only.
							</strong>{" "}
							It accrues hourly while a position is open and is displayed annualised. Read the sign
							carefully: a positive rate means that side{" "}
							<em className="text-[var(--pon-fg)]">receives</em> funding, negative means it pays.
							The crowded side generally pays the lighter one.
						</p>
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">Spot has no funding.</strong>{" "}
							Buying a token is an outright purchase — there is no counterparty, no borrow and no
							ongoing rate. Your only costs are the pool's swap fee plus price impact, both included
							in the quote you are shown, plus Base gas. This is also why a cash-and-carry earns or
							pays purely on the perp leg.
						</p>
					</Section>

					<Section id="points" title="Points">
						<p>
							Points accrue automatically from trading through Lemon Markets — there is nothing to
							claim or sign up for. See the{" "}
							<Link to="/leaderboard" className="font-semibold text-[var(--pon-lime)] underline">
								leaderboard
							</Link>{" "}
							for the current standings and the exact rates.
						</p>
						<p>
							<strong className="font-semibold text-[var(--pon-fg)]">
								Everything is verified.
							</strong>{" "}
							Perp volume is recorded from the orders this app places, and each spot trade is
							checked against its transaction on-chain — it must exist, have succeeded, and have
							been sent by the address claiming it. Reporting a transaction twice awards nothing the
							second time.
						</p>
						<p className="t-caption text-[var(--pon-fg-4)]">
							Points and tiers are cosmetic. They are not a token, carry no entitlement, and may be
							recalculated.
						</p>
					</Section>

					<Section id="risks" title="Risks">
						<ul className="list-inside list-disc space-y-1.5">
							<li>Leverage can liquidate your position. Watch the liquidation price.</li>
							<li>
								Thin spot liquidity means slippage on entry and exit, and exit impact may be worse
								than entry.
							</li>
							<li>
								Tokenized equities are issued by third parties and may carry transfer restrictions
								or be unavailable in your jurisdiction.
							</li>
							<li>Funding rates move; a carry that earns today can pay tomorrow.</li>
							<li>Smart contract risk across Pacifica, KyberSwap, Relay and the token issuers.</li>
						</ul>
						<p className="t-caption text-[var(--pon-fg-4)]">
							Nothing here is investment advice. You are responsible for your own positions.
						</p>
					</Section>

					<Section id="roadmap" title="Roadmap">
						<ul className="space-y-3">
							{ROADMAP.map((item) => {
								const Icon = item.icon;
								const status = STATUS_STYLES[item.status];
								return (
									<li
										key={item.title}
										className="flex gap-3.5 rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4"
									>
										<Icon
											size={18}
											className="mt-0.5 shrink-0 text-[var(--pon-fg-3)]"
											aria-hidden
										/>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2">
												<p className="text-[13.5px] font-semibold text-[var(--pon-fg)]">
													{item.title}
												</p>
												<span
													className={cn(
														"inline-flex items-center gap-1 rounded-[var(--pon-r-sm)] border px-2 py-0.5 text-[10px] font-semibold uppercase",
														status.className,
													)}
												>
													{item.status === "live" ? (
														<Check size={10} aria-hidden />
													) : (
														<Circle size={8} aria-hidden />
													)}
													{status.label}
												</span>
											</div>
											<p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--pon-fg-3)]">
												{item.body}
											</p>
										</div>
									</li>
								);
							})}
						</ul>
					</Section>

					<Section id="faq" title="FAQ">
						<dl className="space-y-4">
							{[
								{
									q: "Do I need ETH on Base for gas?",
									a: "Not for perp orders — those are signed server-side with the agent key you authorise at sign-in. Spot swaps and approvals are ordinary transactions, so those need a small amount of ETH.",
								},
								{
									q: "Why can I sell a token but not buy it?",
									a: "Liquidity on Base can be one-sided. The app probes both directions live and shows exactly which are available rather than failing at signing time.",
								},
								{
									q: "Why is my cash-and-carry showing a negative APY?",
									a: "Funding is currently negative on the short side of that market, meaning the position would pay to exist. That is a real market condition, not an error — carries only earn when longs are crowded.",
								},
								{
									q: "What happens if one leg of a carry fails?",
									a: "The position is flagged as needing attention and shows exactly what you are holding unhedged, with actions to complete the missing leg or unwind the one that landed.",
								},
								{
									q: "Are my funds custodied?",
									a: "No. Everything is signed from your wallet and settles on-chain. The app never holds your assets.",
								},
							].map((item) => (
								<div
									key={item.q}
									className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4"
								>
									<dt className="text-[13.5px] font-semibold text-[var(--pon-fg)]">{item.q}</dt>
									<dd className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--pon-fg-3)]">
										{item.a}
									</dd>
								</div>
							))}
						</dl>
					</Section>
				</div>
			</div>
		</div>
	);
}
