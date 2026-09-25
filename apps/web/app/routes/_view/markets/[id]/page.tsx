import { EntryPlanner } from "@app/components/market/EntryPlanner";
import { formatPercent, useBasisMarket, useSelfBalances, useSelfStatus } from "@lemon/client";
import { Callout, EmptyState, Skeleton, StatCard } from "@lemon/ui";
import { AlertTriangle, ArrowLeft, CandlestickChart, Moon } from "lucide-react";
import { Link, type MetaFunction, useParams } from "react-router";
import { useAccount } from "wagmi";

export const meta: MetaFunction = ({ params }) => [
	{ title: `${String(params.id ?? "Market").toUpperCase()} — Lemon` },
];

/**
 * One market, priced for the person about to enter it.
 *
 * The page is arranged around a single question — is this trade worth doing at
 * the size I have in mind — so the sizing panel is a peer of the summary rather
 * than something below it. Everything on the left explains the market; the panel
 * on the right prices *this* position in it.
 *
 * The two legs are described separately and in the venue's own terms. A basis
 * position is the only thing in this app where the interesting risks are not in
 * the strategy but in the plumbing: the legs settle on different chains, one of
 * them keeps exchange hours, the perp has a minimum size the spot leg does not,
 * and the margin has to be somewhere else entirely before any of it can start.
 * None of that is visible from a yield figure.
 */
