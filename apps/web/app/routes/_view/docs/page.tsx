import { ROUND_TRIP_FEE_PERCENT, VENUE_FEES } from "@lemon/core";
import { Callout, cn } from "@lemon/ui";
import { useEffect, useState } from "react";
import { Link, type MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Docs — Lemon" },
	{
		name: "description",
		content:
			"How the vaults work: what an agent does with your USDC, where the yield comes from, what the fees are, why withdrawals take days, and how to check any of it yourself.",
	},
];

const SECTIONS = [
	{ id: "getting-started", label: "Getting started" },
	{ id: "how-it-works", label: "How a basis works" },
	{ id: "vaults", label: "What a vault is" },
	{ id: "tiers", label: "Risk tiers" },
	{ id: "agent", label: "The agent" },
	{ id: "withdrawals", label: "Withdrawals" },
	{ id: "fees", label: "Fees" },
	{ id: "limits", label: "What the contract enforces" },
	{ id: "transparency", label: "Checking it yourself" },
	{ id: "developers", label: "Developers" },
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
			<header className="border-b border-[var(--pon-line)] bg-gradient-to-b from-[var(--pon-lime-dim)] to-transparent px-5 py-7 sm:px-10 sm:py-9">
				<p className="t-eyebrow text-[var(--pon-lime)]">Protocol</p>
				<h1 className="font-display mt-3 text-[clamp(24px,4vw,38px)] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--pon-fg-0)]">
					One product, documented
				</h1>
				<p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--pon-fg-2)]">
					Vaults that run a delta-neutral basis position on Base. You deposit USDC; an agent does
					the trading. This is what it does with the money, what it costs, and how to check any of
					it without taking our word for it.
				</p>
			</header>

			<div className="gap-10 px-5 py-8 sm:px-10 lg:flex">
				<nav className="mb-8 hidden shrink-0 lg:sticky lg:top-24 lg:mb-0 lg:block lg:h-fit lg:w-52">
					<ul className="space-y-0.5">
						{SECTIONS.map((section) => (
							<li key={section.id}>
								<a
									href={`#${section.id}`}
									className={cn(
										"block rounded-[var(--pon-r-sm)] px-2.5 py-1.5 text-[12.5px] transition-colors",
										active === section.id
											? "bg-[var(--pon-surface-2)] font-semibold text-[var(--pon-fg)]"
											: "text-[var(--pon-fg-3)] hover:text-[var(--pon-fg)]",
									)}
								>
									{section.label}
								</a>
							</li>
						))}
					</ul>
				</nav>

				<div className="min-w-0 max-w-2xl flex-1 space-y-10">
					<Section id="getting-started" title="Getting started">
						<p>There is one thing to do, and it takes one transaction.</p>
						<ol className="mt-1">
							<Step n={1} title="Pick a vault">
								Each vault trades one market at one risk level. The board shows what each one's
								share price has actually done, not what it might do.
							</Step>
							<Step n={2} title="Deposit USDC">
								Share tokens are minted immediately, at the vault's current price. The first deposit
								into a vault also needs a one-off USDC approval, so two signatures the first time
								and one after.
							</Step>
							<Step n={3} title="Hold, or leave">
								Your shares gain or lose value with the position. To exit, request a withdrawal — it
								is queued for 3 to 7 days while the agent unwinds your share of the position, then
								you claim.
							</Step>
						</ol>
						<Callout tone="info" title="No account needed">
							Depositing and withdrawing are ordinary wallet transactions. Signing in is optional
							and grants nothing — it only saves you typing an address on the portfolio page.
						</Callout>
					</Section>

					<Section id="how-it-works" title="How a basis works">
						<p>
							A vault buys a token on Base and shorts the matching perpetual on Pacifica at{" "}
							<span className={strong}>the same size</span>. If the price rises, the spot gains what
							the short loses. If it falls, the reverse. The position is therefore not a bet on
							direction.
						</p>
						<p>
							What is left is <span className={strong}>funding</span>. Perp traders pay each other
							an hourly rate, and when longs are crowded that rate flows to the short side. Holding
							the short leg collects it. That stream, minus the cost of getting in and out, is the
							entire return.
						</p>
						<p>
							Fees are {VENUE_FEES.spotTakerPercent}% per leg per fill, so a full round trip crosses
							four fills and costs{" "}
							<span className={strong}>{ROUND_TRIP_FEE_PERCENT}% of notional</span> before slippage.
							That is why a vault holds a position rather than churning it, and why funding has to
							hold for a while to be worth collecting.
						</p>
					</Section>

					<Section id="vaults" title="What a vault is">
						<p>
							An ERC-4626 vault on Base holding USDC. Depositing mints you a share token; the share
							price is the vault's total value divided by the shares outstanding. Gains raise it,
							losses and fees lower it.
						</p>
						<p>
							One vault runs <span className={strong}>one market</span> at{" "}
							<span className={strong}>one risk level</span> through{" "}
							<span className={strong}>one agent</span>. That mapping is enforced by the factory
							that creates them: two vaults cannot compete for the same funding, and one agent key
							cannot be the single point of failure for two books.
						</p>
						<p>
							Your capital does not stay in the contract — it is out in a spot position and a perp
							account, which is the entire point. The contract holds custody of what is idle, the
							share accounting, the withdrawal queue, and hard limits on what the agent can do.
						</p>
					</Section>

					<Section id="tiers" title="Risk tiers">
						<p>
							Two tiers, chosen when the vault is created and{" "}
							<span className={strong}>fixed permanently</span>. They are different products, and
							turning one into the other underneath people who already deposited is not something
							the contract allows.
						</p>
						<ul className="mt-1">
							<Step n={1} title="No leverage — 1x">
								The short is fully collateralised. There is no liquidation price, so a move in the
								underlying cannot wipe the position. The yield is funding on capital deployed
								one-for-one.
							</Step>
							<Step n={2} title="Leveraged — 2x to 3x">
								The same trade with a third to a half of the margin, which multiplies the funding
								yield by the same factor. It also introduces a liquidation price: a sharp adverse
								move against the hedge can lose capital.
							</Step>
						</ul>
						<p>
							"Conservative" is checked, not claimed. The contract refuses to create such a vault at
							anything other than exactly 1x with no headroom, and no vault of either tier may
							exceed 3x.
						</p>
					</Section>

					<Section id="agent" title="The agent">
						<p>
							Each vault has one agent with its own wallet, derived through{" "}
							<a
								href="https://docs.near.org/chain-abstraction/chain-signatures"
								target="_blank"
								rel="noreferrer noopener"
								className="text-[var(--pon-lime)] underline underline-offset-2"
							>
								NEAR chain signatures
							</a>
							. No private key exists anywhere — the MPC network signs on request, and the address
							is a deterministic function of the vault, so it is reproducible rather than a stored
							secret.
						</p>
						<p>The agent does four things, on a loop:</p>
						<ol className="mt-1">
							<Step n={1} title="Values the position">
								Reads both venues and reports what the deployed capital is worth. The spot leg is
								priced at an executable sell quote, not a mid — a thin pool's mid flatters a holding
								nobody can liquidate at that price.
							</Step>
							<Step n={2} title="Deploys idle capital">
								Buys the spot leg, bridges margin to Solana, and opens the short at the vault's
								target leverage.
							</Step>
							<Step n={3} title="Rebalances">
								The hedge drifts — a lot-grid rounding at open, a partial fill, an auto-deleveraging
								event. Drift is measured in units rather than dollars, so a neutral position reads
								neutral at any price, and only the perp leg is traded to correct it.
							</Step>
							<Step n={4} title="Unwinds for withdrawals">
								Closes enough of the position to pay the queue, returns the USDC, and settles the
								requests.
							</Step>
						</ol>
						<Callout tone="info" title="Where the model fits">
							A deterministic policy decides what is permissible and sizes every trade. A language
							model only picks among options that are already safe — it can never produce an amount,
							and an answer naming an action the policy did not offer is discarded. Near a
							withdrawal deadline it is not consulted at all.
						</Callout>
					</Section>

					<Section id="withdrawals" title="Withdrawals">
						<p>
							Requesting a withdrawal moves your shares into escrow and queues them. The agent may
							not act for <span className={strong}>three days</span>, and is held to{" "}
							<span className={strong}>seven</span>. Then you claim.
						</p>
						<p>
							Your shares stay outstanding for the whole of that window, so you keep earning — and
							keep the risk — until the position is actually closed. The amount you receive is
							priced <span className={strong}>at fulfilment</span>, not at request. That is
							deliberate: a price fixed on the day you asked would be a free option on everyone
							else's capital while the agent spends days closing a leveraged hedge.
						</p>
						<p>
							Adding to a request already in the queue restarts its three-day clock. Requests merge
							into one, so keeping the earlier timestamp would let a one-wei request ripen and then
							carry an arbitrarily large top-up out with it.
						</p>
						<Callout tone="warning" title="What the delay cannot promise">
							The three-day floor is enforced on-chain. The seven-day ceiling is not — no contract
							can make an off-chain agent act. What the contract does is publish the deadline, so
							lateness is visible to anyone rather than only to us. Overdue requests are flagged on
							your portfolio page and on the operator dashboard.
						</Callout>
					</Section>

					<Section id="fees" title="Fees">
						<p>
							<span className={strong}>2% a year</span> on assets under management, streamed
							continuously, and <span className={strong}>20% of gains</span> above the vault's
							previous high-water mark.
						</p>
						<p>
							The high-water mark is what stops you paying twice for the same dollar: a vault that
							falls 10% and recovers charges nothing on the recovery. New highs are chargeable
							again.
						</p>
						<p>
							Both are taken as newly minted shares rather than a transfer of USDC, so the fee
							dilutes rather than draining the working position — and both are already reflected in
							the share price you see. The management fee is charged first, which stops the operator
							earning a performance fee on assets it is about to take as rent.
						</p>
						<p>
							Fee shares are minted to an insurance fund, which is also what can absorb a vault
							shortfall: it can send USDC into a vault with nothing minted against it, raising the
							share price for everyone still in.
						</p>
					</Section>

					<Section id="limits" title="What the contract enforces">
						<p>The agent is not trusted. It is bounded, and the bounds are on-chain:</p>
						<ul className="mt-1">
							<Step n={1} title="One destination">
								The agent can only move USDC to its own wallet, whose address is fixed at the
								vault's creation and cannot be changed. There is no recipient parameter to abuse.
							</Step>
							<Step n={2} title="Rate and ratio limits">
								It can withdraw only a capped amount per rolling window, and never more than a set
								fraction of the vault — so an idle buffer always remains for the withdrawal queue.
							</Step>
							<Step n={3} title="Bounded valuations">
								Its report of what the position is worth is limited per report and again per day, so
								repricing the vault is slow and visible rather than instant. A report above the
								vault's leverage mandate is rejected outright.
							</Step>
							<Step n={4} title="A guardian">
								A human can pause the vault or declare an emergency exit. Pausing never blocks a
								user from queueing a withdrawal.
							</Step>
						</ul>
						<Callout tone="warning" title="Stated plainly">
							None of this makes the agent trustless. The position genuinely lives off-chain, so its
							value genuinely has to be reported. What the limits do is make a compromised agent's
							worst case bounded and observable — which is the honest ceiling for this design, not a
							claim that theft is impossible.
						</Callout>
					</Section>

					<Section id="transparency" title="Checking it yourself">
						<p>
							Every action an agent takes is published to its vault contract and shown on the{" "}
							<Link to="/activity" className="text-[var(--pon-lime)] underline underline-offset-2">
								activity feed
							</Link>{" "}
							— spot fills, perp opens and closes, bridges in both directions, venue deposits and
							funding settlement, each tagged with the chain it happened on and a link to the
							transaction.
						</p>
						<p>
							These are <span className={strong}>attestations, not proofs</span>. Base cannot verify
							a Pacifica fill, and we say so on every row rather than presenting them all as
							established fact. What makes them useful anyway is that each names a real transaction
							on a public chain: it can be fetched and compared against what was claimed. A row
							marked <span className={strong}>verified</span> has been; one marked{" "}
							<span className={strong}>does not check out</span> has been and disagrees; an
							unverified row has not been looked at yet, which is not the same as being wrong.
						</p>
						<p>
							Every number in this app is derived from chain events and served from a public
							indexer. The yield figures come from the share-price series shown on each vault page,
							so you can recompute them from the same data rather than trusting the percentage.
						</p>
					</Section>

					<Section id="developers" title="Developers">
						<p>
							Developer documentation and an SDK are coming soon. Until they are published, the
							section above is the way to check a vault yourself: every position, valuation and
							transfer is on-chain, and every agent action links to the transaction it came from.
						</p>
					</Section>

					<Section id="risks" title="Risks">
						<p>Delta neutral means price-neutral. It does not mean safe.</p>
						<ul className="mt-1">
							<Step n={1} title="Funding can turn negative">
								When shorts are crowded the rate flips and the position pays rather than earns. The
								vault can hold through it or unwind, and either choice costs something.
							</Step>
							<Step n={2} title="A leveraged short can be liquidated">
								At 2–3x there is a liquidation price. A sharp move against the hedge before the
								agent can rebalance is a real loss, and the conservative tier exists precisely
								because some depositors should not take it.
							</Step>
							<Step n={3} title="The spot leg can become illiquid">
								Several tokenized equities trade on thin Aerodrome pools. Exiting one can cost
								several percent, and a pool with no route at all leaves the vault unable to price
								itself — which blocks deposits and withdrawals until it recovers.
							</Step>
							<Step n={4} title="The agent is a dependency">
								If it stops reporting, the vault goes stale and neither deposits nor withdrawals
								settle until it resumes or a guardian intervenes. Funds are not at risk in that
								state, but they are not moving either.
							</Step>
							<Step n={5} title="These contracts are new">
								They are tested and their limits are documented above, but they have not been
								through a third-party audit. Do not deposit more than you would be willing to lose
								to a bug.
							</Step>
						</ul>
					</Section>

					<Section id="faq" title="FAQ">
						<dl className="space-y-4">
							{[
								{
									q: "Do I have to do anything after depositing?",
									a: "No. The agent opens the position, rebalances the hedge as it drifts, and handles funding. Your only other action is requesting a withdrawal when you want to leave.",
								},
								{
									q: "Why does withdrawing take days?",
									a: "Your money is in a live spot-and-perp position across two chains. Paying you means closing part of it, and forcing that to happen instantly would mean unwinding at whatever price is available in that second — which the remaining depositors would pay for.",
								},
								{
									q: "Can I sell my shares instead of waiting?",
									a: "The share token is a standard ERC-20, so it can be transferred. Whether anyone will buy it depends on a market existing for it, and none is provided here.",
								},
								{
									q: "What happens if the agent's key is stolen?",
									a: "It can move capital only to the agent's own wallet, only at a capped rate, and only up to a set fraction of the vault. It can misreport the position's value within a bounded range per report and per day. It cannot mint itself shares, cannot change where funds go, and cannot stop you queueing a withdrawal. A guardian can pause it.",
								},
								{
									q: "Who decides what the position is worth?",
									a: "The agent reports it, and the contract bounds the report. That is the one unverifiable input in the system, and every limit described above exists because of it.",
								},
								{
									q: "What is the difference between the two tiers, in one sentence?",
									a: "The conservative vault cannot be liquidated; the leveraged one can, and pays two to three times as much funding for taking that risk.",
								},
								{
									q: "Where do the fees go?",
									a: "Into an insurance fund, as shares of the vault that earned them. So the operator's take stays invested alongside depositors and exits through the same 3-to-7-day queue, and the fund can donate USDC back into a vault to cover a shortfall.",
								},
								{
									q: "Is my deposit custodial?",
									a: "Yes, in the sense that matters: the contract holds your USDC and an agent trades it. What you hold is a share of the vault, redeemable through the queue. This is a real change from a design where the spot leg sat in your own wallet, and it is the trade you make for not having to run the position yourself.",
								},
							].map((item) => (
								<div key={item.q}>
									<dt className="text-[13.5px] font-semibold text-[var(--pon-fg)]">{item.q}</dt>
									<dd className="mt-1 text-[13px] leading-relaxed text-[var(--pon-fg-3)]">
										{item.a}
									</dd>
								</div>
							))}
						</dl>
					</Section>

					<p className="border-t border-[var(--pon-line)] pt-6 text-[12px] leading-relaxed text-[var(--pon-fg-4)]">
						Not investment advice. A basis position is delta-neutral, not risk-free.
					</p>
				</div>
			</div>
		</div>
	);
}
