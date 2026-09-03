import { Brand } from "@app/components/pons/Brand";
import { AreaChart } from "@app/components/pons/Charts";
import { Segmented } from "@app/components/pons/Segmented";
import { Spotlight } from "@app/components/pons/Spotlight";
import { StatCard } from "@app/components/pons/StatCard";
import { WindowFrame } from "@app/components/pons/WindowFrame";
import { Footer } from "@app/components/site/Footer";
import { LiquidCursor } from "@app/components/site/LiquidCursor";
import { MarketTicker } from "@app/components/site/MarketTicker";
import {
	CountUp,
	Magnetic,
	Marquee,
	Parallax,
	Reveal,
	ScrollProgress,
	SmoothScroll,
	WordReveal,
} from "@app/components/site/motion";
import { SiteHeader } from "@app/components/site/SiteHeader";
import { Badge, LiveDot } from "@app/components/ui/badge";
import { useCarryCandidates, useMarkets, useSpotTokens } from "@app/hooks/useMarketData";
import { cn } from "@app/lib/utils";
import { formatUsd } from "@lemon/core";
import { ArrowRight, ArrowUpRight, Coins, Layers, Scale, TrendingUp } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, type MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
	{ title: "Lemon Markets — Trade anything on Base" },
	{
		name: "description",
		content:
			"Trade crypto, tokenized stocks, FX and commodities on Base: leveraged perps, spot, baskets and delta-neutral cash-and-carry.",
	},
	{ name: "base:app_id", content: "6a98188bcfa2c998e36b5aea" },
	{ property: "og:title", content: "Lemon Markets" },
	{
		property: "og:description",
		content: "Crypto, stocks, FX and commodities on Base — perps, spot, baskets and carry.",
	},
];

/* -------------------------------------------------------------------------- */
/*  Section scaffolding                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Pons numbers its sections. A tabular ordinal sits beside the heading in the
 * quietest ink, so the page reads as a document with parts rather than as a
 * stack of unrelated blocks.
 */
function SectionHead({
	index,
	title,
	description,
	action,
}: {
	index: string;
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
			<div className="max-w-2xl">
				<div className="flex items-baseline gap-3.5">
					<span className="font-fono text-[13px] text-[var(--pon-fg-3)]">{index}</span>
					<h2 className="t-h2 font-bold text-[var(--pon-fg-0)]">
						<WordReveal text={title} />
					</h2>
				</div>
				{description && (
					<Reveal delay={0.12}>
						<p className="mt-3 text-[15px] leading-relaxed text-[var(--pon-fg-3)]">{description}</p>
					</Reveal>
				)}
			</div>
			{action && <Reveal delay={0.16}>{action}</Reveal>}
		</div>
	);
}

function Section({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<section
			className={cn(
				"mx-auto w-full max-w-[var(--content-max)] px-5 py-16 sm:px-8 md:py-24",
				className,
			)}
		>
			{children}
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

function Atmosphere() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
			<div className="grid-floor absolute inset-0" />
			<div
				className="aurora left-[-12%] top-[-22%] h-[620px] w-[620px]"
				style={{ ["--aurora" as string]: "rgba(163,230,53,0.20)", animationDelay: "0s" }}
			/>
			<div
				className="aurora right-[-10%] top-[-12%] h-[540px] w-[540px]"
				style={{ ["--aurora" as string]: "rgba(16,185,129,0.14)", animationDelay: "-9s" }}
			/>
			<div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--pon-bg)] to-transparent" />
		</div>
	);
}