export default function MarketDetailPage() {
	const params = useParams();
	const id = params.id;

	const { isConnected } = useAccount();
	const { data: market, isLoading, isError } = useBasisMarket(id);
	const { data: status } = useSelfStatus();

	// Balances sharpen the sizing panel — it can say "you have $40 of margin and
	// this needs $200" — but the panel is fully useful without them, so a
	// signed-out visitor still gets the arithmetic.
	const { data: balanceData } = useSelfBalances(isConnected && status?.available === true);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-28 w-full rounded-[var(--pon-r-lg,16px)]" />
				<Skeleton className="h-64 w-full rounded-[var(--pon-r-lg,16px)]" />
			</div>
		);
	}

	if (isError || !market) {
		return (
			<div className="space-y-6">
				<BackLink />
				<EmptyState
					icon={CandlestickChart}
					title={`No market called “${id}”`}
					description="A pair exists only where both legs do — a token the aggregator can route into and a perp on the same underlying. This one has neither, or the board could not be reached."
				/>
			</div>
		);
	}

	const { economics: e, spot, perp } = market;
	const closed = market.assetClass === "equity" && !perp.isOpen;

	return (
		<div className="space-y-6 md:space-y-8">
			<BackLink />

			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex items-center gap-3">
					{market.logoUrl ? (
						<img
							src={market.logoUrl}
							alt=""
							className="size-11 rounded-full bg-[var(--pon-bg-3)]"
						/>
					) : (
						<span className="flex size-11 items-center justify-center rounded-full bg-[var(--pon-bg-3)] font-fono text-[13px] font-bold text-[var(--pon-fg-2)]">
							{market.ticker.slice(0, 3)}
						</span>
					)}
					<div>
						<h1 className="text-[24px] font-semibold text-[var(--pon-fg-0)]">{market.ticker}</h1>
						<p className="text-[12.5px] text-[var(--pon-fg-3)]">
							{market.name} · long {spot.symbol}, short {perp.symbol}
						</p>
					</div>
				</div>
			</div>

			{market.blockers.length > 0 && (
				<Callout tone="warning" title="This market cannot be entered right now">
					<ul className="space-y-1">
						{market.blockers.map((blocker) => (
							<li key={blocker} className="flex gap-2">
								<AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
								<span>{blocker}</span>
							</li>
						))}
					</ul>
				</Callout>
			)}

			{closed && (
				<Callout tone="info" title="The perp is outside exchange hours">
					<span className="inline-flex items-center gap-2">
						<Moon size={13} aria-hidden />
						{market.ticker} is an equity, so its perp keeps market hours while the token on chain
						trades continuously. A position opened now would hold spot with nothing hedging it until
						the next session — which is a price bet, not a basis trade.
					</span>
				</Callout>
			)}

			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<StatCard label="Net APY" value={formatPercent(e.netApyPercent, 1)} />
				<StatCard label="Funding (gross)" value={formatPercent(e.fundingAprPercent, 1)} />
				<StatCard
					label="Basis"
					value={e.basisPercent === null ? "—" : formatPercent(e.basisPercent, 2)}
				/>
				<StatCard
					label="Breakeven"
					value={e.breakevenDays === null ? "—" : `${e.breakevenDays.toFixed(1)}d`}
				/>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1fr_380px]">
				<div className="space-y-6">
					<LegPanel
						title="Spot leg — your wallet"
						subtitle={`Bought through the chain's aggregator and held at your own address. We cannot move it.`}
						rows={[
							["Token", spot.symbol],
							[
								"Price",
								spot.priceUsd === null
									? "no route"
									: `$${spot.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
							],
							["Buyable", spot.buyable ? "yes" : "no"],
							["Sellable", spot.sellable ? "yes" : "no"],
							[
								"Price impact",
								spot.priceImpactPercent === null
									? "unmeasured"
									: `${spot.priceImpactPercent.toFixed(2)}%`,
							],
						]}
					/>

					<LegPanel
						title="Perp leg — Pacifica"
						subtitle="Shorted from a Solana address derived for you. This is the leg the app can sign for."
						rows={[
							["Symbol", perp.symbol],
							[
								"Mark price",
								perp.markPrice === null
									? "—"
									: `$${perp.markPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
							],
							["Minimum position", `$${perp.minPositionUsdc}`],
							["Max leverage", `${perp.maxLeverage}x`],
							["Funding (short)", `${perp.fundingShortPercentPerHour.toFixed(4)}% / hour`],
							["Open interest", `$${Math.round(perp.openInterest).toLocaleString("en-US")}`],
						]}
					/>

					<div className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
						<h2 className="firm-label text-[var(--pon-fg-0)]">Where your money sits</h2>
						<p className="mt-2 text-[12.5px] leading-relaxed text-[var(--pon-fg-2)]">
							The two legs have different custody, and it is worth being plain about which is which.
							The <strong>spot leg stays in the wallet you connected</strong> — we never hold it and
							cannot move it, and every buy, rebalance and sell of it is a transaction you sign
							yourself.
						</p>
						<p className="mt-2 text-[12.5px] leading-relaxed text-[var(--pon-fg-2)]">
							The <strong>margin sits on Pacifica</strong>, under a Solana address derived for you
							through NEAR chain signatures. That address is yours alone and nobody else's funds are
							pooled with it — but it is signed for by this deployment's relayer, not by you. It is
							the same trust boundary the vault agents sit behind, and it is why the larger leg
							deliberately does not live there.
						</p>
					</div>
				</div>

				<div className="lg:sticky lg:top-6 lg:self-start">
					<EntryPlanner market={market} balances={balanceData?.balances} />
				</div>
			</div>
		</div>
	);
}

function BackLink() {
	return (
		<Link
			to="/markets"
			className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--pon-fg-3)] transition-colors hover:text-[var(--pon-fg-0)]"
		>
			<ArrowLeft size={14} aria-hidden />
			All markets
		</Link>
	);
}

function LegPanel({
	title,
	subtitle,
	rows,
}: {
	title: string;
	subtitle: string;
	rows: [string, string][];
}) {
	return (
		<div className="rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-5">
			<h2 className="firm-label text-[var(--pon-fg-0)]">{title}</h2>
			<p className="mt-1 text-[11.5px] leading-relaxed text-[var(--pon-fg-3)]">{subtitle}</p>
			<dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
				{rows.map(([label, value]) => (
					<div key={label}>
						<dt className="firm-label text-[var(--pon-fg-3)]">{label}</dt>
						<dd className="font-fono mt-0.5 text-[13px] font-bold text-[var(--pon-fg)]">{value}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
