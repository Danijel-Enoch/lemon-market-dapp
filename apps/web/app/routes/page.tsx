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
import { useCarryCandidates, useMarkets, useSpotTokens } from "@app/hooks/useMarketData";
import { cn } from "@app/lib/utils";
import { formatUsd } from "@lemon/core";
import { ArrowRight, ArrowUpRight, Coins, Layers, Scale, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
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
/*  Atmosphere                                                                */
/* -------------------------------------------------------------------------- */

function Atmosphere() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
			<div className="grid-floor absolute inset-0" />
			<div
				className="aurora left-[-12%] top-[-22%] h-[620px] w-[620px]"
				style={{ ["--aurora" as string]: "rgba(163,230,53,0.22)", animationDelay: "0s" }}
			/>
			<div
				className="aurora right-[-10%] top-[-12%] h-[540px] w-[540px]"
				style={{ ["--aurora" as string]: "rgba(52,211,153,0.16)", animationDelay: "-9s" }}
			/>
			<div
				className="aurora left-[30%] top-[18%] h-[460px] w-[700px]"
				style={{ ["--aurora" as string]: "rgba(190,242,100,0.10)", animationDelay: "-17s" }}
			/>
			{/* Grounds the bottom edge so the aurora never bleeds into the next block. */}
			<div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

function Hero() {
	const { data: markets } = useMarkets();
	const { data: spot } = useSpotTokens();
	const { data: carry } = useCarryCandidates();

	const all = markets?.markets ?? [];
	const marketCount = all.length;
	const equityCount = all.filter((m) => m.assetClass === "equity").length;
	const buyable = spot?.tokens.filter((token) => token.buyable).length ?? 0;
	const carryCount = carry?.candidates.length ?? 0;
	const maxLeverage = all.reduce((top, m) => Math.max(top, m.maxLeverage), 0);

	const stats = [
		{ value: marketCount, label: "Markets live", suffix: "" },
		{ value: equityCount, label: "Tokenized stocks", suffix: "" },
		{ value: maxLeverage, label: "Max leverage", suffix: "x" },
		{ value: buyable + carryCount, label: "Spot & carry pairs", suffix: "" },
	];

	return (
		<section className="relative flex min-h-[100svh] flex-col overflow-hidden">
			<Atmosphere />
			<SiteHeader />

			<div className="relative z-10 mx-auto flex w-full max-w-[var(--content-max)] flex-1 flex-col justify-center px-5 py-12 sm:px-8 md:px-[60px] md:py-16">
				<Reveal trigger="mount">
					<span className="inline-flex items-center gap-2 rounded-full border border-lime-500/25 bg-lime-500/[0.07] px-3 py-1.5 t-caption text-lime-300">
						<span className="relative flex size-1.5">
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-lime-400 opacity-75" />
							<span className="relative inline-flex size-1.5 rounded-full bg-lime-400" />
						</span>
						Live on Base mainnet
					</span>
				</Reveal>

				{/* The headline is the page's one piece of scale — it runs to 84px on
				    desktop and still fits two lines at 360px. */}
				<h1 className="mt-6 max-w-[15ch] text-[clamp(2.5rem,8.5vw,5.25rem)] font-medium leading-[1.05] tracking-[-0.03em] text-white">
					<WordReveal text="Global markets," trigger="mount" />
					<br />
					<span className="bg-gradient-to-r from-lime-300 via-lime-400 to-emerald-400 bg-clip-text text-transparent">
						<WordReveal text="settled on Base." delay={0.18} trigger="mount" />
					</span>
				</h1>

				<Reveal delay={0.35} trigger="mount">
					<p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-[var(--ink-2)] sm:text-lg">
						Crypto, tokenized stocks, forex and commodities — leveraged perps, spot, baskets and
						delta-neutral carry. All in USDC, all from your own wallet.
					</p>
				</Reveal>

				<Reveal delay={0.45} trigger="mount">
					<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
						<Magnetic>
							<Link
								to="/trade"
								className="group flex w-full items-center justify-center gap-2 rounded-full bg-lime-400 px-7 py-3.5 text-[15px] font-semibold text-black transition-colors hover:bg-lime-300 sm:w-auto"
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
								className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-7 py-3.5 text-[15px] font-medium text-[var(--ink-1)] transition-colors hover:border-white/35 hover:bg-white/[0.04] sm:w-auto"
							>
								How it works
							</Link>
						</Magnetic>
					</div>
				</Reveal>

				{/* Stat rail — four live figures, two-up on phones. */}
				<Reveal delay={0.55} trigger="mount">
					<dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:mt-14 lg:grid-cols-4">
						{stats.map((stat) => (
							<div key={stat.label} className="bg-black/60 px-5 py-5 backdrop-blur-sm sm:px-6">
								<dd className="font-fono text-2xl text-white sm:text-3xl">
									{stat.value > 0 ? (
										<>
											<CountUp value={stat.value} />
											{stat.suffix}
										</>
									) : (
										"—"
									)}
								</dd>
								<dt className="mt-1 t-caption text-[var(--ink-2)]">{stat.label}</dt>
							</div>
						))}
					</dl>
				</Reveal>
			</div>

			{/* Live tape pinned to the base of the fold. */}
			<div className="relative z-10 border-t border-white/[0.07]">
				<MarketTicker className="h-14" />
			</div>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*  Trusted rail                                                              */
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
		<section className="border-y border-white/[0.06] py-6">
			<Marquee speed={45}>
				{RAIL.map((item) => (
					<span
						key={item}
						className="flex shrink-0 items-center gap-3 whitespace-nowrap px-8 t-label text-[var(--ink-2)]"
					>
						<span className="size-1 rounded-full bg-lime-400/60" aria-hidden />
						{item}
					</span>
				))}
			</Marquee>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*  Bento                                                                     */
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
				"group relative h-full overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors duration-300 hover:border-lime-400/25 sm:p-8",
				className,
			)}
		>
			{/* One-pass sheen on hover. */}
			<span
				aria-hidden
				className="sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"
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

function Bento() {
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
		<section className="mx-auto w-full max-w-[var(--content-max)] px-5 py-20 sm:px-8 md:px-[60px] md:py-28">
			<div className="max-w-3xl">
				<Reveal>
					<p className="t-eyebrow text-lime-400">Four ways to trade</p>
				</Reveal>
				<h2 className="mt-4 text-[clamp(1.9rem,4.5vw,3.25rem)] font-medium leading-[1.1] tracking-[-0.02em] text-white">
					<WordReveal text="One balance. Every market." />
				</h2>
				<Reveal delay={0.15}>
					<p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-2)]">
						No per-market subaccounts and no bridging between venues. Deposit USDC once and reach
						every instrument from the same collateral.
					</p>
				</Reveal>
			</div>

			<div className="mt-12 grid auto-rows-[minmax(180px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{/* Lead tile spans two columns on wide screens. */}
				<Reveal className="sm:col-span-2 lg:row-span-2" delay={0}>
					<Tile to="/trade" className="flex flex-col justify-between">
						<div>
							<TrendingUp size={22} className="text-lime-400" aria-hidden />
							<h3 className="mt-5 text-xl font-medium text-white sm:text-2xl">Perpetuals</h3>
							<p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--ink-2)]">
								Long or short every market Pacifica lists — crypto, tokenized stocks, FX,
								commodities and metals. Orders are signed rather than gassed, so an unfilled order
								costs nothing.
							</p>
						</div>

						{/* The tile is two rows tall on wide screens; the live class
						    breakdown fills that height with something true rather than
						    padding. */}
						<ul className="my-8 grid gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2">
							{classes.map((entry) => (
								<li
									key={entry.label}
									className="flex items-baseline justify-between gap-3 bg-black/40 px-4 py-3"
								>
									<span className="t-label text-[var(--ink-2)]">{entry.label}</span>
									<span className="font-fono text-sm text-white">
										{entry.count > 0 ? entry.count : "—"}
									</span>
								</li>
							))}
						</ul>

						<div className="flex flex-wrap items-end justify-between gap-4">
							<div className="flex gap-6">
								<div>
									<p className="font-fono text-2xl text-white sm:text-3xl">
										{topLeverage > 0 ? `${topLeverage}x` : "—"}
									</p>
									<p className="mt-0.5 t-caption text-[var(--ink-2)]">Max leverage</p>
								</div>
								<div>
									<p className="font-fono text-2xl text-white sm:text-3xl">0</p>
									<p className="mt-0.5 t-caption text-[var(--ink-2)]">Gas to place</p>
								</div>
							</div>
							<span className="inline-flex items-center gap-1.5 t-label text-lime-400">
								Trade perps <ArrowUpRight size={15} aria-hidden />
							</span>
						</div>
					</Tile>
				</Reveal>

				<Reveal delay={0.08}>
					<Tile to="/spot" className="flex flex-col justify-between">
						<div>
							<Coins size={20} className="text-lime-400" aria-hidden />
							<h3 className="mt-4 text-lg font-medium text-white">Spot</h3>
							<p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
								Buy the real token on Base through the KyberSwap aggregator, with gasless limit
								orders.
							</p>
						</div>
						<span className="mt-6 inline-flex items-center gap-1.5 t-label text-lime-400">
							Buy spot <ArrowUpRight size={15} aria-hidden />
						</span>
					</Tile>
				</Reveal>

				<Reveal delay={0.16}>
					<Tile to="/baskets" className="flex flex-col justify-between">
						<div>
							<Layers size={20} className="text-lime-400" aria-hidden />
							<h3 className="mt-4 text-lg font-medium text-white">Baskets</h3>
							<p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
								Enter a themed set of correlated markets at one weight, tracked on a single index
								line.
							</p>
						</div>
						<span className="mt-6 inline-flex items-center gap-1.5 t-label text-lime-400">
							Browse baskets <ArrowUpRight size={15} aria-hidden />
						</span>
					</Tile>
				</Reveal>

				<Reveal className="sm:col-span-2" delay={0.24}>
					<Tile to="/carry" className="flex h-full flex-col justify-between">
						<div>
							<Scale size={20} className="text-lime-400" aria-hidden />
							<h3 className="mt-4 text-lg font-medium text-white">Cash &amp; carry</h3>
							<p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--ink-2)]">
								Hold the spot token, short the matching perp, and collect funding on a position with
								no directional exposure. The round-trip cost is priced before you commit.
							</p>
						</div>
						<span className="mt-6 inline-flex items-center gap-1.5 t-label text-lime-400">
							Build a carry <ArrowUpRight size={15} aria-hidden />
						</span>
					</Tile>
				</Reveal>

				<Reveal delay={0.32}>
					<Tile className="flex flex-col justify-center">
						<p className="font-fono text-3xl text-lime-400">24/7</p>
						<p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
							Crypto never closes. Equities and FX follow real market hours, shown on every market.
						</p>
					</Tile>
				</Reveal>
			</div>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*  How it works — sticky steps                                               */
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
		<section className="relative border-y border-white/[0.06] bg-white/[0.012]">
			<div className="mx-auto w-full max-w-[var(--content-max)] px-5 py-20 sm:px-8 md:px-[60px] md:py-28">
				<div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
					{/* Sticky on desktop so the steps scroll past a fixed statement. */}
					<div className="lg:sticky lg:top-24 lg:self-start">
						<Reveal>
							<p className="t-eyebrow text-lime-400">How it works</p>
						</Reveal>
						<h2 className="mt-4 text-[clamp(1.9rem,4.5vw,3.25rem)] font-medium leading-[1.1] tracking-[-0.02em] text-white">
							<WordReveal text="From wallet to fill in four steps." />
						</h2>
						<Reveal delay={0.15}>
							<p className="mt-5 max-w-md text-base leading-relaxed text-[var(--ink-2)]">
								Lemon is a front end, not a venue. It composes protocols that already hold the
								liquidity — so there is no new bridge to trust and no new custodian.
							</p>
						</Reveal>
						<Reveal delay={0.25}>
							<Magnetic>
								<Link
									to="/trade"
									className="mt-8 inline-flex items-center gap-2 rounded-full bg-lime-400 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-lime-300"
								>
									Open the terminal <ArrowRight size={16} aria-hidden />
								</Link>
							</Magnetic>
						</Reveal>
					</div>

					<ol className="space-y-3">
						{STEPS.map((step, index) => (
							<Reveal key={step.n} delay={index * 0.08}>
								<li className="group relative flex gap-5 rounded-2xl border border-white/[0.07] bg-black/40 p-6 transition-colors hover:border-lime-400/25 sm:gap-7 sm:p-8">
									<span className="font-fono text-sm text-lime-400/70 transition-colors group-hover:text-lime-400">
										{step.n}
									</span>
									<div className="min-w-0">
										<h3 className="text-lg font-medium text-white">{step.title}</h3>
										<p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">{step.body}</p>
									</div>
								</li>
							</Reveal>
						))}
					</ol>
				</div>
			</div>
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*  Live markets preview                                                      */
/* -------------------------------------------------------------------------- */

