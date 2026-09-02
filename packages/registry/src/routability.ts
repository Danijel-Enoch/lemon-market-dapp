import type { TokenRoutability } from "@lemon/core";
import { toBaseUnits, USDC_ADDRESS, USDC_DECIMALS } from "@lemon/core";
import type { KyberAggregatorClient, QuoteResult } from "@lemon/kyber";
import { SPOT_TOKENS, type StockTokenSeed } from "./tokens";

/**
 * Notional used to probe whether a token is tradable. Small enough not to be
 * rejected for depth, large enough that a dust-only pool does not read as
 * liquid.
 */
const PROBE_USD = 100;

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
	kyber: KyberAggregatorClient,
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
	kyber: KyberAggregatorClient,
	token: StockTokenSeed,
): Promise<TokenRoutability> {
	const buyAmount = toBaseUnits(PROBE_USD, USDC_DECIMALS).toString();

	const buy = await quoteOnce(kyber, USDC_ADDRESS, token.address, buyAmount);

	// Fall back to a nominal unit when the buy leg produced no amount, so a
	// sell-only market is still detected.
	const sellAmount =
		buy.kind === "route" ? buy.quote.amountOut : toBaseUnits(1, token.decimals).toString();

	const sell = await quoteOnce(kyber, token.address, USDC_ADDRESS, sellAmount);

	return {
		symbol: token.symbol,
		buyable: buy.kind === "route",
		sellable: sell.kind === "route",
		buyPriceImpactPercent: buy.kind === "route" ? buy.quote.priceImpactPercent : null,
		// Only claim we know the answer when at least one leg got a real reply.
		probeFailed: buy.kind === "error" && sell.kind === "error",
		checkedAt: Date.now(),
	};
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
	kyber: KyberAggregatorClient,
	tokens: readonly StockTokenSeed[] = SPOT_TOKENS,
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