function Hero() {
	const { data: markets } = useMarkets();
	const { data: spot } = useSpotTokens();
	const { data: carry } = useCarryCandidates();

	const all = markets?.markets ?? [];
	const buyable = spot?.tokens.filter((token) => token.buyable).length ?? 0;
	const carryCount = carry?.candidates.length ?? 0;

	const stats = [
		{ value: all.length, label: "Markets live", suffix: "" },
		{
			value: all.filter((m) => m.assetClass === "equity").length,
			label: "Tokenized stocks",
			suffix: "",
		},
		{
			value: all.reduce((top, m) => Math.max(top, m.maxLeverage), 0),
			label: "Max leverage",
			suffix: "x",
		},
		{ value: buyable + carryCount, label: "Spot & carry pairs", suffix: "" },
	];

	return (
		<section className="relative flex min-h-[100svh] flex-col overflow-hidden">
			<Atmosphere />
			<SiteHeader />

			<div className="relative z-10 mx-auto flex w-full max-w-[var(--content-max)] flex-1 flex-col justify-center px-5 py-10 sm:px-8 md:py-14">
				{/*
				  Pons opens on a framed panel rather than bare text: a hairline over a
				  vertical gradient at the largest corner radius, with the accent bloom
				  in the upper right. It gives the fold an edge, which is what lets the
				  atmosphere behind it read as depth rather than as fog.
				*/}
				<Reveal trigger="mount">
					<header className="relative overflow-hidden rounded-[var(--pon-r-2xl)] border border-[var(--pon-line)] bg-gradient-to-b from-[var(--pon-bg-2)] to-[var(--pon-bg)] px-6 py-11 sm:px-11 sm:py-13">
						<div aria-hidden className="pon-bloom-lg" />

						<div className="relative">
							<div className="mb-5 flex flex-wrap items-center gap-3">
								<span className="t-eyebrow text-[var(--pon-lime)]">Trade anything on Base</span>
								<LiveDot label="Live on Base mainnet" />
							</div>

							<h1 className="font-display max-w-[16ch] text-[clamp(40px,7vw,74px)] font-bold leading-[1] tracking-[-0.02em] text-[var(--pon-fg-0)]">
								<WordReveal text="Global markets," trigger="mount" />
								<br />
								<span className="text-[var(--pon-lime)]">
									<WordReveal text="settled on Base." delay={0.18} trigger="mount" />
								</span>
							</h1>

							<Reveal delay={0.35} trigger="mount">
								<p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-[var(--pon-fg-2)]">
									Crypto, tokenized stocks, forex and commodities — leveraged perps, spot, baskets
									and delta-neutral carry. All in USDC, all from your own wallet.
								</p>
							</Reveal>

							<Reveal delay={0.45} trigger="mount">
								<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
									<Magnetic>
										<Link
											to="/trade"
											className="group flex w-full items-center justify-center gap-2 rounded-full bg-[var(--pon-lime)] px-7 py-3.5 text-[15px] font-semibold text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)] sm:w-auto"
										>
											Start trading
											<ArrowRight
												size={17}
												aria-hidden
												className="transition-transform group-hover:translate-x-0.5"
											/>
										</Link>
									</Magnetic>
									<Magnetic strength={0.18}>
										<Link
											to="/docs"
											className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--pon-line-2)] px-7 py-3.5 text-[15px] font-medium text-[var(--pon-fg)] transition-colors hover:border-[var(--pon-fg-3)] sm:w-auto"
										>
											How it works
										</Link>
									</Magnetic>
								</div>
							</Reveal>
						</div>
					</header>
				</Reveal>

				{/* Four live figures as Pons stat cards. */}
				<Reveal delay={0.55} trigger="mount">
					<dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
						{stats.map((stat) => (
							<StatCard
								key={stat.label}
								label={<dt>{stat.label}</dt>}
								value={
									<dd>
										{stat.value > 0 ? (
											<>
												<CountUp value={stat.value} />
												{stat.suffix}
											</>
										) : (
											"—"
										)}
									</dd>
								}
							/>
						))}
					</dl>
				</Reveal>
			</div>

			{/* Live tape pinned to the base of the fold. */}
			<div className="relative z-10 border-t border-[var(--pon-line)]">
				<MarketTicker className="h-14" />
			</div>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*  Integration rail                                                          */
/* -------------------------------------------------------------------------- */

const RAIL = [
	"Pacifica · Perpetuals",
	"KyberSwap · Spot routing",
	"Relay · Cross-chain deposits",
	"Base · Settlement",
	"Pyth · Oracle prices",
	"USDC · Collateral",
];

