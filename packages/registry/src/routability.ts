import type { QuoteResult, SpotAggregator, TokenRoutability } from "@lemon/core";
import { fromBaseUnits, toBaseUnits, USDC_DECIMALS, usdcFor } from "@lemon/core";
import { REFERENCE_NOTIONAL_USD } from "./basis";
import type { StockTokenSeed } from "./tokens";

/**
 * Notional used to probe whether a token is tradable, and at what cost.
 *
 * Tied to the size the board quotes at, not chosen independently. The probe's
 * measured price impact is what prices every row, so probing smaller than the
 * quote would understate slippage on exactly the thin pools where it matters
 * most — see `REFERENCE_NOTIONAL_USD`.
 *
 * It also makes routability mean something useful: a pool that cannot absorb
 * the size we quote is not a tradable market, however much dust sits in it.
 */
const PROBE_USD = REFERENCE_NOTIONAL_USD;

type ProbeOutcome =
	| { kind: "route"; quote: Extract<QuoteResult, { ok: true }>["quote"] }
	| { kind: "no_route" }
	| { kind: "error" };

/**
 * Quote one direction, distinguishing "no pool" from "the request failed".
 *
 * Retries on failure because KyberSwap rate-limits per client id, and the whole
 * registry is probed in one pass. Without this a throttled request is
 * indistinguishable from an empty pool — which showed up in practice as AERO
 * ($28M of liquidity) being reported as untradable.
 */
async function quoteOnce(
	kyber: SpotAggregator,
	tokenIn: string,
	tokenOut: string,
	amountIn: string,
	attempts = 3,
): Promise<ProbeOutcome> {
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			const result = await kyber.getRoute({
				tokenIn: tokenIn as `0x${string}`,
				tokenOut: tokenOut as `0x${string}`,
				amountIn,
			});
			// An explicit no-route answer is authoritative — do not retry it.
			return result.ok ? { kind: "route", quote: result.quote } : { kind: "no_route" };
		} catch {
			// Back off before retrying a transport or rate-limit failure.
			if (attempt < attempts - 1) {
				await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
			}
		}
	}
	return { kind: "error" };
}

/**
 * Probe live buy/sell routability for one token.
 *
 * Liquidity here is genuinely partial and shifting — several tokenized equities
 * have no Aerodrome pool at all, and which ones changes as liquidity moves — so
 * routability is measured rather than configured.
 *
 * The sell probe reuses the buy probe's output instead of a fixed quantity.
 * A fixed share count cannot work across this registry: 0.1 units is ~$25 of
 * NVDAc but ~$7,700 of cbBTC, which would fail on depth and mis-report a deep
 * market as unsellable. Quoting the round trip keeps both legs at the same
 * notional whatever the token is worth.
 */
export async function probeToken(
	kyber: SpotAggregator,
	token: StockTokenSeed,
): Promise<TokenRoutability> {
	const buyAmount = toBaseUnits(PROBE_USD, USDC_DECIMALS).toString();

	// The aggregator's own chain decides the quote asset. Probing an Arbitrum
	// token against Base's USDC address would find no pool and report a live
	// market as unroutable.
	const usdc = usdcFor(kyber.chainId);
	const buy = await quoteOnce(kyber, usdc, token.address, buyAmount);

	// Fall back to a nominal unit when the buy leg produced no amount, so a
	// sell-only market is still detected.
	const sellAmount =
		buy.kind === "route" ? buy.quote.amountOut : toBaseUnits(1, token.decimals).toString();

	const sell = await quoteOnce(kyber, token.address, usdc, sellAmount);

	return {
		symbol: token.symbol,
		buyable: buy.kind === "route",
		sellable: sell.kind === "route",
		buyPriceImpactPercent: buy.kind === "route" ? buy.quote.priceImpactPercent : null,
		spotPriceUsd:
			buy.kind === "route"
				? priceFromProbe(buy.quote.amountOut, token.decimals, buy.quote.priceImpactPercent)
				: null,
		// Only claim we know the answer when at least one leg got a real reply.
		probeFailed: buy.kind === "error" && sell.kind === "error",
		checkedAt: Date.now(),
	};
}

/**
 * The spot price implied by the probe, with the probe's own cost removed.
 *
 * The raw fill price — `PROBE_USD / units` — is *not* the spot price. It is the
 * spot price plus whatever the $100 trade paid in impact, and quoting it as the
 * spot leg makes every market appear to trade at a discount to its perp by
 * exactly the pool's slippage. That artifact is uniform enough across liquid
 * markets to look like a real basis, which is what makes it dangerous: the
 * board would show a consistent ~1% "spread" that is really just the cost of
 * measuring it.
 *
 * Backing the reported impact out recovers the pre-trade price, which is what
 * a perp mark is comparable to. The impact itself is kept separately and
 * charged to the position as a cost — it is real money, it is simply not part
 * of the spread.
 */
function priceFromProbe(amountOut: string, decimals: number, impactPercent: number): number | null {
	const units = Number(fromBaseUnits(amountOut, decimals));
	if (!Number.isFinite(units) || units <= 0) return null;

	// Impact is reported as a negative percentage of value lost. A pool broken
	// enough to report impact at or beyond -100% cannot be un-adjusted into
	// anything meaningful, so it produces no price rather than a nonsense one.
	const retained = 1 + (Number.isFinite(impactPercent) ? impactPercent : 0) / 100;
	if (retained <= 0) return null;

	return (PROBE_USD * retained) / units;
}

/**
 * Probe the whole registry.
 *
 * Concurrency is deliberately low. Fully sequential took ~30s for 13 tokens,
 * long enough to leave the page on skeletons; too much parallelism trips
 * KyberSwap's per-client rate limit and turns real liquidity into false
 * negatives. Two at a time with retries is the balance that holds for the
 * ~23-token registry.
 */
export async function probeAllTokens(
	kyber: SpotAggregator,
	/** One chain's tokens. No default — see `pairTokensWithMarkets` for why. */
	tokens: readonly StockTokenSeed[],
	concurrency = 2,
): Promise<TokenRoutability[]> {
	const results: TokenRoutability[] = new Array(tokens.length);
	let cursor = 0;

	async function worker() {
		while (cursor < tokens.length) {
			const index = cursor++;
			results[index] = await probeToken(kyber, tokens[index]);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, tokens.length) }, () => worker()));
	return results;
}
