import { adlRisk } from "@lemon/core";
import { prisma } from "@lemon/db";
import type { KyberAggregatorClient } from "@lemon/kyber";
import type { PacificaClient } from "@lemon/pacifica";
import type { Address, Hex } from "viem";
import { keccak256, toHex } from "viem";
import { toUnits, type Valuation, value } from "./valuation";
import type { VenueAdapter } from "./worker";

/**
 * A venue adapter that reads both venues for real and trades neither.
 *
 * Built for deployments where the vault is somewhere the spot leg cannot
 * execute — Base Sepolia, Vibenet, any chain KyberSwap's aggregator does not
 * serve — but where the app still has to behave exactly as it would on mainnet.
 * Everything a depositor sees is real: the deposits, the share price, the NAV
 * reports, the activity feed, the withdrawal queue. Only the fills are notional.
 *
 * The prices are not notional. Spot comes from a live KyberSwap route against
 * Base mainnet, and the perp's mark and funding come from whichever Pacifica the
 * deployment is pointed at. So the vault earns the funding a real carry position
 * would have earned over the same hours, and the NAV bounds get exercised
 * against numbers that move on their own rather than against a script.
 *
 * The one thing that is genuinely on-chain here is the money. `agentWithdraw`
 * really moves USDC out of the vault, and `unwind` really sends it back — the
 * paper position tracks what that USDC would have bought. That matters: a
 * withdrawal has to be payable, and a simulation that skipped the transfer would
 * leave the queue unfulfillable for the one reason the queue exists.
 */

export interface PaperVenueConfig {
	/** The vault this position belongs to, lowercased. Keys the stored position. */
	vaultAddress: string;
	symbol: string;
	spotToken: Address;
	spotTokenDecimals: number;
	usdc: Address;
	perpSymbol: string;
	agentAddress: Address;
	/** Applied to every simulated fill, so paper execution is not free. */
	slippagePercent: number;
}

export interface PaperVenueDeps {
	config: PaperVenueConfig;
	kyber: KyberAggregatorClient;
	pacifica: PacificaClient;
	/** Sends USDC from the agent wallet back to the vault. Real, on-chain. */
	returnToVault: (amount: bigint) => Promise<Hex>;
	now: () => number;
}

/** One USDC, and one whole spot token, as scaling factors. */
const USDC_UNIT = 1_000_000n;

/**
 * A reference size for pricing an empty holding.
 *
 * A route quote needs an input amount, and zero returns nothing — so an unopened
 * vault would have no price and `observe` would refuse to value it. $1,000 is
 * large enough to be past the dust tiers of any pool worth trading and small
 * enough not to move one.
 */
const PRICE_PROBE_USDC = 1_000n * USDC_UNIT;

interface StoredPosition {
	spotUnits: bigint;
	spotCostUsdc: bigint;
	perpUnits: bigint;
	perpMarginUsdc: bigint;
	perpEntryPriceE6: bigint;
	fundingAccruedUsdc: bigint;
	fundingAccruedAt: Date;
}

function toBig(v: string): bigint {
	return BigInt(v);
}

async function load(vaultAddress: string): Promise<StoredPosition> {
	const row = await prisma.paperPosition.findUnique({ where: { vaultAddress } });
	if (!row) {
		return {
			spotUnits: 0n,
			spotCostUsdc: 0n,
			perpUnits: 0n,
			perpMarginUsdc: 0n,
			perpEntryPriceE6: 0n,
			fundingAccruedUsdc: 0n,
			fundingAccruedAt: new Date(),
		};
	}
	return {
		spotUnits: toBig(row.spotUnits),
		spotCostUsdc: toBig(row.spotCostUsdc),
		perpUnits: toBig(row.perpUnits),
		perpMarginUsdc: toBig(row.perpMarginUsdc),
		perpEntryPriceE6: toBig(row.perpEntryPriceE6),
		fundingAccruedUsdc: toBig(row.fundingAccruedUsdc),
		fundingAccruedAt: row.fundingAccruedAt,
	};
}

