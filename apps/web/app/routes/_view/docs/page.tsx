import { Callout } from "@app/components/common/Callout";
import { cn } from "@app/lib/utils";
import { ROUND_TRIP_FEE_PERCENT, VENUE_FEES } from "@lemon/core";
import { REFERENCE_LEVERAGE, REFERENCE_NOTIONAL_USD } from "@lemon/registry";
import { useEffect, useState } from "react";
import { Link, type MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Docs — Lemon" },
	{
		name: "description",
		content:
			"How basis markets work here: the two legs, what the yield is made of, what it costs, and the API behind the board.",
	},
];

const SECTIONS = [
	{ id: "getting-started", label: "Getting started" },
	{ id: "how-it-works", label: "How a basis works" },
	{ id: "markets", label: "The markets" },
	{ id: "numbers", label: "Reading the numbers" },
	{ id: "fees", label: "Fees & funding" },
	{ id: "execution", label: "Execution" },
	{ id: "api", label: "API" },
	{ id: "points", label: "Points" },
	{ id: "risks", label: "Risks" },
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

function Endpoint({ method, path, children }: { method: string; path: string; children: string }) {
	return (
		<li className="border-b border-[var(--pon-line)] py-2.5 last:border-b-0">
			<p className="font-fono text-[12.5px] text-[var(--pon-fg)]">
				<span className="mr-2 text-[var(--pon-lime)]">{method}</span>
				{path}
			</p>
			<p className="mt-1 text-[12.5px] leading-relaxed text-[var(--pon-fg-3)]">{children}</p>
		</li>
	);
}

const strong = "font-semibold text-[var(--pon-fg)]";

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
		<div className="overflow-hidden rounded-[var(--pon-r-lg)] border border-[var(--pon-line)] bg-[var(--pon-bg)]">
			{/*
			  Pons opens its docs with a full-width band tinted by the accent and
			  fading to nothing, so the reading column below starts on a clean
			  surface rather than under a floating title.
			*/}
			<header className="border-b border-[var(--pon-line)] bg-gradient-to-b from-[var(--pon-lime-dim)] to-transparent px-7 py-9 sm:px-10">
				<p className="t-eyebrow text-[var(--pon-lime)]">Protocol</p>
				<h1 className="font-display mt-3 text-[clamp(28px,4vw,38px)] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--pon-fg-0)]">
					One product, documented
					<br />
					without the flattering parts.
				</h1>
				<p className="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--pon-fg-2)]">
					Lemon lists one thing: spot-versus-perp basis markets on Base. The spot leg routes through
					KyberSwap, the perp leg through Pacifica, and everything settles in USDC.
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
								Any Base-compatible wallet. Signing in also derives the Solana wallet that holds
								your Pacifica account — the app never takes custody of either.
							</Step>
							<Step n={2} title="Fund both sides">
								The spot leg is bought from your own wallet, so it needs USDC on Base. The short leg
								needs margin on Pacifica, funded from the{" "}
								<Link to="/accounts" className="font-semibold text-[var(--pon-lime)] underline">
									accounts
								</Link>{" "}
								page. A position cannot open with only one side funded.
							</Step>
							<Step n={3} title="Activate trading">
								One signature authorises an agent key to place and cancel orders on your Pacifica
								account. It cannot withdraw — withdrawals require the account key, which the agent
								key is not.
							</Step>
							<Step n={4} title="Pick a market">
								The{" "}
								<Link to="/" className="font-semibold text-[var(--pon-lime)] underline">
									board
								</Link>{" "}
								ranks every pair by net yield after costs. Open one, size it, and the app places
								both legs.
							</Step>
						</ol>
					</Section>

					<Section id="how-it-works" title="How a basis works">
						<p>
							A basis position holds two offsetting legs at equal notional:{" "}
							<span className={strong}>long the spot token</span> on Base and{" "}
							<span className={strong}>short the matching perp</span> on Pacifica. Because the sizes
							match, a move in the underlying gains on one leg exactly what it loses on the other.
							What is left over is funding, minus what it cost to get in and out.
						</p>
						<p>
							That is the whole trade. It is not a yield product and there is no counterparty paying
							you a rate — you are being paid by whichever side of the perp is crowded, for as long
							as it stays crowded.
						</p>
						<Callout tone="warning" title="It only earns when the short side receives funding">
							Funding flips. When longs are crowded the short side receives and the position earns;
							when shorts are crowded the position pays to exist. Every quote on this site shows the
							real sign rather than an absolute value.
						</Callout>
					</Section>

					<Section id="markets" title="The markets">
						<p>
							A basis market exists only where both legs do. That means a Base ERC-20 the aggregator
							can actually route into, paired with a Pacifica perp on the{" "}
							<span className={strong}>same underlying</span> — matched by ticker, never by a stored
							venue index, because indexes move between protocol versions and a stale one points at
							a different company rather than at nothing.
						</p>
						<p>
							In practice that is the Coinbase B20 tokenized equities on Base — Apple, Nvidia,
							Tesla, Alphabet and the rest — plus the Base tokens with a listed perp: BTC through
							cbBTC, ETH through WETH, AERO, and others.
						</p>
						<p>
							<span className={strong}>Same asset, not the same ticker.</span> A plain symbol match
							against a Base token list is dangerous: it returns an unrelated Base-native token for
							FARTCOIN, a governance token for DOGE, and a different issuer's tokenized stock for
							STRK. Pairing any of them would hedge against the wrong asset while looking perfectly
							healthy, so the registry is curated by hand and those are excluded.
						</p>
					</Section>

					<Section id="numbers" title="Reading the numbers">
						<p>
							<span className={strong}>Net APY</span> is the number the board ranks on and the one
							to decide with. It is funding, annualised, on the capital you actually deploy, minus
							the full round trip amortised over a year.
						</p>
						<p>
							<span className={strong}>Funding APR</span> is the gross number before any cost. It is
							what most venues advertise, and the two disagree often enough to matter — a market can
							pay the best funding on the board and still be the worst trade on it once a thin
							pool's slippage is priced in.
						</p>
						<p>
							<span className={strong}>Spread</span> is the perp mark against the price a real spot
							route would fill at, not against an oracle mid. On a shallow pool those differ by more
							than the entire funding edge. When either leg is unpriced the spread shows as a dash
							rather than as 0.00%, because an unquoted market is unknown, not fairly priced.
						</p>
						<p>
							<span className={strong}>Breakeven</span> is how long funding must hold at its current
							rate to cover the round trip. It is a straight-line estimate at today's rate, not a
							forecast.
						</p>
						<Callout tone="info" title="Board figures are quoted at a fixed size">
							Every row is priced at ${REFERENCE_NOTIONAL_USD.toLocaleString()} per leg at{" "}
							{REFERENCE_LEVERAGE}x so the rows are comparable. Slippage is not linear in size, so
							the ticket re-quotes both legs at whatever you actually type — a market that looks
							good at ${REFERENCE_NOTIONAL_USD.toLocaleString()} can be uneconomic at ten times
							that.
						</Callout>
					</Section>

					<Section id="fees" title="Fees &amp; funding">
						<p>
							<span className={strong}>{VENUE_FEES.spotTakerPercent}% on the spot leg</span> and{" "}
							<span className={strong}>{VENUE_FEES.perpTakerPercent}% on the perp leg</span>, per
							fill. A position crosses both legs on the way in and both again on the way out, so a
							round trip is four fills:{" "}
							<span className="font-fono text-[var(--pon-fg)]">
								2 × ({VENUE_FEES.spotTakerPercent}% + {VENUE_FEES.perpTakerPercent}%) ={" "}
								{ROUND_TRIP_FEE_PERCENT.toFixed(1)}%
							</span>{" "}
							of notional, before any slippage.
						</p>
						<p>
							That fixed {ROUND_TRIP_FEE_PERCENT.toFixed(1)}% is why a basis position has a minimum
							sensible holding period. At 8% annualised funding it takes roughly eighteen days to
							earn the round trip back; below about {ROUND_TRIP_FEE_PERCENT.toFixed(1)}% annualised
							funding, a position cannot clear its own costs in a year at all — which is a real
							market condition, and the board shows those markets with a negative net APY rather
							than hiding them.
						</p>
						<p>
							<span className={strong}>Slippage is measured, not assumed.</span> Both the entry and
							the exit are charged price impact. The exit figure is an estimate — the entry
							measurement is the best available proxy — and it is labelled as such rather than
							quietly omitted, which would understate the cost of every thin market on the board.
						</p>
						<p>
							<span className={strong}>Funding accrues hourly</span> on the perp leg only. Spot has
							no funding: buying a token outright has no counterparty and no ongoing rate, which is
							exactly why the position's whole return comes from the short side.
						</p>
					</Section>

					<Section id="execution" title="Execution">
						<p>
							Opening is two legs across two systems with no shared transaction. The spot buy goes
							first, deliberately: it is the slower and more failure-prone leg, so discovering a
							failure before any perp exposure exists is cheaper than the reverse.
						</p>
						<p>
							The short leg is then placed <span className={strong}>server-side</span> with your
							agent key — one request, no wallet prompt. A browser-signed hedge would leave you
							unhedged for as long as it took to confirm, or forever if the tab closed in between.
						</p>
						<p>
							<span className={strong}>Nothing is silently abandoned.</span> Each leg's outcome is
							persisted before the next is attempted. If one lands and the other fails, the position
							is recorded as needing attention with the exact exposure named, and offers to either
							complete the missing leg or unwind the one that landed.
						</p>
						<Callout tone="info" title="Perp positions are netted per symbol">
							Pacifica nets positions by symbol, so a separate order in a symbol you already hold a
							basis in would cancel that position's hedge. That is why there is no discretionary
							order surface here, and why the Pacifica holdings table is read-only — closing happens
							from the position, which closes both legs together.
						</Callout>
					</Section>

					<Section id="api" title="API">
						<p>
							The board is served from a public JSON API. No key is needed for market data; anything
							that touches a position requires a session cookie.
						</p>
						<ul className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-4">
							<Endpoint method="GET" path="/api/basis/markets">
								Every pair, ranked by net yield. Untradable markets are included with a `blockers`
								array explaining why, rather than being filtered out.
							</Endpoint>
							<Endpoint method="GET" path="/api/basis/markets/:id">
								One market, by ticker (NVDA) or either leg's symbol (NVDAc, NVDA-USD).
							</Endpoint>
							<Endpoint method="GET" path="/api/basis/markets/:id/candles">
								OHLCV for the perp mark. Not the spread — no venue publishes a price history for a
								tokenized equity on Base, so there is nothing to difference against.
							</Endpoint>
							<Endpoint method="POST" path="/api/basis/plan">
								Price a position at real size. Re-quotes both legs live; commits to nothing.
							</Endpoint>
							<Endpoint method="GET" path="/api/basis/positions?user=0x…">
								Positions for an address, with the legs that make each one up.
							</Endpoint>
						</ul>
						<p className="t-caption text-[var(--pon-fg-4)]">
							Rates and liquidity are read live from upstream on every request behind a short cache,
							so treat a response as a quote with a shelf life rather than as a stored value.
						</p>
					</Section>

					<Section id="points" title="Points">
						<p>
							Points accrue automatically — there is nothing to claim. See the{" "}
							<Link to="/leaderboard" className="font-semibold text-[var(--pon-lime)] underline">
								leaderboard
							</Link>{" "}
							for the current standings and exact rates.
						</p>
						<p>
							<span className={strong}>Everything is verified.</span> Spot volume is checked against
							its transaction on-chain — it must exist, have succeeded, and have been sent by the
							address claiming it. Positions opened are counted from our own records of both legs,
							never from a client report, so there is nothing to forge with a POST.
						</p>
						<p className="t-caption text-[var(--pon-fg-4)]">
							Points and tiers are cosmetic. They are not a token, carry no entitlement, and may be
							recalculated.
						</p>
					</Section>

					<Section id="risks" title="Risks">
						<ul className="list-inside list-disc space-y-1.5">
							<li>
								<span className={strong}>The hedge can be liquidated.</span> The short leg is
								leveraged; if the underlying rallies far enough the perp liquidates and you are left
								long spot with no hedge. Higher leverage frees capital and moves that point closer.
							</li>
							<li>
								<span className={strong}>Funding flips.</span> A position that earns today can pay
								tomorrow, and nothing guarantees it stays positive long enough to clear the round
								trip.
							</li>
							<li>
								<span className={strong}>Thin spot liquidity.</span> Exit impact can be worse than
								entry, and a market that was routable when you opened may not be when you close.
							</li>
							<li>
								<span className={strong}>Overnight and weekend drift on equities.</span> Both legs
								keep trading, but the market that prices the underlying does not — so the spread can
								widen on thin flow and reprice at the open.
							</li>
							<li>
								<span className={strong}>Issuer and contract risk</span> across Pacifica, KyberSwap,
								the NEAR MPC network and the token issuers. Tokenized equities are issued by third
								parties and may carry transfer restrictions or be unavailable in your jurisdiction.
							</li>
						</ul>
						<p className="t-caption text-[var(--pon-fg-4)]">
							Nothing here is investment advice. You are responsible for your own positions.
						</p>
					</Section>

					<Section id="faq" title="FAQ">
						<dl className="space-y-4">
							{[
								{
									q: "Do I need ETH on Base for gas?",
									a: "Yes, a small amount. The spot leg is an ordinary transaction from your wallet, so it and its one-time token approval cost gas. The short leg does not — it is signed server-side with your agent key.",
								},
								{
									q: "Why does a market show a negative net APY?",
									a: "Either funding is negative on the short side, meaning the position would pay to exist, or funding is positive but too thin to cover the 0.4% round trip over a year. Both are real market conditions rather than errors, and both are shown rather than hidden.",
								},
								{
									q: "Why is a market listed but not enterable?",
									a: "Almost always the spot leg: several tokenized equities have no Aerodrome pool, or a one-sided one. The board keeps them visible with the reason, because a symbol that silently vanishes is indistinguishable from one that was never listed.",
								},
								{
									q: "What happens if one leg fails?",
									a: "The position is flagged as needing attention and names exactly what you are holding unhedged, with actions to complete the missing leg or unwind the one that landed. It is never marked closed while real exposure is live.",
								},
								{
									q: "Why can't I close the perp from the accounts page?",
									a: "Pacifica nets positions per symbol, so closing one there would flatten the hedge while the position record still described it as hedged. Unwinding from the position closes both legs together and records what happened.",
								},
								{
									q: "Are my funds custodied?",
									a: "The spot leg is yours outright, in your own wallet. The perp leg sits in a Pacifica account controlled by a wallet derived through NEAR chain signatures — the private key exists nowhere, and the agent key the app holds can trade but cannot withdraw.",
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
