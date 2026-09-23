import { useMiniApp } from "@app/components/providers/MiniAppProvider";
import { formatPercent, formatUsdCompact, useProtocolStats, useVaults } from "@lemon/client";
import { Button, cn, RiskBadge, Skeleton } from "@lemon/ui";
import { Ban, Eye, Landmark, Radio, ShieldCheck, Timer, Wallet } from "lucide-react";
import { useEffect } from "react";
import type { MetaFunction } from "react-router";
import { Link, useNavigate } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Lemon — earn from stocks and crypto without picking a side" },
	{
		name: "description",
		content:
			"Deposit USDC. Each vault owns a real asset on Base and hedges it one-for-one, so your return comes from what these markets pay to be held — not from guessing where the price goes. An agent runs it, and publishes every trade.",
	},
	{ property: "og:title", content: "Lemon — earn from stocks and crypto, no side taken" },
	{
		property: "og:description",
		content:
			"Own the asset, hedge it one-for-one, collect what the market pays. No bet up, no bet against — and every move on a public ledger.",
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
 * It is set as a broadsheet. Sections are bands divided by full-width rules
 * rather than cards floating on a background, headings are set large in the
 * serif, and every figure and label is monospaced. Nothing is boxed that a
 * rule could separate instead.
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
		<div>
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

/** A band: a section closed by a full-width rule, with the page's rhythm. */
function Band({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<section className={cn("border-b border-[var(--pon-line)] py-12 md:py-20", className)}>
			{children}
		</section>
	);
}

/** The masthead for a band — mono caps kicker, serif heading, serif standfirst. */
function BandHeading({
	kicker,
	title,
	description,
	className,
}: {
	kicker: string;
	title: React.ReactNode;
	description?: string;
	className?: string;
}) {
	return (
		<div className={cn("max-w-3xl", className)}>
			<p className="firm-label text-[var(--pon-fg-2)]">{kicker}</p>
			<h2 className="t-h2 mt-3 text-[var(--pon-fg-0)]">{title}</h2>
			{description && (
				<p className="t-body mt-4 max-w-[62ch] text-[var(--pon-fg-2)]">{description}</p>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------

function Hero({ stats }: { stats: ReturnType<typeof useProtocolStats>["data"] }) {
	return (
		<section>
			{/* The masthead. Set as large as the viewport will carry it, the way a
			    front page sets its own name — this is the only thing on the page
			    that is allowed to be this size. */}
			<div className="border-b border-[var(--pon-line)] pt-6 pb-10 md:pt-16 md:pb-14">
				<p className="firm-label text-[var(--pon-fg-2)]">Fully hedged · Base · USDC</p>
				<h1 className="t-display mt-5 text-[var(--pon-fg-0)]">
					Lemon
					<br />
					Markets
				</h1>
			</div>

			{/* The standfirst band: the claim on the left, the way in on the right. */}
			<div className="grid gap-7 border-b border-[var(--pon-line)] py-8 md:grid-cols-[1fr_auto] md:items-center md:gap-12 md:py-10">
				<p className="t-body-lg max-w-[46ch] text-[var(--pon-fg-0)]">
					Earn from stocks and crypto{" "}
					<em className="not-italic underline decoration-[2px] underline-offset-[5px]">
						without betting either way
					</em>
					.
				</p>
				<div className="flex flex-col gap-2.5 sm:flex-row md:shrink-0">
					<Button asChild size="lg" className="w-full sm:w-auto">
						<Link to="/vaults">Browse vaults →</Link>
					</Button>
					<Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
						<Link to="/activity">
							<Radio className="size-4" />
							Watch the agents
						</Link>
					</Button>
				</div>
			</div>

			{/* The argument, in prose, set in the serif. */}
			<div className="border-b border-[var(--pon-line)] py-8 md:py-12">
				<p className="t-body max-w-[70ch] text-[var(--pon-fg-2)]">
					Each vault buys a real asset — NVDA on Base, or BTC — and hedges the same size against it,
					so its value stops following the price. You are not long and you are not short. What is
					left is the fee traders pay each other to keep their positions open, and the hedged side
					is the side that collects it. You deposit USDC, hold a share token, and an agent runs it
					in public. The trade is honest: no drawdown, and no upside either.
				</p>
			</div>

			{/*
			  Live, not illustrative. Four cells divided by rules rather than by
			  gaps — two rows of two on a phone, where four across would give each
			  figure about 80px.
			*/}
			<dl className="firm-grid grid-cols-2 border-b border-[var(--pon-line)] md:grid-cols-4">
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
		<div className="bg-[var(--pon-bg)] px-4 py-5 md:px-6 md:py-7">
			<dt className="firm-label text-[var(--pon-fg-3)]">{label}</dt>
			<dd className="font-display mt-2 text-[30px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-[var(--pon-fg-0)] md:text-[40px]">
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
		title: "An agent owns and hedges it",
		body: "It buys the asset on Base and hedges the same size against it, so the two cancel out and the vault stops caring where the price goes. It collects the funding that pays, and re-hedges as the sizes drift.",
	},
	{
		icon: Timer,
		title: "You withdraw when you like",
		body: "Requests queue for 3 to 7 days while the agent unwinds your share of a real position. Your shares keep earning until it does, and the exit price is fixed at fulfilment.",
	},
];

function HowItWorks() {
	return (
		<Band>
			<BandHeading
				kicker="How it works"
				title="Three steps, two of which are not yours"
				description="Nothing here asks you to have a view. You put USDC in; the vault takes both sides of the same trade so no side is being taken at all."
			/>
			<ol className="firm-grid mt-9 border-y border-[var(--pon-line)] md:grid-cols-3">
				{STEPS.map((step, i) => {
					const Icon = step.icon;
					return (
						<li key={step.title} className="bg-[var(--pon-bg)] px-4 py-6 md:px-6 md:py-8">
							<div className="flex items-center gap-3">
								<span className="font-display text-[34px] font-extrabold leading-none tracking-[-0.05em] text-[var(--pon-fg-0)]">
									0{i + 1}
								</span>
								<Icon className="size-[18px] text-[var(--pon-fg-2)]" aria-hidden />
							</div>
							<h3 className="t-h3 mt-4 text-[var(--pon-fg-0)]">{step.title}</h3>
							<p className="t-body mt-2.5 text-[var(--pon-fg-2)]">{step.body}</p>
						</li>
					);
				})}
			</ol>
		</Band>
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
		<Band>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<BandHeading
					kicker="Open now"
					title="What the vaults have actually paid"
					description="The percentage is this vault's own share price over the last seven days, annualised — measured, not projected from today's funding rate. Every vault also carries a projection for what it would pay if funding held, which is the figure to look at where there is no history yet."
				/>
				<Link
					to="/vaults"
					className="firm-label shrink-0 border-b border-[var(--pon-ink)] pb-0.5 text-[var(--pon-fg-0)]"
				>
					All vaults →
				</Link>
			</div>

			<div className="firm-grid mt-9 border-y border-[var(--pon-line)] md:grid-cols-3">
				{isLoading
					? [0, 1, 2].map((i) => (
							<div key={i} className="bg-[var(--pon-bg)] px-4 py-6 md:px-6 md:py-8">
								<Skeleton className="h-[120px] w-full" />
							</div>
						))
					: vaults.map((vault) => (
							<Link
								key={vault.address}
								to={`/vaults/${vault.address}`}
								className="group bg-[var(--pon-bg)] px-4 py-6 transition-colors hover:bg-[var(--pon-lime-dim)] md:px-6 md:py-8"
							>
								<div className="flex items-center gap-2">
									<span className="truncate font-mono text-[13px] font-bold tracking-[-0.02em] text-[var(--pon-fg-0)]">
										{vault.ticker ?? vault.symbol}
									</span>
									<RiskBadge tier={vault.tier} leverageLabel={vault.leverageLabel} size="sm" />
								</div>
								<p className="mt-1 truncate t-caption text-[var(--pon-fg-3)]">
									{vault.assetClassLabel}
								</p>

								<p
									className={cn(
										"font-display mt-6 text-[40px] font-extrabold leading-none tracking-[-0.045em] tabular-nums",
										(vault.apy7d?.apy ?? 0) >= 0
											? "text-[var(--pon-up)]"
											: "text-[var(--pon-down)]",
									)}
								>
									{(vault.apy7d?.apy ?? 0) >= 0 ? "▲" : "▼"}
									{formatPercent(vault.apy7d?.apy ?? null)}
								</p>
								<p className="firm-label mt-2 text-[var(--pon-fg-3)]">7d realised</p>

								<p className="mt-5 border-t border-[var(--pon-line)] pt-3 t-caption text-[var(--pon-fg-3)]">
									{formatUsdCompact(vault.totalAssets)} deposited · {vault.depositorCount} depositor
									{vault.depositorCount === 1 ? "" : "s"}
								</p>
							</Link>
						))}
			</div>
		</Band>
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
		<Band>
			<BandHeading
				kicker="The trust boundary"
				title="What stops the agent taking the money"
				description="It is custodial — a contract holds your USDC and an agent trades it. The design does not pretend otherwise. It bounds what a compromised key can do, and makes the rest observable."
			/>

			<div className="firm-grid mt-9 border-y border-[var(--pon-line)] md:grid-cols-2">
				{GUARANTEES.map((g) => {
					const Icon = g.icon;
					return (
						<div key={g.title} className="bg-[var(--pon-bg)] px-4 py-6 md:px-6 md:py-8">
							<Icon className="size-5 text-[var(--pon-fg-0)]" aria-hidden />
							<h3 className="t-h3 mt-4 text-[var(--pon-fg-0)]">{g.title}</h3>
							<p className="t-body mt-2.5 text-[var(--pon-fg-2)]">{g.body}</p>
						</div>
					);
				})}
			</div>
		</Band>
	);
}

// ---------------------------------------------------------------------------

function Risks() {
	return (
		<Band>
			{/* The cream tint — the one fill the field carries, spent here because
			    this is the section a landing page usually leaves out. */}
			<div className="firm-cream p-5 md:p-9">
				<p className="firm-label text-[var(--pon-fg-2)]">Read this part</p>
				<h2 className="t-h2 mt-3 text-[var(--pon-fg-0)]">
					Taking no side is not the same as no risk
				</h2>
				<p className="t-body mt-4 max-w-[66ch] text-[var(--pon-fg-2)]">
					The hedge removes the price risk and only the price risk. Everything below is still yours.
				</p>
				<ul className="mt-6 grid gap-x-10 border-t border-[var(--pon-line)] md:grid-cols-2">
					{[
						"Funding can turn negative, in which case the position pays rather than earns.",
						"The asset can become illiquid to sell, and a vault whose pool has dried up cannot be exited at the marked price.",
						"A leveraged vault's hedge carries a liquidation price. The conservative tier does not.",
						"The vault is custodial. Your USDC is held by a contract and traded by an agent.",
					].map((line) => (
						<li
							key={line}
							className="flex gap-3 border-b border-[var(--pon-line)] py-3 t-body text-[var(--pon-fg-2)]"
						>
							<span className="mt-[9px] size-1.5 shrink-0 bg-[var(--pon-ink)]" aria-hidden />
							{line}
						</li>
					))}
				</ul>
				<p className="mt-5 t-caption text-[var(--pon-fg-3)]">
					Not investment advice. The contracts have not been independently audited.{" "}
					<Link to="/docs" className="text-[var(--pon-fg-0)] underline underline-offset-[3px]">
						Read the docs
					</Link>{" "}
					before depositing.
				</p>
			</div>
		</Band>
	);
}

// ---------------------------------------------------------------------------

function ClosingCta() {
	return (
		<section className="py-12 md:py-20">
			{/* The ink inversion — the page's last word, and the only block on it
			    that stops the field entirely. */}
			<div className="firm-ink rounded-[var(--pon-r-lg)] border border-[var(--pon-ink)] px-6 py-10 text-center md:px-12 md:py-16">
				<h2 className="t-h1 text-[var(--pon-fg-0)]">Put your USDC to work. Pick no side.</h2>
				<p className="t-body mx-auto mt-4 max-w-[52ch] text-[var(--pon-fg-2)]">
					Choose a market, and how hard you want that capital working. The agent does the rest, in
					public.
				</p>
				<div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row">
					<Button asChild size="lg" className="w-full sm:w-auto">
						<Link to="/vaults">Browse vaults →</Link>
					</Button>
					<Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
						<Link to="/docs">Read the docs</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}