async function save(vaultAddress: string, p: StoredPosition): Promise<void> {
	const data = {
		spotUnits: p.spotUnits.toString(),
		spotCostUsdc: p.spotCostUsdc.toString(),
		perpUnits: p.perpUnits.toString(),
		perpMarginUsdc: p.perpMarginUsdc.toString(),
		perpEntryPriceE6: p.perpEntryPriceE6.toString(),
		fundingAccruedUsdc: p.fundingAccruedUsdc.toString(),
		fundingAccruedAt: p.fundingAccruedAt,
	};
	await prisma.paperPosition.upsert({
		where: { vaultAddress },
		create: { vaultAddress, ...data },
		update: data,
	});
}

/**
 * A deterministic reference for a simulated fill.
 *
 * Every activity row carries a `txRef` so a reader can check it against the
 * chain it names. A paper fill has no transaction, and inventing something that
 * *looks* like a hash would be the one dishonest thing in here — so the ref is
 * the hash of a string that says plainly what it is. It resolves to nothing on
 * any explorer, which is the correct outcome.
 */
function paperRef(vaultAddress: string, label: string, at: number): Hex {
	return keccak256(toHex(`paper:${vaultAddress}:${label}:${at}`));
}

export function createPaperVenueAdapter(deps: PaperVenueDeps): VenueAdapter {
	const { config, kyber, pacifica } = deps;
	const vaultAddress = config.vaultAddress.toLowerCase();

	/** USDC per whole spot token, scaled by 1e6, from a live route. */
	async function spotPriceE6(): Promise<bigint | null> {
		try {
			const route = await kyber.getRoute({
				tokenIn: config.usdc,
				tokenOut: config.spotToken,
				amountIn: PRICE_PROBE_USDC.toString(),
				slippagePercent: config.slippagePercent,
			});
			// `QuoteResult` is a discriminated union — `ok: false` means the pool
			// does not exist, which is ordinary market state rather than an error.
			if (!route.ok) return null;
			const tokensOut = BigInt(route.quote.amountOut);
			if (tokensOut === 0n) return null;
			// USDC in already carries six decimals, so scaling by the token's own
			// decimals and dividing by the tokens received lands the price on the
			// same 1e6 basis every USDC amount in here uses.
			return (PRICE_PROBE_USDC * 10n ** BigInt(config.spotTokenDecimals)) / tokensOut;
		} catch {
			// Null, not zero. An unroutable pool is an unknown price, and the
			// valuation layer refuses to price it rather than marking it to zero.
			return null;
		}
	}

	/** What the held spot would fetch, in USDC units. */
	function spotValue(units: bigint, priceE6: bigint): bigint {
		return (units * priceE6) / 10n ** BigInt(config.spotTokenDecimals);
	}

	/**
	 * Mark and funding for the perp leg.
	 *
	 * From `prices()`, not `markets()`. The latter returns the market's *spec* —
	 * tick size, lot size, leverage caps, and the funding rate — but carries no
	 * mark at all, so reading a price off it silently yields undefined and the
	 * whole leg reads as unpriceable.
	 */
	async function perpMarket(): Promise<{
		markE6: bigint;
		mark: number;
		fundingHourlyPercent: number;
		oracle: number | null;
		yesterday: number | null;
	} | null> {
		const prices = await pacifica.prices();
		const price = prices.find((p) => p.symbol === config.perpSymbol);
		if (!price) return null;
		const mark = Number(price.mark);
		const funding = Number(price.funding);
		if (!Number.isFinite(mark) || mark <= 0) return null;
		return {
			markE6: BigInt(Math.round(mark * 1e6)),
			mark,
			// Pacifica quotes one rate where positive means longs pay shorts, so
			// the short side receives exactly this. See the README.
			fundingHourlyPercent: Number.isFinite(funding) ? funding * 100 : 0,
			oracle: finiteOrNull(price.oracle),
			yesterday: finiteOrNull(price.yesterday_price),
		};
	}

	/** A venue decimal string as a number, or null when missing or unparseable. */
	function finiteOrNull(raw: string | number | null | undefined): number | null {
		if (raw === null || raw === undefined) return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	}

	/**
	 * Accrue funding for the hours since it was last accrued.
	 *
	 * Charged on notional, not on margin — funding is paid on the size of the
	 * position, and computing it off margin would scale the vault's whole return
	 * with its leverage in a way the real venue does not.
	 */
	function accrue(p: StoredPosition, markE6: bigint, fundingHourlyPercent: number, at: number) {
		const elapsedHours = (at * 1000 - p.fundingAccruedAt.getTime()) / 3_600_000;
		if (elapsedHours <= 0) return;
		const notional = spotValue(p.perpUnits, markE6);
		const earned = (Number(notional) * fundingHourlyPercent * elapsedHours) / 100;
		p.fundingAccruedUsdc += BigInt(Math.round(earned));
		p.fundingAccruedAt = new Date(at * 1000);
	}

	/** Perp equity: margin, plus the short's mark-to-market, plus funding taken. */
	function perpEquity(p: StoredPosition, markE6: bigint): bigint {
		// A short gains when the mark falls, so the sign is entry minus mark.
		const move =
			((p.perpEntryPriceE6 - markE6) * p.perpUnits) / 10n ** BigInt(config.spotTokenDecimals);
		const equity = p.perpMarginUsdc + move + p.fundingAccruedUsdc;
		// A paper account cannot go below zero any more than a real one can: the
		// venue would have liquidated first, and reporting negative equity would
		// understate the vault by the amount it had already lost.
		return equity > 0n ? equity : 0n;
	}

	/**
	 * Slippage, always against the trader.
	 *
	 * Applied to the *result* of a fill in both directions — fewer tokens for the
	 * USDC on the way in, fewer USDC for the tokens on the way out — so a paper
	 * fill is never better than a real one would have been. A simulation that
	 * filled at the mid would quietly report a yield the strategy cannot earn.
	 */
	function afterSlippage(amount: bigint): bigint {
		const bps = BigInt(Math.round(config.slippagePercent * 100));
		return (amount * (10_000n - bps)) / 10_000n;
	}

	return {
		async observe() {
			const [p, priceE6, market] = await Promise.all([
				load(vaultAddress),
				spotPriceE6(),
				perpMarket(),
			]);

			if (priceE6 === null || market === null) {
				// Same contract as the real adapter: refuse to value rather than
				// value a leg at zero. The vault goes stale, which blocks deposits
				// and fulfilments until a human looks — noisier, and correct.
				return {
					valuation: value({
						spotTokenBalance: p.spotUnits,
						spotTokenDecimals: config.spotTokenDecimals,
						spotSellQuoteUsdc: null,
						perpEquityUsdc: 0n,
						perpNotionalUsdc: 0n,
						idleAtAgentUsdc: 0n,
						inFlightUsdc: 0n,
					}),
					spotUnits: 0n,
					perpUnits: 0n,
					fundingShortPercentPerHour: 0,
					spotBuyable: false,
					spotSellable: false,
					symbol: config.symbol,
					// Unpriced, so unscored. Reporting "not in the queue" here would
					// read as reassurance drawn from a price we could not fetch.
					adl: adlRisk({
						side: "short",
						entryPrice: null,
						markPrice: null,
						size: 0,
						equityUsd: null,
					}),
				};
			}

			accrue(p, market.markE6, market.fundingHourlyPercent, deps.now());
			await save(vaultAddress, p);

			const spot = spotValue(p.spotUnits, priceE6);
			const equity = perpEquity(p, market.markE6);
			const notional = spotValue(p.perpUnits, market.markE6);

			const valuation: Valuation = value({
				spotTokenBalance: p.spotUnits,
				spotTokenDecimals: config.spotTokenDecimals,
				spotSellQuoteUsdc: afterSlippage(spot),
				perpEquityUsdc: equity,
				perpNotionalUsdc: notional,
				// Zero, deliberately. The agent's real USDC balance is the *backing*
				// for the paper legs, not a separate holding — counting both would
				// report the same dollars twice and inflate every share price.
				idleAtAgentUsdc: 0n,
				inFlightUsdc: 0n,
			});

			const scale = 10 ** config.spotTokenDecimals;
			return {
				valuation,
				spotUnits: toUnits(p.spotUnits, config.spotTokenDecimals),
				perpUnits: toUnits(p.perpUnits, config.spotTokenDecimals),
				fundingShortPercentPerHour: market.fundingHourlyPercent,
				spotBuyable: true,
				spotSellable: p.spotUnits > 0n,
				symbol: config.symbol,
				// The sizes are simulated; the queue position they would occupy is
				// scored off the same live mark and oracle the real adapter uses.
				adl: adlRisk({
					side: "short",
					entryPrice: p.perpEntryPriceE6 === 0n ? null : Number(p.perpEntryPriceE6) / 1e6,
					markPrice: market.mark,
					size: Number(p.perpUnits) / scale,
					equityUsd: Number(equity) / 1e6,
					oraclePrice: market.oracle,
					price24hAgo: market.yesterday,
				}),
			};
		},

		async deploy({ spotNotional, perpMargin, leverageBps }) {
			const at = deps.now();
			const [p, priceE6, market] = await Promise.all([
				load(vaultAddress),
				spotPriceE6(),
				perpMarket(),
			]);
			if (priceE6 === null || market === null) throw new Error("Cannot price the legs to deploy.");

			// Spot: buy at the quote, minus slippage, so a paper fill is never
			// better than a real one would have been.
			const filled = afterSlippage(spotNotional);
			const unitsBought = (filled * 10n ** BigInt(config.spotTokenDecimals)) / priceE6;

			// Perp: short the same number of units, so the position stays neutral.
			// The entry price is a size-weighted blend, because a deposit grows the
			// existing short rather than opening a second one.
			const totalUnits = p.perpUnits + unitsBought;
			p.perpEntryPriceE6 =
				totalUnits === 0n
					? market.markE6
					: (p.perpEntryPriceE6 * p.perpUnits + market.markE6 * unitsBought) / totalUnits;
			p.perpUnits = totalUnits;
			p.perpMarginUsdc += perpMargin;
			p.spotUnits += unitsBought;
			p.spotCostUsdc += spotNotional;
			await save(vaultAddress, p);

			const notional = spotValue(unitsBought, priceE6);
			// Bridge, short, then spot — the same order the live adapter executes
			// in, so the paper feed reads like the real one. Paper fills are
			// instantaneous, so the ordering buys no risk reduction here; it exists
			// so an operator reading a paper vault's activity is reading the
			// sequence they will see in production.
			return [
				{
					kind: "BRIDGE_OUT",
					chain: "BASE",
					symbol: "USDC",
					baseAmount: perpMargin,
					notionalAssets: perpMargin,
					pnlAssets: 0n,
					feeAssets: 0n,
					txRef: paperRef(vaultAddress, "bridge-out", at),
					occurredAt: at,
				},
				{
					kind: "PERP_OPEN",
					chain: "SOLANA",
					symbol: config.perpSymbol,
					baseAmount: unitsBought,
					notionalAssets: notional,
					pnlAssets: 0n,
					feeAssets: 0n,
					txRef: paperRef(vaultAddress, `perp-open-${leverageBps}`, at),
					occurredAt: at,
				},
				{
					kind: "SPOT_BUY",
					chain: "BASE",
					symbol: config.symbol,
					baseAmount: unitsBought,
					notionalAssets: notional,
					pnlAssets: 0n,
					feeAssets: spotNotional - filled,
					txRef: paperRef(vaultAddress, "spot-buy", at),
					occurredAt: at,
				},
			];
		},

		async unwind({ amount }) {
			const at = deps.now();
			const [p, priceE6, market] = await Promise.all([
				load(vaultAddress),
				spotPriceE6(),
				perpMarket(),
			]);
			if (priceE6 === null || market === null) throw new Error("Cannot price the legs to unwind.");

			const spot = spotValue(p.spotUnits, priceE6);
			const equity = perpEquity(p, market.markE6);
			const total = spot + equity;
			if (total === 0n) throw new Error("Nothing deployed to unwind.");

			// Close a proportional slice of both legs, so the position stays neutral
			// through a partial withdrawal rather than leaving a naked leg behind.
			const wanted = amount > total ? total : amount;
			const unitsSold = (p.spotUnits * wanted) / total;
			const marginFreed = (p.perpMarginUsdc * wanted) / total;
			const fundingRealised = (p.fundingAccruedUsdc * wanted) / total;

			const proceeds = afterSlippage(spotValue(unitsSold, priceE6));
			const pnl = spotValue(unitsSold, market.markE6) - spotValue(unitsSold, p.perpEntryPriceE6);

			p.spotUnits -= unitsSold;
			p.spotCostUsdc -= (p.spotCostUsdc * wanted) / total;
			p.perpUnits -= (p.perpUnits * wanted) / total;
			p.perpMarginUsdc -= marginFreed;
			p.fundingAccruedUsdc -= fundingRealised;
			await save(vaultAddress, p);

			// The one real transaction: the vault has to actually be paid, or the
			// withdrawal queue cannot be fulfilled.
			const returned = proceeds + marginFreed + fundingRealised;
			const txRef = await deps.returnToVault(returned > 0n ? returned : 0n);

			return [
				{
					kind: "PERP_CLOSE",
					chain: "SOLANA",
					symbol: config.perpSymbol,
					baseAmount: unitsSold,
					notionalAssets: spotValue(unitsSold, market.markE6),
					pnlAssets: -pnl,
					feeAssets: 0n,
					txRef: paperRef(vaultAddress, "perp-close", at),
					occurredAt: at,
				},
				{
					kind: "SPOT_SELL",
					chain: "BASE",
					symbol: config.symbol,
					baseAmount: unitsSold,
					notionalAssets: proceeds,
					pnlAssets: pnl,
					feeAssets: 0n,
					txRef: paperRef(vaultAddress, "spot-sell", at),
					occurredAt: at,
				},
				{
					kind: "BRIDGE_IN",
					chain: "BASE",
					symbol: "USDC",
					baseAmount: returned,
					notionalAssets: returned,
					pnlAssets: 0n,
					feeAssets: 0n,
					// The only ref in here that names a real transaction.
					txRef,
					occurredAt: at,
				},
			];
		},

		async rebalance({ targetUnits }) {
			const at = deps.now();
			const [p, market] = await Promise.all([load(vaultAddress), perpMarket()]);
			if (market === null) throw new Error("Cannot price the perp to rebalance.");

			// `targetUnits` arrives on the 1e18 basis the worker compares legs on;
			// bring it back to the spot token's own decimals before storing it.
			const target = (targetUnits * 10n ** BigInt(config.spotTokenDecimals)) / 10n ** 18n;
			const delta = target - p.perpUnits;
			p.perpUnits = target;
			await save(vaultAddress, p);

			return [
				{
					kind: "PERP_REBALANCE",
					chain: "SOLANA",
					symbol: config.perpSymbol,
					baseAmount: delta < 0n ? -delta : delta,
					notionalAssets: spotValue(target, market.markE6),
					pnlAssets: 0n,
					feeAssets: 0n,
					txRef: paperRef(vaultAddress, "perp-rebalance", at),
					occurredAt: at,
				},
			];
		},
	};
}