function Rail() {
	return (
		<section className="border-y border-[var(--pon-line)] py-6">
			<Marquee speed={45}>
				{RAIL.map((item) => (
					<span
						key={item}
						className="flex shrink-0 items-center gap-3 whitespace-nowrap px-8 text-[13px] text-[var(--pon-fg-3)]"
					>
						<span className="size-1 rounded-full bg-[var(--pon-lime)]/60" aria-hidden />
						{item}
					</span>
				))}
			</Marquee>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*  Products                                                                  */
/* -------------------------------------------------------------------------- */

function Tile({
	children,
	className,
	to,
}: {
	children: ReactNode;
	className?: string;
	to?: string;
}) {
	const body = (
		<div
			className={cn(
				"group relative h-full overflow-hidden rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6 transition-colors duration-300 hover:border-[var(--pon-lime)]/40 sm:p-7",
				className,
			)}
		>
			<span
				aria-hidden
				className="sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
			/>
			{children}
		</div>
	);

	return to ? (
		<Link to={to} className="block h-full">
			{body}
		</Link>
	) : (
		body
	);
}

function Products() {
	const { data } = useMarkets();
	const all = data?.markets ?? [];
	const count = (kind: string) => all.filter((market) => market.assetClass === kind).length;

	const classes = [
		{ label: "Crypto", count: count("crypto") },
		{ label: "Tokenized stocks", count: count("equity") },
		{ label: "Forex", count: count("fx") },
		{ label: "Metals & commodities", count: count("metal") + count("commodity") },
	];
	const topLeverage = all.reduce((top, market) => Math.max(top, market.maxLeverage), 0);

	return (
		<Section>
			<SectionHead
				index="01"
				title="One balance. Every market."
				description="No per-market subaccounts and no bridging between venues. Deposit USDC once and reach every instrument from the same collateral."
			/>

			<div className="mt-10 grid auto-rows-[minmax(180px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<Reveal className="sm:col-span-2 lg:row-span-2" delay={0}>
					<Tile to="/trade" className="flex flex-col justify-between">
						<div>
							<TrendingUp size={22} className="text-[var(--pon-lime)]" aria-hidden />
							<h3 className="font-display mt-5 text-2xl font-bold text-[var(--pon-fg-0)]">
								Perpetuals
							</h3>
							<p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--pon-fg-2)]">
								Long or short every market Pacifica lists — crypto, tokenized stocks, FX,
								commodities and metals. Orders are signed rather than gassed, so an unfilled order
								costs nothing.
							</p>
						</div>

						{/* The live class breakdown fills the tall tile with something true. */}
						<ul className="my-7 grid gap-2 sm:grid-cols-2">
							{classes.map((entry) => (
								<li
									key={entry.label}
									className="flex items-baseline justify-between gap-3 rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-3.5 py-2.5"
								>
									<span className="text-[12.5px] text-[var(--pon-fg-2)]">{entry.label}</span>
									<span className="font-fono text-sm font-semibold text-[var(--pon-fg)]">
										{entry.count > 0 ? entry.count : "—"}
									</span>
								</li>
							))}
						</ul>

						<div className="flex flex-wrap items-end justify-between gap-4">
							<div className="flex gap-7">
								<div>
									<p className="font-fono text-3xl font-semibold text-[var(--pon-fg)]">
										{topLeverage > 0 ? `${topLeverage}x` : "—"}
									</p>
									<p className="mt-1 t-caption text-[var(--pon-fg-3)]">Max leverage</p>
								</div>
								<div>
									<p className="font-fono text-3xl font-semibold text-[var(--pon-fg)]">0</p>
									<p className="mt-1 t-caption text-[var(--pon-fg-3)]">Gas to place</p>
								</div>
							</div>
							<span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--pon-lime)]">
								Trade perps <ArrowUpRight size={15} aria-hidden />
							</span>
						</div>
					</Tile>
				</Reveal>

				<Reveal delay={0.08}>
					<Tile to="/spot" className="flex flex-col justify-between">
						<div>
							<Coins size={20} className="text-[var(--pon-lime)]" aria-hidden />
							<h3 className="font-display mt-4 text-lg font-bold text-[var(--pon-fg-0)]">Spot</h3>
							<p className="mt-2 text-sm leading-relaxed text-[var(--pon-fg-2)]">
								Buy the real token on Base through the KyberSwap aggregator, with gasless limit
								orders.
							</p>
						</div>
						<span className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--pon-lime)]">
							Buy spot <ArrowUpRight size={15} aria-hidden />
						</span>
					</Tile>
				</Reveal>

				<Reveal delay={0.16}>
					<Tile to="/baskets" className="flex flex-col justify-between">
						<div>
							<Layers size={20} className="text-[var(--pon-lime)]" aria-hidden />
							<h3 className="font-display mt-4 text-lg font-bold text-[var(--pon-fg-0)]">
								Baskets
							</h3>
							<p className="mt-2 text-sm leading-relaxed text-[var(--pon-fg-2)]">
								Enter a themed set of correlated markets at one weight, tracked on a single index
								line.
							</p>
						</div>
						<span className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--pon-lime)]">
							Browse baskets <ArrowUpRight size={15} aria-hidden />
						</span>
					</Tile>
				</Reveal>

				<Reveal className="sm:col-span-2" delay={0.24}>
					<Tile to="/carry" className="flex h-full flex-col justify-between">
						<div>
							<Scale size={20} className="text-[var(--pon-lime)]" aria-hidden />
							<h3 className="font-display mt-4 text-lg font-bold text-[var(--pon-fg-0)]">
								Cash &amp; carry
							</h3>
							<p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--pon-fg-2)]">
								Hold the spot token, short the matching perp, and collect funding on a position with
								no directional exposure. The round-trip cost is priced before you commit.
							</p>
						</div>
						<span className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--pon-lime)]">
							Build a carry <ArrowUpRight size={15} aria-hidden />
						</span>
					</Tile>
				</Reveal>

				<Reveal delay={0.32}>
					<Tile className="flex flex-col justify-center">
						<p className="font-fono text-3xl font-semibold text-[var(--pon-lime)]">24/7</p>
						<p className="mt-2 text-sm leading-relaxed text-[var(--pon-fg-2)]">
							Crypto never closes. Equities and FX follow real market hours, shown on every market.
						</p>
					</Tile>
				</Reveal>
			</div>
		</Section>
	);
}

