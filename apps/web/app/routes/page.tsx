import { Button } from "@app/components/ui/button";
import { useCarryCandidates, useMarkets, useSpotTokens } from "@app/hooks/useMarketData";
import { ArrowRight, Coins, Layers, Scale, TrendingUp } from "lucide-react";
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

const FEATURES = [
	{
		icon: TrendingUp,
		title: "Perps",
		body: "Long or short every market Avantis lists — crypto, tokenized stocks, FX, commodities and metals. Orders are signed, not gassed.",
		href: "/trade",
		cta: "Trade perps",
	},
	{
		icon: Coins,
		title: "Spot",
		body: "Buy and sell real tokens on Base through the KyberSwap aggregator, with market and gasless limit orders.",
		href: "/spot",
		cta: "Buy stocks",
	},
	{
		icon: Layers,
		title: "Baskets",
		body: "Enter several correlated markets at once, equally weighted, with a composite index chart. Available as perp, spot or carry.",
		href: "/baskets",
		cta: "Browse baskets",
	},
	{
		icon: Scale,
		title: "Cash & carry",
		body: "Hold the spot token, short the matching perp, collect funding on a delta-neutral position — with the real cost shown before you open it.",
		href: "/carry",
		cta: "Build a carry",
	},
];

export default function LandingPage() {
	const { data: markets } = useMarkets();
	const { data: spot } = useSpotTokens();
	const { data: carry } = useCarryCandidates();

	const marketCount = markets?.markets.length ?? 0;
	const equityCount = markets?.markets.filter((m) => m.assetClass === "equity").length ?? 0;
	const buyable = spot?.tokens.filter((token) => token.buyable).length ?? 0;

	return (
		<div className="min-h-screen">
			<section className="relative overflow-hidden px-4 pt-32 pb-20 md:pt-40">
				<div className="pointer-events-none absolute left-1/4 top-0 size-96 rounded-full bg-lime-500/10 blur-[120px]" />
				<div className="relative mx-auto max-w-4xl text-center">
					<p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400">
						<span className="size-1.5 rounded-full bg-lime-400" aria-hidden />
						Live on Base mainnet
					</p>
					<h1 className="text-balance text-4xl font-semibold leading-tight md:text-6xl">
						Everything,{" "}
						<span className="bg-gradient-to-r from-lime-300 to-green-500 bg-clip-text text-transparent">
							onchain
						</span>
					</h1>
					<p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-gray-400 md:text-lg">
						Crypto, tokenized stocks, FX and commodities. Leveraged perps, spot, multi-market
						baskets and delta-neutral cash-and-carry — all in USDC on Base.
					</p>

					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						<Button asChild className="bg-lime-500 font-semibold text-black hover:bg-lime-400">
							<Link to="/trade">
								Start trading <ArrowRight size={16} className="ml-1.5" aria-hidden />
							</Link>
						</Button>
						<Button asChild variant="outline">
							<Link to="/docs">Read the docs</Link>
						</Button>
					</div>

					<dl className="mx-auto mt-12 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
						{[
							{ label: "Markets", value: marketCount || "—" },
							{ label: "Tokenized stocks", value: equityCount || "—" },
							{ label: "Spot tokens", value: buyable || "—" },
							{ label: "Carry pairs", value: carry?.candidates.length ?? "—" },
						].map((stat) => (
							<div key={stat.label} className="rounded-lg border border-white/10 p-3">
								<dd className="font-mono text-2xl text-lime-400">{stat.value}</dd>
								<dt className="text-[11px] uppercase tracking-wide text-gray-500">{stat.label}</dt>
							</div>
						))}
					</dl>
				</div>
			</section>

			<section className="mx-auto max-w-6xl px-4 pb-24">
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					{FEATURES.map((feature) => {
						const Icon = feature.icon;
						return (
							<Link
								key={feature.title}
								to={feature.href}
								className="group rounded-xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-lime-500/40"
							>
								<Icon size={22} className="text-lime-400" aria-hidden />
								<h2 className="mt-4 text-lg font-medium group-hover:text-lime-400">
									{feature.title}
								</h2>
								<p className="mt-2 text-sm leading-relaxed text-gray-400">{feature.body}</p>
								<span className="mt-4 inline-flex items-center gap-1.5 text-sm text-lime-400">
									{feature.cta} <ArrowRight size={14} aria-hidden />
								</span>
							</Link>
						);
					})}
				</div>

				<p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-relaxed text-gray-600">
					Tokenized equities are issued by Coinbase Onchain SPV and may not be available in every
					jurisdiction. Leverage trading carries risk of total loss. Not investment advice.
				</p>
			</section>
		</div>
	);
}