function LiveMarkets() {
	const { data } = useMarkets();
	const rows = (data?.markets ?? [])
		.filter((market) => market.isListed)
		.sort((a, b) => b.openInterest - a.openInterest)
		.slice(0, 8);

	return (
		<section className="mx-auto w-full max-w-[var(--content-max)] px-5 py-20 sm:px-8 md:px-[60px] md:py-28">
			<div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<Reveal>
						<p className="t-eyebrow text-lime-400">Live now</p>
					</Reveal>
					<h2 className="mt-4 text-[clamp(1.9rem,4.5vw,3.25rem)] font-medium leading-[1.1] tracking-[-0.02em] text-white">
						<WordReveal text="Deepest markets today." />
					</h2>
				</div>
				<Reveal delay={0.1}>
					<Link
						to="/trade"
						className="inline-flex items-center gap-1.5 whitespace-nowrap t-label text-lime-400 transition-colors hover:text-lime-300"
					>
						See all markets <ArrowUpRight size={15} aria-hidden />
					</Link>
				</Reveal>
			</div>

			<Reveal delay={0.15}>
				<div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.07]">
					{/* Header hides on phones; each row carries its own labels there. */}
					<div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-white/[0.07] bg-white/[0.02] px-6 py-3 t-caption text-[var(--ink-2)] sm:grid">
						<span>Market</span>
						<span className="text-right">Open interest</span>
						<span className="text-right">Max leverage</span>
						<span className="text-right">Session</span>
					</div>

					{rows.length === 0 && (
						<p className="px-6 py-10 text-center t-label text-[var(--ink-2)]">Loading markets…</p>
					)}

					{rows.map((market) => (
						<Link
							key={market.symbol}
							to={`/trade/${market.symbol.replace("/", "-")}`}
							className="grid grid-cols-2 items-center gap-3 border-b border-white/[0.05] px-5 py-4 transition-colors last:border-b-0 hover:bg-white/[0.03] sm:grid-cols-[2fr_1fr_1fr_1fr] sm:gap-4 sm:px-6"
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
										className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] text-[var(--ink-2)]"
										aria-hidden
									>
										{market.base.slice(0, 2)}
									</span>
								)}
								<span className="min-w-0">
									<span className="block truncate text-sm text-white">{market.symbol}</span>
									<span className="block truncate t-caption text-[var(--ink-2)]">
										{market.base}
									</span>
								</span>
							</span>

							<span className="text-right font-fono text-sm text-white">
								{formatUsd(market.openInterest, { compact: true })}
								<span className="block t-caption text-[var(--ink-2)] sm:hidden">Open interest</span>
							</span>

							<span className="hidden text-right font-fono text-sm text-[var(--ink-1)] sm:block">
								{market.maxLeverage}x
							</span>

							<span className="hidden justify-end sm:flex">
								<span
									className={cn(
										"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 t-micro",
										market.isOpen
											? "bg-lime-500/10 text-lime-400"
											: "bg-white/[0.06] text-[var(--ink-2)]",
									)}
								>
									<span
										className={cn(
											"size-1 rounded-full",
											market.isOpen ? "bg-lime-400" : "bg-[var(--ink-2)]",
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
		</section>
	);
}

/* -------------------------------------------------------------------------- */
/*  Closing call to action                                                    */
/* -------------------------------------------------------------------------- */

function Closer() {
	return (
		<section className="relative overflow-hidden px-5 py-24 sm:px-8 md:px-[60px] md:py-36">
			<div aria-hidden className="pointer-events-none absolute inset-0">
				<div
					className="aurora left-1/2 top-1/2 h-[440px] w-[760px] -translate-x-1/2 -translate-y-1/2"
					style={{ ["--aurora" as string]: "rgba(163,230,53,0.16)" }}
				/>
			</div>

			<Parallax distance={30} className="relative z-10">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="text-[clamp(2rem,6vw,4rem)] font-medium leading-[1.08] tracking-[-0.03em] text-white">
						<WordReveal text="Everything, onchain." />
					</h2>
					<Reveal delay={0.2}>
						<p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-[var(--ink-2)] sm:text-lg">
							Open the terminal and trade from your own wallet. No account, no custodian, no
							waiting.
						</p>
					</Reveal>
					<Reveal delay={0.3}>
						<div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
							<Magnetic>
								<Link
									to="/trade"
									className="group flex w-full items-center justify-center gap-2 rounded-full bg-lime-400 px-8 py-4 font-semibold text-black transition-colors hover:bg-lime-300 sm:w-auto"
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
									className="flex w-full items-center justify-center rounded-full border border-white/15 px-8 py-4 font-medium text-[var(--ink-1)] transition-colors hover:border-white/35 hover:bg-white/[0.04] sm:w-auto"
								>
									See the leaderboard
								</Link>
							</Magnetic>
						</div>
					</Reveal>
					<Reveal delay={0.4}>
						<p className="mx-auto mt-10 max-w-xl text-balance t-caption leading-relaxed text-white/30">
							Tokenized equities are issued by Coinbase Onchain SPV and may not be available in
							every jurisdiction. Leverage trading carries risk of total loss. Not investment
							advice.
						</p>
					</Reveal>
				</div>
			</Parallax>
		</section>
	);
}

/* -------------------------------------------------------------------------- */

export default function LandingPage() {
	return (
		<main className="relative bg-black">
			<ScrollProgress />
			<SmoothScroll />
			<LiquidCursor />

			<Hero />
			<Rail />
			<Bento />
			<HowItWorks />
			<LiveMarkets />
			<Closer />
			<Footer />
		</main>
	);
}