/* -------------------------------------------------------------------------- */
/*  How it works                                                              */
/* -------------------------------------------------------------------------- */

const STEPS = [
	{
		n: "01",
		title: "Connect your wallet",
		body: "No account, no email, no deposit into a custodian. Lemon reads your Base address and nothing else.",
	},
	{
		n: "02",
		title: "Fund with USDC",
		body: "Bring USDC on Base, or bridge from any chain through Relay in one transaction. Collateral stays in your wallet until an order fills.",
	},
	{
		n: "03",
		title: "Place the order",
		body: "Market, limit or TWAP. Perp orders are signed as EIP-712 intents and cost no gas until they execute.",
	},
	{
		n: "04",
		title: "Settle on Base",
		body: "Fills clear through Pacifica and KyberSwap. Every position, fee and funding payment is verifiable on-chain.",
	},
];

function HowItWorks() {
	return (
		<div className="border-y border-[var(--pon-line)] bg-[var(--pon-bg-2)]/40">
			<Section className="py-16 md:py-24">
				<div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
					{/* Sticky on desktop so the steps scroll past a fixed statement. */}
					<div className="lg:sticky lg:top-24 lg:self-start">
						<div className="flex items-baseline gap-3.5">
							<span className="font-fono text-[13px] text-[var(--pon-fg-3)]">02</span>
							<h2 className="t-h2 font-bold text-[var(--pon-fg-0)]">
								<WordReveal text="Wallet to fill, in four steps." />
							</h2>
						</div>
						<Reveal delay={0.15}>
							<p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--pon-fg-3)]">
								Lemon is a front end, not a venue. It composes protocols that already hold the
								liquidity — so there is no new bridge to trust and no new custodian.
							</p>
						</Reveal>
						<Reveal delay={0.25}>
							<Magnetic>
								<Link
									to="/trade"
									className="mt-7 inline-flex items-center gap-2 rounded-full bg-[var(--pon-lime)] px-6 py-3 text-sm font-semibold text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)]"
								>
									Open the terminal <ArrowRight size={16} aria-hidden />
								</Link>
							</Magnetic>
						</Reveal>
					</div>

					{/*
					  Pons runs a numbered sequence as hairline-separated rows inside one
					  card, not as four floating boxes — the shared frame is what makes it
					  read as an ordered process.
					*/}
					<ol className="overflow-hidden rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)]">
						{STEPS.map((step, index) => (
							<Reveal key={step.n} delay={index * 0.08}>
								<li className="group flex gap-4 border-b border-[var(--pon-line)] p-6 transition-colors last:border-b-0 hover:bg-[var(--pon-bg-2)] sm:gap-6">
									<span className="font-fono shrink-0 text-[13px] text-[var(--pon-fg-3)] transition-colors group-hover:text-[var(--pon-lime)]">
										{step.n}
									</span>
									<div className="min-w-0">
										<h3 className="text-[15px] font-semibold text-[var(--pon-fg)]">{step.title}</h3>
										<p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--pon-fg-3)]">
											{step.body}
										</p>
									</div>
								</li>
							</Reveal>
						))}
					</ol>
				</div>
			</Section>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Live markets                                                              */
