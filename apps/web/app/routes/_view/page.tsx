import { useMiniApp } from "@app/components/providers/MiniAppProvider";
import { formatPercent, formatUsdCompact, useProtocolStats, useVaults } from "@lemon/client";
import { Button, cn, RiskBadge, Skeleton } from "@lemon/ui";
import {
	ArrowRight,
	Ban,
	ChevronRight,
	Eye,
	Landmark,
	Radio,
	ShieldCheck,
	Timer,
	Wallet,
} from "lucide-react";
import { useEffect } from "react";
import type { MetaFunction } from "react-router";
import { Link, useNavigate } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Lemon — delta-neutral basis vaults on Base" },
	{
		name: "description",
		content:
			"Deposit USDC into a delta-neutral basis vault on Base. An agent runs the spot-and-perp position, the contract bounds what it can do with your capital, and every trade it makes is published for anyone to check.",
	},
	{ property: "og:title", content: "Lemon — basis vaults on Base" },
	{
		property: "og:description",
		content:
			"One vault, one market, one agent. Long the spot token, short the matching perp, collect the funding — with every move on a public ledger.",
	},
];

/**
 * The front door.
 *
 * This page exists for the visitor who has not decided yet, which is a
 * different job from the board at `/vaults` — that one assumes you already
 * want a vault and are choosing between them. So the ordering here is the
 * order of the questions someone actually asks: what is it, does it work,
 * what stops the agent running off with the money, and what can go wrong.
 *
 * The numbers are live rather than illustrative. A landing page quoting a
 * yield the protocol is not currently paying is the one thing that would make
 * everything else on it untrustworthy, so every figure below is read from the
 * same indexer the board reads and shows a dash when it is not knowable.
 */
export default function LandingPage() {
	const navigate = useNavigate();
	const { isMiniApp, isLoading: miniAppLoading } = useMiniApp();
	const { data: stats } = useProtocolStats();
	const { data, isLoading } = useVaults();

	/**
	 * Inside a Farcaster mini app the front door is the wrong destination.
	 * Someone who opened this from a cast has already decided to look at the
	 * thing; a marketing page is a wall between them and it. Replace rather
	 * than push, so the client's back gesture leaves the app instead of
	 * bouncing between the landing page and the board.
	 */
	useEffect(() => {
		if (!miniAppLoading && isMiniApp) navigate("/vaults", { replace: true });
	}, [isMiniApp, miniAppLoading, navigate]);

	// Ranked by measured yield, and only vaults that have one. A vault too new
	// to have a track record belongs on the board, not in a shop window.
	const featured = (data?.vaults ?? [])
		.filter((v) => v.apy7d?.apy != null)
		.sort((a, b) => (b.apy7d?.apy ?? 0) - (a.apy7d?.apy ?? 0))
		.slice(0, 3);

	return (
		<div className="space-y-14 md:space-y-24">
			<Hero stats={stats} />
			<HowItWorks />
			<FeaturedVaults vaults={featured} isLoading={isLoading} />
			<TrustBoundary />
			<Risks />
			<ClosingCta />
		</div>
	);
}

// ---------------------------------------------------------------------------

function Hero({ stats }: { stats: ReturnType<typeof useProtocolStats>["data"] }) {
	return (
		<section className="pt-4 md:pt-10">
			<span className="inline-flex items-center gap-2 rounded-full border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] px-3 py-1.5 text-[11px] font-medium tracking-wide text-[var(--pon-fg-2)] uppercase">
				<span className="size-1.5 rounded-full bg-[var(--pon-lime)]" aria-hidden />
				Delta neutral · Base · USDC
			</span>

			{/*
			  clamp() rather than responsive type steps: the headline is the one
			  place a phone between the breakpoints reads as broken, and three
			  fixed sizes leave a 430px viewport with the 640px setting.
			*/}
			<h1
				className="mt-5 font-semibold tracking-[-0.03em] text-[var(--pon-fg-0)]"
				style={{ fontSize: "clamp(2.25rem, 7vw, 4.5rem)", lineHeight: 1.02 }}
			>
				Earn the funding rate,
				<br />
				<span className="text-[var(--pon-lime)]">not the price move.</span>
			</h1>

			<p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--pon-fg-2)] md:text-lg">
				A basis vault holds the spot token and shorts the matching perp at the same size. The two
				legs cancel, so the position does not care which way the market goes — what it collects is
				the funding longs pay shorts. You deposit USDC and hold a share token. An agent runs the
				trade, and publishes every move it makes.
			</p>

			<div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
				<Button asChild size="lg" className="w-full sm:w-auto">
					<Link to="/vaults">
						Browse vaults
						<ArrowRight className="size-4" />
					</Link>
				</Button>
				<Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
					<Link to="/activity">
						<Radio className="size-4" />
						Watch the agents live
					</Link>
				</Button>
			</div>

			{/*
			  Live, not illustrative. Four across on a phone would give each
			  figure about 80px, so two rows of two — and the labels stay short
			  enough not to wrap at that width.
			*/}
			<dl className="mt-10 grid grid-cols-2 gap-3 md:mt-14 md:grid-cols-4">
				<HeroStat label="Total deposits" value={formatUsdCompact(stats?.tvl ?? "0")} />
				<HeroStat label="Deployed" value={formatUsdCompact(stats?.deployed ?? "0")} />
				<HeroStat label="Vaults" value={String(stats?.vaultCount ?? 0)} />
				<HeroStat label="Depositors" value={String(stats?.depositors ?? 0)} />
			</dl>
		</section>
	);
}

function HeroStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-4 md:p-5">
			<dt className="text-[11px] font-medium tracking-wide text-[var(--pon-fg-3)] uppercase">
				{label}
			</dt>
			<dd className="mt-2 font-fono text-[22px] font-semibold leading-none tracking-[-0.02em] text-[var(--pon-fg-0)] md:text-[30px]">
				{value}
			</dd>
		</div>
	);
}

// ---------------------------------------------------------------------------

const STEPS = [
	{
		icon: Wallet,
		title: "You deposit USDC",
		body: "Share tokens are minted immediately at the vault's current price. That is the entire interaction — there is no ticket to fill in and no leg to manage.",
	},
	{
		icon: Landmark,
		title: "An agent runs the trade",
		body: "It buys the spot token on Base, bridges margin, shorts the matching perp at the same size, and collects funding. It rebalances when the two legs drift apart.",
	},
	{
		icon: Timer,
		title: "You withdraw when you like",
		body: "Requests queue for 3 to 7 days while the agent unwinds your share of a real position. Your shares keep earning until it does, and the exit price is fixed at fulfilment.",
	},
];

function HowItWorks() {
	return (
		<section>
			<SectionHeading eyebrow="How it works" title="Three steps, two of which are not yours" />
			<ol className="mt-7 grid gap-3 md:grid-cols-3 md:gap-4">
				{STEPS.map((step, i) => {
					const Icon = step.icon;
					return (
						<li
							key={step.title}
							className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5 md:p-6"
						>
							<div className="flex items-center gap-3">
								<span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--pon-lime-dim)] text-[var(--pon-lime)]">
									<Icon className="size-[18px]" aria-hidden />
								</span>
								<span className="font-fono text-[13px] text-[var(--pon-fg-4)]">0{i + 1}</span>
							</div>
							<h3 className="mt-4 font-medium text-[var(--pon-fg-0)]">{step.title}</h3>
							<p className="mt-2 text-sm leading-relaxed text-[var(--pon-fg-2)]">{step.body}</p>
						</li>
					);
				})}
			</ol>
		</section>
	);
}

// ---------------------------------------------------------------------------

function FeaturedVaults({
	vaults,
	isLoading,
}: {
	vaults: NonNullable<ReturnType<typeof useVaults>["data"]>["vaults"];
	isLoading: boolean;
}) {
	// Nothing to show is not an error here. A deployment with no measured
	// vaults yet should skip the section rather than render an empty shelf.
	if (!isLoading && vaults.length === 0) return null;

	return (
		<section>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<SectionHeading
					eyebrow="Open now"
					title="What the vaults have actually done"
					description="The percentage is this vault's own share price over the last seven days, annualised — measured, not projected from today's funding rate."
				/>
				<Link
					to="/vaults"
					className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--pon-lime)] hover:underline"
				>
					All vaults
					<ChevronRight className="size-4" />
				</Link>
			</div>

			<div className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
				{isLoading
					? [0, 1, 2].map((i) => (
							<Skeleton key={i} className="h-[152px] w-full rounded-[var(--pon-r-lg,16px)]" />
						))
					: vaults.map((vault) => (
							<Link
								key={vault.address}
								to={`/vaults/${vault.address}`}
								className="group rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5 transition-colors hover:border-[var(--pon-line-2)] hover:bg-[var(--pon-surface)] focus-visible:border-[var(--pon-lime)] focus-visible:outline-none md:p-6"
							>
								<div className="flex items-center gap-2">
									<span className="truncate font-medium text-[var(--pon-fg-0)]">
										{vault.ticker ?? vault.symbol}
									</span>
									<RiskBadge tier={vault.tier} leverageLabel={vault.leverageLabel} size="sm" />
								</div>
								<p className="mt-1 truncate text-xs text-[var(--pon-fg-3)]">
									{vault.assetClassLabel}
								</p>

								<p
									className={cn(
										"mt-5 font-fono text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
										(vault.apy7d?.apy ?? 0) >= 0
											? "text-[var(--pon-up)]"
											: "text-[var(--pon-down)]",
									)}
								>
									{formatPercent(vault.apy7d?.apy ?? null)}
								</p>
								<p className="mt-1.5 text-[11px] font-medium tracking-wide text-[var(--pon-fg-3)] uppercase">
									7d realised
								</p>

								<p className="mt-4 border-t border-[var(--pon-line)] pt-3 text-xs text-[var(--pon-fg-3)]">
									{formatUsdCompact(vault.totalAssets)} deposited · {vault.depositorCount} depositor
									{vault.depositorCount === 1 ? "" : "s"}
								</p>
							</Link>
						))}
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------