/* -------------------------------------------------------------------------- */

const CLASS_FILTERS = ["All", "Crypto", "Stocks", "FX", "Metals"] as const;
type ClassFilter = (typeof CLASS_FILTERS)[number];

const FILTER_MATCH: Record<ClassFilter, (assetClass: string) => boolean> = {
	All: () => true,
	Crypto: (a) => a === "crypto",
	Stocks: (a) => a === "equity",
	FX: (a) => a === "fx",
	Metals: (a) => a === "metal" || a === "commodity",
};

function LiveMarkets() {
	const { data } = useMarkets();
	const [filter, setFilter] = useState<ClassFilter>("All");

	const listed = (data?.markets ?? [])
		.filter((market) => market.isListed)
		.sort((a, b) => b.openInterest - a.openInterest);

	const rows = listed.filter((market) => FILTER_MATCH[filter](market.assetClass)).slice(0, 8);
	const leader = listed[0];

	return (
		<Section>
			<SectionHead
				index="03"
				title="Deepest markets today."
				description="Ranked by open interest, refreshed from Pacifica."
				action={
					<Link
						to="/trade"
						className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-[var(--pon-lime)] transition-colors hover:text-[var(--pon-lime-2)]"
					>
						See all markets <ArrowUpRight size={15} aria-hidden />
					</Link>
				}
			/>

			{/* The deepest market gets the one spotlight the page is allowed. */}
			{leader && (
				<Reveal delay={0.1}>
					<Link to={`/trade/${leader.symbol.replace("/", "-")}`} className="mt-8 block">
						<Spotlight
							mark={
								leader.logoUrl ? (
									<img
										src={leader.logoUrl}
										alt=""
										width={40}
										height={40}
										className="size-10 object-contain"
										aria-hidden
									/>
								) : (
									<span className="text-lg font-bold text-[var(--pon-on-lime)]">
										{leader.base.slice(0, 2)}
									</span>
								)
							}
							title={leader.symbol}
							subtitle={leader.base}
							tag={<Badge>Deepest book</Badge>}
							value={formatUsd(leader.openInterest, { compact: true })}
							valueMeta={`${leader.maxLeverage}x max leverage`}
							tone="neutral"
						/>
					</Link>
				</Reveal>
			)}

			<Reveal delay={0.15}>
				<div className="mt-4">
					<Segmented
						options={CLASS_FILTERS}
						value={filter}
						onChange={setFilter}
						aria-label="Filter markets by asset class"
					/>
				</div>
			</Reveal>

			<Reveal delay={0.2}>
				<div className="mt-4 overflow-hidden rounded-[var(--pon-r-xl)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-6">
					{/* Header hides on phones; each row carries its own labels there. */}
					<div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-[var(--pon-line)] px-1 pb-2.5 text-[11px] uppercase tracking-[0.05em] text-[var(--pon-fg-3)] sm:grid">
						<span>Market</span>
						<span className="text-right">Open interest</span>
						<span className="text-right">Max leverage</span>
						<span className="text-right">Session</span>
					</div>

					{rows.length === 0 && (
						<p className="py-10 text-center text-[13px] text-[var(--pon-fg-3)]">
							{listed.length === 0 ? "Loading markets…" : "No markets in this class."}
						</p>
					)}

					{rows.map((market) => (
						<Link
							key={market.symbol}
							to={`/trade/${market.symbol.replace("/", "-")}`}
							className="grid grid-cols-2 items-center gap-3 border-b border-[var(--pon-line)] px-1 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--pon-bg-2)] sm:grid-cols-[2fr_1fr_1fr_1fr] sm:gap-4"
						>
							<span className="flex min-w-0 items-center gap-3">
								{market.logoUrl ? (
									<img
										src={market.logoUrl}
										alt=""
										width={28}
										height={28}
										className="size-7 shrink-0 rounded-full object-contain"
										aria-hidden
									/>
								) : (
									<span
										className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--pon-surface-2)] text-[10px] text-[var(--pon-fg-3)]"
										aria-hidden
									>
										{market.base.slice(0, 2)}
									</span>
								)}
								<span className="min-w-0">
									<span className="block truncate text-[13px] font-semibold text-[var(--pon-fg)]">
										{market.symbol}
									</span>
									<span className="block truncate t-micro text-[var(--pon-fg-3)]">
										{market.base}
									</span>
								</span>
							</span>

							<span className="font-fono text-right text-[13px] text-[var(--pon-fg)]">
								{formatUsd(market.openInterest, { compact: true })}
								<span className="block t-micro text-[var(--pon-fg-3)] sm:hidden">
									Open interest
								</span>
							</span>

							<span className="font-fono hidden text-right text-[13px] text-[var(--pon-fg-2)] sm:block">
								{market.maxLeverage}x
							</span>

							<span className="hidden justify-end sm:flex">
								<span
									className={cn(
										"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 t-micro",
										market.isOpen
											? "bg-[var(--pon-lime-dim)] text-[var(--pon-lime)]"
											: "bg-[var(--pon-surface-2)] text-[var(--pon-fg-3)]",
									)}
								>
									<span
										className={cn(
											"size-1 rounded-full",
											market.isOpen ? "bg-[var(--pon-lime)]" : "bg-[var(--pon-fg-3)]",
										)}
										aria-hidden
									/>
									{market.isOpen ? "Open" : "Closed"}
								</span>
							</span>
						</Link>
					))}
				</div>
			</Reveal>
		</Section>
	);
}

/* -------------------------------------------------------------------------- */
/*  Terminal preview                                                          */
/* -------------------------------------------------------------------------- */

/** A shape that reads as a price line without claiming to be one. */
const PREVIEW_SERIES = [
	18, 22, 20, 27, 31, 28, 34, 39, 36, 42, 47, 44, 51, 49, 56, 61, 58, 64, 70, 68, 75, 81, 78, 86,
];

function TerminalPreview() {
	return (
		<Section>
			<SectionHead
				index="04"
				title="A terminal, not a dashboard."
				description="Chart, order ticket and positions on one screen — the same layout on every market."
			/>

			<Reveal delay={0.15}>
				<div className="mt-9">
					<WindowFrame url="lemonmarkets.xyz / trade / BTC-USD">
						<div className="p-4">
							{/* Symbol bar. */}
							<div className="mb-3 flex flex-wrap items-center gap-6 rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] px-4 py-3">
								<div className="flex items-center gap-2.5">
									<span className="flex size-7 items-center justify-center rounded-full bg-[var(--pon-amber)] text-[13px]">
										₿
									</span>
									<span className="font-display text-[15px] font-bold text-[var(--pon-fg)]">
										BTC-USD
									</span>
									<Badge>Perp</Badge>
								</div>
								<div>
									<p className="font-fono text-base font-bold text-[var(--pon-up)]">66,146.8</p>
									<p className="t-micro text-[var(--pon-up)]">+0.49%</p>
								</div>
								<div className="hidden sm:block">
									<p className="t-micro text-[var(--pon-fg-3)]">24h volume</p>
									<p className="font-fono text-[12.5px] font-semibold text-[var(--pon-fg)]">
										579.3M
									</p>
								</div>
								<div className="hidden sm:block">
									<p className="t-micro text-[var(--pon-fg-3)]">Funding / 8h</p>
									<p className="font-fono text-[12.5px] font-semibold text-[var(--pon-fg)]">
										0.0013%
									</p>
								</div>
							</div>

							<div className="grid gap-3 lg:grid-cols-[1.7fr_0.8fr]">
								<div className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-4">
									<AreaChart data={PREVIEW_SERIES} height={190} />
								</div>

								{/* Order ticket. */}
								<div className="rounded-[var(--pon-r-md)] border border-[var(--pon-line)] bg-[var(--pon-surface)] p-3.5">
									<div className="mb-3 inline-flex rounded-full border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-[3px]">
										<span className="rounded-full bg-[var(--pon-surface-2)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--pon-fg)]">
											Market
										</span>
										<span className="px-3.5 py-1.5 text-[11px] text-[var(--pon-fg-3)]">Limit</span>
									</div>
									<div className="mb-2.5 flex gap-1.5">
										<Badge variant="outline">Cross</Badge>
										<Badge>20x</Badge>
									</div>
									<div className="pon-well mb-2.5 px-3 py-2.5">
										<p className="t-micro text-[var(--pon-fg-3)]">Size (USDC)</p>
										<p className="font-fono text-[15px] font-semibold text-[var(--pon-fg)]">0.00</p>
									</div>
									<div className="mb-3 h-[5px] overflow-hidden rounded-full bg-[var(--pon-bg-2)]">
										<div className="h-full w-2/5 rounded-full bg-[var(--pon-lime)]" />
									</div>
									<div className="grid grid-cols-2 gap-1.5">
										<span className="rounded-[var(--pon-r-sm)] bg-[var(--pon-lime)] py-2.5 text-center text-xs font-bold text-[var(--pon-on-lime)]">
											Buy / Long
										</span>
										<span className="rounded-[var(--pon-r-sm)] bg-[var(--pon-down)] py-2.5 text-center text-xs font-bold text-white">
											Sell / Short
										</span>
									</div>
								</div>
							</div>
						</div>
					</WindowFrame>
				</div>
			</Reveal>
		</Section>
	);
}