const GUARANTEES = [
	{
		icon: Ban,
		title: "The agent cannot name a recipient",
		body: "Its withdrawal address is fixed in the vault's constructor and can never be changed. agentWithdraw takes an amount and nothing else — there is no argument for where the money goes.",
	},
	{
		icon: ShieldCheck,
		title: "Capital leaves slowly, and never entirely",
		body: "A ceiling on how much may be deployed keeps a buffer here for the withdrawal queue, and a per-window cap limits how fast the rest can move. Both are enforced by the contract, not by policy.",
	},
	{
		icon: Eye,
		title: "A valuation is a bounded claim",
		body: "The position is genuinely off-chain, so its value genuinely has to be reported. Each report is capped, and so is the total across an epoch — so a drip of small reports cannot do slowly what one call may not do at once.",
	},
	{
		icon: Radio,
		title: "Every action is published",
		body: "Spot fills, perp opens, bridges, funding settlement — each recorded on Base with the venue's own transaction reference, so anyone can fetch it from the chain it names and check it.",
	},
];

function TrustBoundary() {
	return (
		<section>
			<SectionHeading
				eyebrow="The trust boundary"
				title="What stops the agent taking the money"
				description="It is custodial — a contract holds your USDC and an agent trades it. The design does not pretend otherwise. It bounds what a compromised key can do, and makes the rest observable."
			/>

			<div className="mt-7 grid gap-3 md:grid-cols-2 md:gap-4">
				{GUARANTEES.map((g) => {
					const Icon = g.icon;
					return (
						<div
							key={g.title}
							className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5 md:p-6"
						>
							<Icon className="size-5 text-[var(--pon-lime)]" aria-hidden />
							<h3 className="mt-3.5 font-medium text-[var(--pon-fg-0)]">{g.title}</h3>
							<p className="mt-2 text-sm leading-relaxed text-[var(--pon-fg-2)]">{g.body}</p>
						</div>
					);
				})}
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------

function Risks() {
	return (
		<section className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5 md:p-8">
			<h2 className="font-medium text-[var(--pon-fg-0)]">Delta-neutral is not risk-free</h2>
			<p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--pon-fg-2)]">
				Cancelling the price exposure removes one risk. It does not remove the others, and this is
				the part a landing page usually leaves out.
			</p>
			<ul className="mt-5 grid gap-x-8 gap-y-3 text-sm leading-relaxed text-[var(--pon-fg-2)] md:grid-cols-2">
				{[
					"Funding can turn negative, in which case the position pays rather than earns.",
					"The spot leg can become illiquid, and a vault whose pool has dried up cannot be exited at the marked price.",
					"A leveraged vault's short carries a liquidation price. The conservative tier does not.",
					"The vault is custodial. Your USDC is held by a contract and traded by an agent.",
				].map((line) => (
					<li key={line} className="flex gap-2.5">
						<span
							className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--pon-fg-4)]"
							aria-hidden
						/>
						{line}
					</li>
				))}
			</ul>
			<p className="mt-5 text-xs leading-relaxed text-[var(--pon-fg-4)]">
				Not investment advice. The contracts have not been independently audited.{" "}
				<Link to="/docs" className="text-[var(--pon-lime)] hover:underline">
					Read the docs
				</Link>{" "}
				before depositing.
			</p>
		</section>
	);
}

// ---------------------------------------------------------------------------

function ClosingCta() {
	return (
		<section className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-6 text-center md:p-12">
			<h2
				className="font-semibold tracking-[-0.02em] text-[var(--pon-fg-0)]"
				style={{ fontSize: "clamp(1.5rem, 4vw, 2.5rem)", lineHeight: 1.1 }}
			>
				Deposit USDC. That is the whole interaction.
			</h2>
			<p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--pon-fg-2)] md:text-base">
				Pick a market and a risk tier. The agent does the rest, in public.
			</p>
			<div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
				<Button asChild size="lg" className="w-full sm:w-auto">
					<Link to="/vaults">
						Browse vaults
						<ArrowRight className="size-4" />
					</Link>
				</Button>
				<Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
					<Link to="/docs">Read the docs</Link>
				</Button>
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------

function SectionHeading({
	eyebrow,
	title,
	description,
}: {
	eyebrow: string;
	title: string;
	description?: string;
}) {
	return (
		<div className="max-w-2xl">
			<p className="text-[11px] font-medium tracking-wide text-[var(--pon-lime)] uppercase">
				{eyebrow}
			</p>
			<h2
				className="mt-2 font-semibold tracking-[-0.02em] text-[var(--pon-fg-0)]"
				style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)", lineHeight: 1.12 }}
			>
				{title}
			</h2>
			{description && (
				<p className="mt-3 text-sm leading-relaxed text-[var(--pon-fg-2)] md:text-[15px]">
					{description}
				</p>
			)}
		</div>
	);
}