/* -------------------------------------------------------------------------- */
/*  Closer                                                                    */
/* -------------------------------------------------------------------------- */

function Closer() {
	return (
		<section className="relative overflow-hidden px-5 py-20 sm:px-8 md:py-28">
			<div aria-hidden className="pointer-events-none absolute inset-0">
				<div
					className="aurora left-1/2 top-1/2 h-[440px] w-[760px] -translate-x-1/2 -translate-y-1/2"
					style={{ ["--aurora" as string]: "rgba(163,230,53,0.16)" }}
				/>
			</div>

			<Parallax distance={30} className="relative z-10">
				<div className="mx-auto max-w-[var(--content-max)]">
					<div className="relative overflow-hidden rounded-[var(--pon-r-2xl)] border border-[var(--pon-line)] bg-gradient-to-b from-[var(--pon-bg-2)] to-[var(--pon-bg)] px-6 py-14 text-center sm:px-12">
						<div aria-hidden className="pon-bloom-lg" />

						<div className="relative mx-auto max-w-2xl">
							<Brand size={34} to={null} className="justify-center" />

							<h2 className="font-display mt-6 text-[clamp(32px,6vw,58px)] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--pon-fg-0)]">
								<WordReveal text="Everything, onchain." />
							</h2>

							<Reveal delay={0.2}>
								<p className="mx-auto mt-5 max-w-lg text-[17px] leading-relaxed text-[var(--pon-fg-2)]">
									Open the terminal and trade from your own wallet. No account, no custodian, no
									waiting.
								</p>
							</Reveal>

							<Reveal delay={0.3}>
								<div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
									<Magnetic>
										<Link
											to="/trade"
											className="group flex w-full items-center justify-center gap-2 rounded-full bg-[var(--pon-lime)] px-8 py-3.5 text-[15px] font-semibold text-[var(--pon-on-lime)] transition-colors hover:bg-[var(--pon-lime-2)] sm:w-auto"
										>
											Start trading
											<ArrowRight
												size={17}
												aria-hidden
												className="transition-transform group-hover:translate-x-0.5"
											/>
										</Link>
									</Magnetic>
									<Magnetic strength={0.18}>
										<Link
											to="/leaderboard"
											className="flex w-full items-center justify-center rounded-full border border-[var(--pon-line-2)] px-8 py-3.5 text-[15px] font-medium text-[var(--pon-fg)] transition-colors hover:border-[var(--pon-fg-3)] sm:w-auto"
										>
											See the leaderboard
										</Link>
									</Magnetic>
								</div>
							</Reveal>

							<Reveal delay={0.4}>
								<p className="mx-auto mt-9 max-w-xl text-balance t-caption leading-relaxed text-[var(--pon-fg-4)]">
									Tokenized equities are issued by Coinbase Onchain SPV and may not be available in
									every jurisdiction. Leverage trading carries risk of total loss. Not investment
									advice.
								</p>
							</Reveal>
						</div>
					</div>
				</div>
			</Parallax>
		</section>
	);
}

/* -------------------------------------------------------------------------- */

export default function LandingPage() {
	return (
		<main className="relative bg-[var(--pon-bg)]">
			<ScrollProgress />
			<SmoothScroll />
			<LiquidCursor />

			<Hero />
			<Rail />
			<Products />
			<HowItWorks />
			<LiveMarkets />
			<TerminalPreview />
			<Closer />
			<Footer />
		</main>
	);
}
