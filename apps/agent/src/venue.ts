import { BPS } from "@lemon/contracts";
import { adlRisk, formatDuration, type LogLevel } from "@lemon/core";
import type { KyberAggregatorClient } from "@lemon/kyber";
import {
	isAccountNotFound,
	type PacificaAccountInfo,
	type PacificaClient,
	type PacificaPosition,
} from "@lemon/pacifica";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { erc20Abi, parseUnits } from "viem";
import { MIN_DEPLOY_USDC } from "./policy";
import { confirmed } from "./tx";
import { fromUnits, toUnits, type Valuation, value } from "./valuation";
import type { ActivityInput } from "./vault";
import { type VenueAdapter, VenueExecutionError } from "./worker";

/**
 * The real venue adapter: Kyber on Base for spot, Pacifica on Solana for the perp.
 *
 * Everything that touches money is here, and everything here reports what it
 * did. The `ActivityInput[]` each method returns is not logging — it is the
 * public record, and a leg that executes without producing a row is a leg that
 * moved user funds invisibly.
 *
 * Bridging is the part that needs the most care. USDC leaving Base for Solana is
 * out of both chains for minutes, and a naive valuation reads that gap as a
 * loss. The adapter tracks in-flight amounts explicitly so the NAV stays
 * continuous across a bridge rather than dipping and recovering.
 *
 * Capital moves in a loop, and both halves of it live here. `deploy` takes USDC
 * the worker has drawn from the vault and spreads it across the two venues;
 * `unwind` collects it back off them and hands it to the vault. The second half
 * is the one a depositor depends on: until USDC is back inside the contract it
 * is not `freeAssets`, and a redemption cannot be fulfilled out of a position
 * that has already been sold to pay for it.
 *
 * **Several markets, one account.** A vault may run a basis position in more
 * than one market, and the split between what is per-market and what is shared
 * is the thing to keep straight here. Each market has its own Base token
 * balance, its own Kyber route and its own Pacifica symbol; all of them share
 * one Pacifica account, one Base wallet, one Solana wallet and one bridge. So
 * spot legs are read, priced and traded per market, while equity, idle USDC,
 * in-flight capital and margin repatriation happen once for the vault. Building
 * this as N independent single-market adapters would have counted the shared
 * balances N times and reported a three-market vault as worth roughly three
 * times its margin.
 */
/**
 * A spot sell quote with the two costs the aggregator already measured.
 *
 * `value` keeps its old meaning exactly — null is "no pool", which the valuation
 * treats as unpriceable rather than worthless. The other two are only meaningful
 * when it is non-null, and are zero otherwise.
 */
interface SpotRoute {
	value: bigint | null;
	/** The aggregator's own gas estimate for this swap, in USD. */
	gasUsd: number;
	/** How much crossing the pool costs, as a positive percent of notional. */
	impactPercent: number;
}

export interface VenueMarket {
	/** The market's ticker, e.g. "NVDA". How every caller names it. */
	ticker: string;
	/** The Base token's own symbol, e.g. "NVDAc". What the activity feed shows. */
	symbol: string;
	/** The Base ERC-20 that is this market's spot leg. */
	spotToken: Address;
	spotTokenDecimals: number;
	/** Pacifica's wire symbol for this market's perp leg, e.g. "NVDA". */
	perpSymbol: string;
	/** The share of the vault's spot notional this market should carry, in bps. */
	targetWeightBps: number;
}

export interface VenueConfig {
	/** Every market the vault holds or may deploy into. Never empty. */
	markets: VenueMarket[];
	usdc: Address;
	/** The agent's Solana address, which is also its Pacifica account id. */
	solanaAddress: string;
	agentAddress: Address;
	/** Slippage for market orders and swaps, as a percent: 0.5 means 0.5%. */
	slippagePercent: number;
}

export interface VenueDeps {
	config: VenueConfig;
	publicClient: PublicClient;
	walletClient: WalletClient;
	kyber: KyberAggregatorClient;
	pacifica: PacificaClient;
	/** Pacifica's canonical-payload signer, bound to this agent's derivation path. */
	signPacifica: (message: string) => Promise<string>;
	/** Moves USDC between Base and Solana. Returns once the funds have landed. */
	bridge: BridgeAdapter;
	/**
	 * Sends USDC from the agent wallet back to the vault. Real, on-chain.
	 *
	 * A callback rather than the `VaultClient` itself. The adapter's job is to
	 * turn a position into USDC at the agent's Base wallet; which vault that USDC
	 * belongs to is the worker's knowledge, and handing the whole client over
	 * here would let a venue adapter report NAV or fulfil a redemption — neither
	 * of which it has any business doing.
	 */
	returnToVault: (amount: bigint) => Promise<Hex>;
	/** In-flight tracking, so a bridge does not read as a loss. */
	inFlight: () => bigint;
	/**
	 * USDC sitting in the agent's *Solana* wallet, outside Pacifica.
	 *
	 * Ordinarily zero: the bridge deposits what it delivers in the same call. It
	 * is non-zero exactly when something went wrong between the two — a fill
	 * below Pacifica's deposit minimum, a deposit that failed after the money
	 * arrived — and those are the cases where leaving it out of the valuation
	 * would report a vault that had simply lost the transfer.
	 */
	solanaIdleUsdc: () => Promise<bigint>;
	now: () => number;
	/**
	 * Where the adapter narrates its steps.
	 *
	 * Optional, and a no-op when absent, so a test harness does not have to
	 * supply one. In the running agent it is always set — this is the layer that
	 * places the orders, so a tick that has stopped moving has almost always
	 * stopped inside one of these methods, and the last line it printed is what
	 * says which.
	 */
	log?: (level: LogLevel, message: string, extra?: unknown) => void;
}

export interface BridgeAdapter {
	toSolana(amountUsdc: bigint): Promise<{ txRef: Hex; landed: bigint }>;
	/**
	 * Bring USDC home from the agent's Solana wallet.
	 *
	 * Called immediately after a Pacifica withdrawal, which settles to that
	 * wallet on the venue's schedule rather than the caller's — so an
	 * implementation must wait for the balance to be spendable rather than
	 * assuming it already is. Stated here because it is the one thing about this
	 * method that cannot be inferred from its signature, and getting it wrong
	 * fails an unwind that has already closed both legs.
	 */
	toBase(amountUsdc: bigint): Promise<{ txRef: Hex; landed: bigint }>;
}

/**
 * How long a deployment waits for Pacifica to register a brand-new account.
 *
 * Generous, because the alternative is worse than the wait: the margin has
 * already crossed by this point, and giving up returns an unhedged deposit
 * sitting on the wrong chain. The venue indexes a confirmed deposit in seconds,
 * so this ceiling is for the day it does not.
 */
const REGISTRATION_TIMEOUT_MS = 120_000;
const REGISTRATION_POLL_MS = 5_000;

export function createVenueAdapter(deps: VenueDeps): VenueAdapter {
	const { config, publicClient, kyber, pacifica } = deps;
	const log: NonNullable<VenueDeps["log"]> = deps.log ?? (() => {});

	if (config.markets.length === 0) {
		throw new Error("A venue adapter needs at least one market to trade.");
	}

	/**
	 * The configuration for one market, or a refusal.
	 *
	 * Every entry point that names a market comes through here. Throwing on an
	 * unknown ticker rather than falling back to the first market is the point: a
	 * silent fallback would execute a BTC-sized deployment against NVDA's pool
	 * and hedge it with NVDA's perp, and every dashboard would read healthy.
	 */
	function marketFor(ticker: string): VenueMarket {
		const market = config.markets.find((m) => m.ticker === ticker);
		if (!market) {
			throw new Error(
				`${ticker} is not one of this vault's markets (${config.markets.map((m) => m.ticker).join(", ")}).`,
			);
		}
		return market;
	}

	async function spotBalance(market: VenueMarket): Promise<bigint> {
		return publicClient.readContract({
			abi: erc20Abi,
			address: market.spotToken,
			functionName: "balanceOf",
			args: [config.agentAddress],
		});
	}

	/**
	 * What one market's whole spot holding would fetch if sold now, and what
	 * selling it would cost.
	 *
	 * Quoted at the full size rather than a unit price scaled up. A tokenized
	 * equity on a thin Aerodrome pool moves several percent against a real-sized
	 * sale, so a unit quote multiplied out reports a holding the vault cannot
	 * actually liquidate at that price — and that error lands directly in every
	 * holder's share value.
	 *
	 * **The cost fields are returned rather than discarded.** This used to hand
	 * back `amountOut` alone and drop the rest of the quote on the floor, which
	 * meant the agent paid for a route carrying a gas estimate and a price impact
	 * every single tick and then decided what to trade with no idea what trading
	 * cost. They are the entire input to `economics.ts`, and they are free: the
	 * route is already fetched, already parsed, already thrown away.
	 */
	async function spotSellRoute(market: VenueMarket, balance: bigint): Promise<SpotRoute> {
		if (balance === 0n) return { value: 0n, gasUsd: 0, impactPercent: 0 };
		try {
			const route = await kyber.getRoute({
				tokenIn: market.spotToken,
				tokenOut: config.usdc,
				amountIn: balance.toString(),
				slippagePercent: config.slippagePercent,
			});
			// `QuoteResult` is a discriminated union: `ok: false` is "no pool",
			// which is ordinary state. The quote's fields sit under `quote`, not at
			// the top level — reading `routeSummary.amountOut` off the envelope
			// yields undefined and prices every holding at null.
			if (!route.ok) return { value: null, gasUsd: 0, impactPercent: 0 };
			return {
				value: BigInt(route.quote.amountOut),
				gasUsd: route.quote.gasUsd,
				// Kyber reports impact as a signed percent, negative when the trade
				// loses value crossing the pool. A cost is a cost whichever way it is
				// signed, so it is carried as a magnitude.
				impactPercent: Math.abs(route.quote.priceImpactPercent),
			};
		} catch {
			// Null, not zero. An unroutable pool is an unknown value, and the
			// valuation layer refuses to price it rather than marking it to zero.
			return { value: null, gasUsd: 0, impactPercent: 0 };
		}
	}

	async function usdcBalance(owner: Address): Promise<bigint> {
		return publicClient.readContract({
			abi: erc20Abi,
			address: config.usdc,
			functionName: "balanceOf",
			args: [owner],
		});
	}

	/**
	 * The account, or null when Pacifica has never seen it.
	 *
	 * Null is the ordinary state of a vault that has not yet deployed: the venue
	 * has no registration call, and an account is created by its first deposit —
	 * which the agent makes, out of `deploy`, with the vault's own capital. So an
	 * unregistered account means "no margin here yet", which is exactly what a
	 * fresh vault holds, and it is priced as zero rather than raised as an error.
	 *
	 * Reading it as an error is what wedged every new vault. `observe` runs before
	 * anything else in a tick, so a throw here ended the tick — and the deployment
	 * that would have created the account lives further down that same tick.
	 * Nothing outside the loop breaks that, because the money only ever moves from
	 * inside it.
	 */
	async function accountOrUnregistered(): Promise<PacificaAccountInfo | null> {
		try {
			return await pacifica.accountInfo(config.solanaAddress);
		} catch (error) {
			if (!isAccountNotFound(error)) throw error;
			log(
				"info",
				`Pacifica has no account for ${config.solanaAddress} yet — it is created by the first deposit, which the next deployment makes. Pricing the perp leg at zero until then.`,
			);
			return null;
		}
	}

	/**
	 * Margin at the venue that is not backing an open position.
	 *
	 * The venue's own figure rather than equity less something computed here.
	 * `available_to_spend` is exactly this question asked of the account that
	 * knows the answer, and it already nets off the maintenance margin every open
	 * position holds — which a subtraction on this side would have to reconstruct
	 * from position sizes and get wrong the first time the venue changed a
	 * requirement.
	 */
	async function unallocatedMargin(): Promise<bigint> {
		const account = await accountOrUnregistered();
		// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
		const free = Number((account as any)?.available_to_spend ?? 0);
		return free > 0 ? BigInt(Math.round(free * 1e6)) : 0n;
	}

	/** Positions for an account the venue has never seen: none, not an error. */
	async function positionsOrNone(): Promise<PacificaPosition[]> {
		try {
			return await pacifica.positions(config.solanaAddress);
		} catch (error) {
			if (!isAccountNotFound(error)) throw error;
			return [];
		}
	}

	/**
	 * Wait for Pacifica to know the account the deposit just created.
	 *
	 * Only ever reached on a vault's *first* deployment, and only once the money
	 * has already crossed. The deposit is confirmed on Solana by the time the
	 * bridge returns, but the venue registers it in its own index a moment later —
	 * and the next step of a deployment is a signed call against that account. A
	 * deployment that walked straight on would fail with the margin already on the
	 * far chain and nothing hedged against it.
	 *
	 * Costs one read when the account is already known, which is every deployment
	 * after the first.
	 */
	async function awaitRegistration(activity: ActivityInput[]): Promise<void> {
		const deadline = Date.now() + REGISTRATION_TIMEOUT_MS;
		for (;;) {
			try {
				await pacifica.accountInfo(config.solanaAddress);
				return;
			} catch (error) {
				if (!isAccountNotFound(error)) throw error;
				if (Date.now() >= deadline) {
					// The deposit landed, so the margin is in the venue's custody and the
					// activity rows above say so. Thrown as a venue error rather than a
					// plain one for exactly that reason: the legs that did happen have to
					// reach the public record, and a later tick deploys against the
					// account once it appears.
					throw new VenueExecutionError(
						`The margin was deposited but Pacifica still does not know ${config.solanaAddress} after ${formatDuration(REGISTRATION_TIMEOUT_MS)}. The USDC is with the venue and no position was opened.`,
						activity,
					);
				}
				log(
					"info",
					`Waiting for Pacifica to register ${config.solanaAddress} — the deposit that creates the account has landed.`,
				);
				await sleep(REGISTRATION_POLL_MS);
			}
		}
	}

	return {
		/**
		 * Read every market's legs and the account they share, and price the lot.
		 *
		 * The venue reads happen once and are reused across markets: `accountInfo`,
		 * `positions`, `prices` and `markets` are all account- or exchange-wide, so
		 * fetching them per market would multiply the request count by the number
		 * of markets and get the agent rate-limited for no new information. Only the
		 * Base token balance and the Kyber sell quote are genuinely per market, and
		 * those run concurrently.
		 */
		async observe() {
			// `prices()`, not `markets()`. Market info is the venue's *spec* — tick
			// size, lot size, leverage caps, funding rate — and carries no mark at
			// all, so the old fallback to `market.mark_price` was reading undefined
			// and the position was being valued at its entry price forever.
			//
			// The two account reads tolerate an account Pacifica has never seen, which
			// is what a vault holds before its first deployment. Everything else in
			// this list is exchange-wide or on-chain and answers for any address.
			const [account, positions, prices, venueMarkets, baseIdle, solanaIdle, withdrawalFee] =
				await Promise.all([
					accountOrUnregistered(),
					positionsOrNone(),
					pacifica.prices(),
					pacifica.markets(),
					usdcBalance(config.agentAddress),
					deps.solanaIdleUsdc(),
					// Exchange-wide, and charged on every unwind. Best-effort because it
					// is a cost input rather than a safety check: a vault that cannot
					// read it should price the unwind slightly optimistically, not stop
					// trading. Zero is the honest fallback — an unknown fee is not a
					// reason to refuse an action a depositor is waiting on.
					venueWithdrawalFee(deps).catch(() => 0n),
				]);

			// Both wallets, because the vault owns both. Idle USDC on either side is
			// capital the vault holds and has not deployed, and counting only Base
			// would price a stalled bridge as a loss. Counted once for the vault,
			// never once per market — see the note at the top of this file.
			const idleUsdc = baseIdle + solanaIdle;

			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const equityUsd = Number((account as any)?.account_equity ?? 0);
			const equity = BigInt(Math.round(equityUsd * 1e6));
			// Read off the account already fetched above rather than through
			// `unallocatedMargin`, which would repeat the request.
			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const freeMarginUsd = Math.max(0, Number((account as any)?.available_to_spend ?? 0));

			const legs = await Promise.all(
				config.markets.map(async (market) => {
					const balance = await spotBalance(market);
					const route = await spotSellRoute(market, balance);
					const sellQuote = route.value;

					const position = positions.find((p) => p.symbol === market.perpSymbol);
					const spec = venueMarkets.find((m) => m.symbol === market.perpSymbol);
					const price = prices.find((q) => q.symbol === market.perpSymbol);

					// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
					const perpSize = Number((position as any)?.amount ?? 0);
					// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
					const entryPrice = Number((position as any)?.entry_price ?? 0);
					const mark = Number(price?.mark ?? 0);
					// Mark for the notional, with entry as the fallback: an unpriced mark
					// should not silently value the leg at zero.
					const markPrice = Number.isFinite(mark) && mark > 0 ? mark : entryPrice;

					return {
						market,
						balance,
						sellQuote,
						perpSize,
						markPrice,
						// The venue's own order constraints, carried so the policy can
						// refuse a correction the venue would reject. They are two
						// different measures and neither substitutes for the other:
						// `lot_size` is a quantity grid in units of the underlying, and
						// `min_order_size` is a floor on the order's *dollar* notional.
						// Snapping to the first gives no protection against the second,
						// which is how a 0.002 NVDA rebalance worth $0.45 was sent to a
						// venue with a $10 minimum, every minute, and rejected every time.
						// Read off the typed spec, not through a cast. The cast these two
						// were originally written with is the same one that hid the
						// unrealised-PnL bug in the API for months: it reads a key that may
						// not exist and answers `undefined` instead of failing to compile.
						// Both of these fields are on `PacificaMarketInfo` and always have
						// been.
						lotSize: numberOrNull(spec?.lot_size) ?? 0,
						minOrderUsd: numberOrNull(spec?.min_order_size) ?? 0,
						spotGasUsd: route.gasUsd,
						spotImpactPercent: route.impactPercent,
						notional: BigInt(Math.round(Math.abs(perpSize) * markPrice * 1e6)),
						// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
						fundingHourly: Number((spec as any)?.funding_rate ?? 0) * 100,
						// Scored off the live mark, not the entry fallback. A stale mark
						// would report zero profit and so zero queue position — silence in
						// exactly the state that most warrants a warning.
						//
						// Per market because the venue deleverages per symbol: one leg can
						// be near the front of its queue while the rest are nowhere near
						// theirs, and an account-wide average would hide it.
						adl: adlRisk({
							side: "short",
							entryPrice: entryPrice > 0 ? entryPrice : null,
							markPrice: Number.isFinite(mark) && mark > 0 ? mark : null,
							size: perpSize,
							// The account's equity, because that is what backs this leg.
							// Pacifica margins the account, not the symbol.
							equityUsd: equityUsd > 0 ? equityUsd : null,
							oraclePrice: numberOrNull(price?.oracle),
							price24hAgo: numberOrNull(price?.yesterday_price),
						}),
					};
				}),
			);

			// Throws if any leg holds tokens it cannot price, which stales the whole
			// vault rather than reporting a NAV short by that leg.
			const valuation: Valuation = value({
				legs: legs.map((leg) => ({
					ticker: leg.market.ticker,
					spotTokenBalance: leg.balance,
					spotTokenDecimals: leg.market.spotTokenDecimals,
					spotSellQuoteUsdc: leg.sellQuote,
				})),
				perpEquityUsdc: equity,
				// Every short's notional together, against the one equity backing them.
				perpNotionalUsdc: legs.reduce((total, leg) => total + leg.notional, 0n),
				idleAtAgentUsdc: idleUsdc,
				inFlightUsdc: deps.inFlight(),
			});

			const markets = legs.map((leg) => ({
				ticker: leg.market.ticker,
				symbol: leg.market.symbol,
				perpSymbol: leg.market.perpSymbol,
				targetWeightBps: leg.market.targetWeightBps,
				spotValueUsdc: leg.sellQuote ?? 0n,
				spotUnits: toUnits(leg.balance, leg.market.spotTokenDecimals),
				// Perp size is a decimal count of units; scale it to the same 1e18
				// basis so the two legs are comparable.
				perpUnits: BigInt(Math.round(Math.abs(leg.perpSize) * 1e18)),
				// Pacifica quotes one rate where positive means longs pay shorts,
				// so the short side receives exactly this. See the README.
				fundingShortPercentPerHour: leg.fundingHourly,
				spotBuyable: leg.sellQuote !== null,
				spotSellable: leg.sellQuote !== null,
				markPriceUsd: leg.markPrice,
				lotSize: leg.lotSize,
				minOrderUsd: leg.minOrderUsd,
				spotGasUsd: leg.spotGasUsd,
				spotImpactPercent: leg.spotImpactPercent,
				adl: leg.adl,
			}));

			return {
				valuation,
				markets,
				// Reported separately from the valuation's combined idle figure: only
				// the Base side can buy a spot leg or fund a bridge, so it is the only
				// side a deployment can be sized against.
				idleOnBase: baseIdle,
				unallocatedMargin: BigInt(Math.round(freeMarginUsd * 1e6)),
				// Account-level, not per market: one withdrawal brings home the margin
				// freed by closing legs in any number of markets, so it is charged once
				// per unwind rather than once per leg.
				venueWithdrawalFeeUsdc: withdrawalFee,
				// The worst leg, because a warning about the vault should be about the
				// leg most likely to be deleveraged out from under it rather than an
				// average that never describes any actual position.
				adl: markets.reduce((worst, m) => (m.adl.lamps > worst.adl.lamps ? m : worst), markets[0])
					.adl,
			};
		},

		/**
		 * Put capital to work by *growing the existing position*, not opening a
		 * second one.
		 *
		 * This is what a new deposit does. The bridged margin tops up the same
		 * Pacifica account, the market order increases the size of the short that is
		 * already open — Pacifica nets per symbol, so a second ask deepens the
		 * existing position rather than creating a parallel one — and the spot buy
		 * adds to the token balance the agent already holds.
		 *
		 * That is the behaviour a pooled vault needs. Separate positions per deposit
		 * would fragment the book, pay entry fees repeatedly on the same exposure,
		 * and make a partial unwind for one withdrawal ambiguous about which
		 * position to close.
		 *
		 * **The perp leg goes first, and it is the leg that sets the size.** A
		 * bridge does not deliver what it was handed: fees and the relayer's cut
		 * come out in transit, so the margin that arrives on Solana is smaller than
		 * the margin that left Base, and by an amount nobody knows until it lands.
		 * Buying spot first commits to a notional the surviving margin may not be
		 * able to carry at the vault's mandated leverage — and the shortfall is
		 * multiplied by that leverage, so a bridge fee of a few dollars can put a 3x
		 * vault over its leverage cap and have its own NAV reports rejected.
		 *
		 * So: bridge, see what arrived, size the hedge to that, and buy exactly that
		 * much spot. The perp is the anchor and spot follows it, rather than spot
		 * being bought on an assumption the perp then has to live up to.
		 *
		 * The ordering pays a second dividend. The short cannot open until its
		 * margin has crossed, and that crossing takes minutes; buying spot first
		 * meant carrying an unhedged long, at the full deposit, for all of them.
		 * Bridging first costs nothing directionally — USDC in flight is not
		 * exposure — and opening the short immediately before the swap leaves a
		 * naked leg for exactly one Base transaction.
		 *
		 * **One market per call.** A vault running several deploys into one of them
		 * at a time, chosen by the policy as whichever is furthest below its target
		 * weight. The five steps below have no atomic form across two chains and a
		 * venue's matching engine, so doing them for several markets in one call
		 * would multiply the ways to end up half-open without buying anything the
		 * next tick does not.
		 */
		async deploy({ market: ticker, spotNotional, perpMargin, leverageBps }) {
			const market = marketFor(ticker);
			const activity: ActivityInput[] = [];
			const startedAt = performance.now();

			log(
				"info",
				`deploy ${market.ticker}: ${usd(spotNotional)} spot + ${usd(perpMargin)} margin at ${(leverageBps / 10_000).toFixed(2)}x — 5 steps.`,
			);

			// 0. Prove the spot leg is routable before any money leaves Base.
			// Bridging first and discovering afterwards that the pool cannot fill
			// strands the margin on Solana with nothing to hedge and a slow way back.
			log("debug", `deploy ${market.ticker}: step 0/5 — probing the ${market.symbol} route.`);
			const probe = await kyber.getRoute({
				tokenIn: config.usdc,
				tokenOut: market.spotToken,
				amountIn: spotNotional.toString(),
				slippagePercent: config.slippagePercent,
			});
			if (!probe.ok) throw new Error(`No spot route for ${market.symbol}: ${probe.message}`);

			// 1. Margin across to Solana. Nothing is exposed while it flies.
			//
			// Skipped entirely when the policy asked for no margin, which means it
			// is already at the venue: a previous deployment bridged it and failed
			// before opening the short. Bridging again would add margin to margin
			// that is already unhedged and leave the spot leg just as missing — so
			// this deployment buys spot against what is there and sends nothing.
			let backing: bigint;
			if (perpMargin === 0n) {
				backing = await unallocatedMargin();
				log(
					"info",
					`deploy ${market.ticker}: step 1/5 skipped — ${usd(backing)} of margin is already at the venue, so this buys the spot leg only.`,
				);
			} else {
				log(
					"info",
					`deploy ${market.ticker}: step 1/5 — bridging ${usd(perpMargin)} of margin to Solana.`,
				);
				const bridged = await deps.bridge.toSolana(perpMargin);
				backing = bridged.landed;
				log(
					"info",
					`deploy ${market.ticker}: step 1/5 done — ${usd(bridged.landed)} arrived (${usd(perpMargin - bridged.landed)} lost in transit).`,
				);
				activity.push({
					kind: "BRIDGE_OUT",
					chain: "BASE",
					symbol: "USDC",
					baseAmount: perpMargin,
					notionalAssets: perpMargin,
					pnlAssets: 0n,
					feeAssets: perpMargin > bridged.landed ? perpMargin - bridged.landed : 0n,
					txRef: bridged.txRef,
					occurredAt: deps.now(),
				});
				activity.push({
					kind: "VENUE_DEPOSIT",
					chain: "SOLANA",
					symbol: "USDC",
					baseAmount: bridged.landed,
					notionalAssets: bridged.landed,
					pnlAssets: 0n,
					feeAssets: 0n,
					txRef: bridged.txRef,
					occurredAt: deps.now(),
				});
			}

			// 2. Leverage is set before the order, not after — an order placed at the
			// account's previous leverage would open at the wrong size and have to be
			// corrected, paying taker fees twice.
			//
			// Preceded by the registration wait, because this is the first signed call
			// against the account and on a vault's first deployment the account is
			// seconds old: the deposit inside the bridge above is what created it.
			await awaitRegistration(activity);
			//
			// Rounded *up*, and never below 1. This is the venue's own ceiling on the
			// account, not the leverage the order is placed at — the agent decides that
			// by how much margin it posts, and it deliberately posts more than the
			// mandate's minimum (see `MARGIN_BUFFER_BPS`). Rounding to nearest would
			// take a hedge sized at 2.05x down to a venue setting of 2x, and the venue
			// would then reject the order for insufficient margin against its own
			// stricter requirement. Rounding up can only make the venue more
			// permissive than the agent is being, which is the safe direction.
			const venueLeverage = Math.max(1, Math.ceil(leverageBps / 10_000));
			log(
				"debug",
				`deploy ${market.ticker}: step 2/5 — setting ${market.perpSymbol} leverage to ${venueLeverage}x.`,
			);
			await pacifica.updateLeverage(deps.signPacifica, {
				account: config.solanaAddress,
				symbol: market.perpSymbol,
				leverage: venueLeverage,
			});

			// 3. Size both legs to the margin that actually arrived.
			//
			// `perpMargin` was sized against the deposit; `bridged.landed` is what
			// survived the crossing. At the vault's leverage the difference is
			// magnified L-fold, so this is where the hedge notional is decided and
			// `spotNotional` becomes an upper bound rather than an instruction.
			//
			// Whatever is not spent stays as idle USDC at the agent wallet. The
			// valuation already counts it, so no NAV moves; it is simply deployed on
			// a later tick once it is worth another round trip of fees.
			const carriable = (backing * BigInt(leverageBps)) / 10_000n;
			const spend = carriable < spotNotional ? carriable : spotNotional;
			if (spend < MIN_DEPLOY_USDC) {
				throw new VenueExecutionError(
					perpMargin === 0n
						? `The ${backing} USDC of margin already at the venue carries ${spend} of hedge — below the deploy minimum. Nothing was sent and no position was opened.`
						: `Only ${backing} of ${perpMargin} USDC survived the bridge, which carries ${spend} of hedge — below the deploy minimum. Margin is on Solana and no position was opened.`,
					activity,
				);
			}

			log(
				"info",
				`deploy ${market.ticker}: step 3/5 — the surviving margin carries ${usd(spend)} of hedge (asked for ${usd(spotNotional)}).`,
			);

			// Quoted *now*, not reused from the probe above. The probe is minutes old
			// by this point and priced a market that has moved since; sizing the hedge
			// off it would bake the bridge's duration into the hedge ratio as drift.
			const route = await kyber.getRoute({
				tokenIn: config.usdc,
				tokenOut: market.spotToken,
				amountIn: spend.toString(),
				slippagePercent: config.slippagePercent,
			});
			if (!route.ok) {
				throw new VenueExecutionError(
					`Margin bridged but no spot route for ${market.symbol}: ${route.message}`,
					activity,
				);
			}
			const built = await kyber.buildRoute({
				routeSummary: route.quote.routeSummary,
				sender: config.agentAddress,
				recipient: config.agentAddress,
				slippagePercent: config.slippagePercent,
			});
			const expectedUnits = BigInt(built.amountOut ?? 0);
			if (expectedUnits === 0n) {
				throw new VenueExecutionError(
					`Margin bridged but the ${market.symbol} route quoted zero output; refusing to short against nothing.`,
					activity,
				);
			}

			// The Kyber quote's output is a token amount to eight or eighteen
			// decimals; the venue trades on a grid three or four decimals coarse.
			// Snapped before the order and *before* the swap, so a size the venue
			// would reject fails here — with the spot leg still unbought and nothing
			// naked — rather than as a rejected order against a position that is
			// already half open.
			const lot = await lotUnits(deps, market, market.spotTokenDecimals);
			const shortUnits = snapToLot(expectedUnits, lot);
			if (shortUnits === 0n) {
				throw new VenueExecutionError(
					`The ${market.symbol} route quotes ${formatUnitsForVenue(expectedUnits, market.spotTokenDecimals)}, below Pacifica's ${formatUnitsForVenue(lot, market.spotTokenDecimals)} lot size for ${market.perpSymbol}. Nothing was bought and no position was opened.`,
					activity,
				);
			}

			// The approval goes here rather than beside the swap, so the window in
			// which the short is naked is one transaction and not two.
			await ensureAllowance(deps, config.usdc, built.routerAddress as Address, spend);

			// 4. The short, sized on that quote.
			log(
				"info",
				`deploy ${market.ticker}: step 4/5 — shorting ${formatUnitsForVenue(shortUnits, market.spotTokenDecimals)} ${market.perpSymbol} on Pacifica${
					shortUnits === expectedUnits
						? ""
						: ` (${formatUnitsForVenue(expectedUnits, market.spotTokenDecimals)} quoted, rounded down to the venue's lot grid)`
				}.`,
			);
			const receipt = await pacifica.createMarketOrder(deps.signPacifica, {
				account: config.solanaAddress,
				symbol: market.perpSymbol,
				side: "ask",
				amount: formatUnitsForVenue(shortUnits, market.spotTokenDecimals),
				slippagePercent: String(config.slippagePercent),
			});
			activity.push({
				kind: "PERP_OPEN",
				chain: "SOLANA",
				symbol: market.perpSymbol,
				baseAmount: shortUnits,
				notionalAssets: spend,
				pnlAssets: 0n,
				feeAssets: 0n,
				// biome-ignore lint/suspicious/noExplicitAny: receipt shape varies.
				txRef: refToHex(String((receipt as any).order_id ?? "")),
				occurredAt: deps.now(),
			});

			// 5. The spot leg, immediately. Balances are read either side of the swap
			// because the quote is a promise and the fill is the fact — and the gap
			// between them is the residual delta the next tick has to rebalance away.
			log(
				"info",
				`deploy ${market.ticker}: step 5/5 — buying the spot leg with ${usd(spend)}; the short is naked until this confirms.`,
			);
			const before = await spotBalance(market);
			let swapTx: Hex;
			try {
				swapTx = await deps.walletClient.sendTransaction({
					// biome-ignore lint/suspicious/noExplicitAny: account is set by the caller.
					account: deps.walletClient.account as any,
					chain: null,
					to: built.routerAddress as Address,
					data: built.data as Hex,
					value: 0n,
				});
				await confirmed(publicClient, swapTx, `The ${market.symbol} spot buy`);
			} catch (error) {
				// The short is open and there is nothing behind it. Unwinding it here
				// is not tidiness — leaving it until the next tick means holding a
				// leveraged naked short across a tick interval, which is the exposure
				// this whole ordering exists to avoid.
				await closeNaked(deps, market, shortUnits, activity);
				throw new VenueExecutionError(
					`Spot buy failed for ${market.symbol}; the short opened against it was closed.`,
					activity,
					{ cause: error },
				);
			}

			const received = (await spotBalance(market)) - before;
			log(
				"info",
				`deploy ${market.ticker}: hedged in ${formatDuration(performance.now() - startedAt)} — ${formatUnitsForVenue(received, market.spotTokenDecimals)} ${market.symbol} bought against a ${formatUnitsForVenue(shortUnits, market.spotTokenDecimals)} short.`,
			);
			activity.push({
				kind: "SPOT_BUY",
				chain: "BASE",
				symbol: market.symbol,
				baseAmount: received,
				notionalAssets: spend,
				pnlAssets: 0n,
				feeAssets: 0n,
				txRef: swapTx,
				occurredAt: deps.now(),
			});

			return activity;
		},

		/**
		 * Turn part of the position back into USDC *in the vault*.
		 *
		 * The last step is the one that matters. Closing legs leaves the proceeds at
		 * the agent's own wallets, where `freeAssets` does not count them and
		 * `fulfillRedeem` cannot pay from them — so an unwind that stops at the
		 * venues has sold a depositor's position without moving them any closer to
		 * being paid, and the queue stalls with the money already out of the market.
		 * `returnToVault` is what closes that loop.
		 *
		 * **Where the money comes from is decided here, not by the policy.** The
		 * caller asks for an amount; the allocation across markets needs live sell
		 * quotes, and a quote the policy fetched a moment earlier would be stale by
		 * the time the order was placed. It comes out of whichever markets are
		 * furthest above their target weight, so raising cash and correcting the
		 * weights are the same trade rather than two.
		 *
		 * The venue-side steps — repatriating margin and returning to the vault —
		 * happen once at the end however many markets were touched. They are
		 * account-level operations, and doing them per market would pay a bridge fee
		 * per market to move USDC that is already sitting in one wallet.
		 */
		async unwind({ amount, leverageBps }) {
			const activity: ActivityInput[] = [];
			const startedAt = performance.now();

			log("info", `unwind: raising ${usd(amount)} across ${config.markets.length} market(s).`);

			const legs = await Promise.all(
				config.markets.map(async (market) => {
					const balance = await spotBalance(market);
					return { market, balance, value: (await spotSellRoute(market, balance)).value };
				}),
			);

			const priced = legs.filter((leg) => leg.value !== null && leg.value > 0n);
			if (priced.length === 0) {
				throw new Error(
					"No spot leg can be priced, so an unwind cannot be sized against any of them.",
				);
			}

			const allocations = allocateUnwind(
				legs.map((leg) => ({
					ticker: leg.market.ticker,
					value: leg.value ?? 0n,
					targetWeightBps: leg.market.targetWeightBps,
					// An unpriceable leg is one nothing can be raised from. It still
					// counts toward the weights, so a market whose pool has dried up does
					// not make every other market look overweight.
					sellable: leg.value !== null,
				})),
				amount,
			);

			log(
				"info",
				`unwind: taking it from ${allocations.map((a) => `${a.ticker} ${usd(a.amount)}`).join(", ") || "nothing"}.`,
			);

			let proceeds = 0n;
			for (const allocation of allocations) {
				const leg = legs.find((l) => l.market.ticker === allocation.ticker);
				// Only ever produced from `legs`, so this is unreachable — but the
				// alternative to checking is a non-null assertion on a value that
				// decides how many tokens get sold.
				if (!leg || leg.value === null || leg.value === 0n) continue;

				const fraction =
					allocation.amount >= leg.value ? 1 : Number(allocation.amount) / Number(leg.value);
				const closeUnits = BigInt(Math.floor(Number(leg.balance) * fraction));
				if (closeUnits === 0n) continue;

				log(
					"info",
					`unwind: closing ${formatUnitsForVenue(closeUnits, leg.market.spotTokenDecimals)} ${leg.market.symbol} for about ${usd(allocation.amount)}.`,
				);
				proceeds += await closeLeg(deps, leg.market, closeUnits, allocation.amount, activity);
			}

			log("info", `unwind: the spot closes raised ${usd(proceeds)}; repatriating free margin.`);

			// Bring the margin the closes just freed back to Base — best-effort, and
			// deliberately not fatal.
			//
			// The closes were sized so that the *spot* proceeds alone cover the
			// requested amount, so the queue is already payable by this point. A venue
			// withdrawal that has not settled, or a bridge that is down, must not throw
			// away the half that is home and leave the redemption unpaid after the
			// position has been sold. What does not make it stays as idle USDC on
			// Solana, which the valuation still counts, and comes back with the next
			// unwind.
			//
			// Only the margin the *closed* part of the position was carrying. What
			// still stands keeps its backing, buffer and all — sweeping the venue's
			// whole free balance would leave the surviving hedge at exactly its
			// ceiling and the next NAV report reverting.
			let repatriated = 0n;
			try {
				repatriated = await repatriateMargin(deps, activity, {
					retainForLeverageBps: leverageBps,
				});
			} catch (error) {
				// Visible by its absence: a PERP_CLOSE with no VENUE_WITHDRAW against
				// it is exactly what an operator needs to see, and it is more useful
				// than a thrown error that would also discard the spot proceeds.
				repatriated = 0n;
				log(
					"warn",
					"unwind: the margin did not make it home; the spot proceeds are still being returned.",
					error,
				);
			}

			// The one call that actually clears the redemption queue. Everything above
			// this line moved value between the agent's own accounts.
			await returnAll(deps, proceeds + repatriated, activity);
			log(
				"info",
				`unwind: returned ${usd(proceeds + repatriated)} to the vault in ${formatDuration(performance.now() - startedAt)} (${usd(proceeds)} spot, ${usd(repatriated)} margin).`,
			);

			return activity;
		},

		/**
		 * Send more margin to the perp account, and nothing else.
		 *
		 * The cheap half of a deployment: the bridge and the venue deposit, without
		 * the leverage change, the perp order or the swap. Nothing about the position
		 * changes — no notional is opened, no token is bought — so this cannot fail
		 * part-way into an unhedged leg. The worst outcome is USDC that crossed and
		 * did not deposit, which the valuation still counts as the vault's and the
		 * next deployment picks up.
		 *
		 * Both legs are recorded even though the money never leaves the vault's own
		 * accounts. A depositor reading the feed sees capital move from Base to
		 * Solana, and a bridge with no arrival against it is how a stuck crossing
		 * becomes visible.
		 */
		async topUpMargin({ amount }) {
			const activity: ActivityInput[] = [];

			log("info", `topUpMargin: bridging ${usd(amount)} of margin to Solana.`);

			const bridged = await deps.bridge.toSolana(amount);

			log(
				"info",
				`topUpMargin: ${usd(bridged.landed)} arrived (${usd(amount - bridged.landed)} lost in transit).`,
			);

			activity.push({
				kind: "BRIDGE_OUT",
				chain: "BASE",
				symbol: "USDC",
				baseAmount: amount,
				notionalAssets: amount,
				pnlAssets: 0n,
				feeAssets: amount > bridged.landed ? amount - bridged.landed : 0n,
				txRef: bridged.txRef,
				occurredAt: deps.now(),
			});
			activity.push({
				kind: "VENUE_DEPOSIT",
				chain: "SOLANA",
				symbol: "USDC",
				baseAmount: bridged.landed,
				notionalAssets: bridged.landed,
				pnlAssets: 0n,
				feeAssets: 0n,
				txRef: bridged.txRef,
				occurredAt: deps.now(),
			});

			return activity;
		},

		/**
		 * Sell everything, everywhere, and send all of it home.
		 *
		 * What an operator's close order means. Distinct from `unwind` in three ways
		 * that matter, and each of them is why this is not just a very large unwind:
		 *
		 *  - **Every market, in full.** No allocation, no target weights, no stopping
		 *    when enough has been raised. A leg left open because the ones before it
		 *    happened to fetch more than expected is exactly the residual exposure the
		 *    order was given to remove.
		 *  - **The margin account is swept, not trimmed.** `repatriateMargin` takes
		 *    what the venue says is free at the account's configured leverage, which
		 *    with every position closed is all of it — and the sweep also picks up USDC
		 *    stranded in the Solana wallet by an earlier failure, which an ordinary
		 *    unwind leaves for next time because there will be a next time.
		 *  - **Failures are loud.** An unwind that gets most of the way there has still
		 *    served its purpose; a close that gets most of the way there has not, and
		 *    the operator has to be told which part is still open.
		 *
		 * Markets are closed one at a time rather than concurrently. The Pacifica
		 * account is shared and its margin moves with every close, so overlapping
		 * reduce-only orders against one account are ordered by the venue anyway — and
		 * sequentially, a leg that fails leaves the ones before it already home.
		 */
		async closeAll() {
			const activity: ActivityInput[] = [];
			const failures: string[] = [];
			const startedAt = performance.now();

			log(
				"info",
				`closeAll: an operator has ordered every position closed — ${config.markets.map((m) => m.ticker).join(", ")}.`,
			);

			for (const market of config.markets) {
				const balance = await spotBalance(market);
				// Rescaled into the spot token's own decimals before it is compared with
				// anything. `perpPosition` answers in the 1e18 basis the two legs are
				// made comparable in, and every number below this line — the order
				// amount, the swap input, the balance cap — is denominated in the token.
				// An 8-decimal token confused between the two is off by ten orders of
				// magnitude, which is an order for a size nobody holds.
				const position = fromUnits(await perpPosition(deps, market), market.spotTokenDecimals);

				if (balance === 0n && position === 0n) {
					log("debug", `closeAll: ${market.ticker} is already flat.`);
					continue;
				}

				log("info", `closeAll: closing ${market.ticker} in full.`);

				try {
					// The venue's own position size, not the spot balance, because the two
					// disagree after drift and it is the perp that has to reach zero. A
					// reduce-only order for more than is open closes the position and stops,
					// so the larger of the two is the safe number to name.
					const closeUnits = balance > position ? balance : position;
					// The proceeds are deliberately not accumulated. Unlike an unwind,
					// which returns exactly what it raised, a close sweeps the wallet at
					// the end — so the number that matters is the balance, not the sum of
					// what each leg was expected to contribute to it.
					await closeLeg(deps, market, closeUnits, 0n, activity);
				} catch (error) {
					// Recorded and carried on. One market whose pool has dried up must not
					// leave the other four open — a close order is about reducing exposure,
					// and stopping at the first failure keeps the most of it.
					failures.push(`${market.ticker}: ${message(error)}`);
					log("error", `closeAll: ${market.ticker} could not be closed; carrying on.`, error);
					if (error instanceof VenueExecutionError) activity.push(...error.activity);
				}
			}

			log("info", "closeAll: sweeping the margin account.");
			try {
				await repatriateMargin(deps, activity, { sweepIdle: true });
			} catch (error) {
				failures.push(`the margin account: ${message(error)}`);
				log("error", "closeAll: the margin account could not be swept.", error);
			}

			// The whole Base balance, not just what this call raised.
			//
			// An unwind returns its own proceeds and leaves anything else alone,
			// because "anything else" is usually capital mid-deployment that the next
			// tick will use. A close order has no next tick to use it, and idle USDC
			// at the agent still counts toward the vault's reported NAV — so leaving
			// a dollar behind leaves `deployedAssets` above the dust threshold, the
			// order never reads as satisfied, and the agent retries a close that has
			// nothing left to close on every tick from then on.
			//
			// Read after the repatriation rather than added to it, so USDC that
			// arrived by some other route — a bridge that landed late, a deployment
			// that failed after drawing down — is swept too.
			const onBase = await usdcBalance(config.agentAddress);
			await returnAll(deps, onBase, activity);
			log(
				"info",
				`closeAll: returned ${usd(onBase)} to the vault in ${formatDuration(performance.now() - startedAt)}${failures.length ? `, with ${failures.length} part(s) still open` : ""}.`,
			);

			if (failures.length > 0) {
				// Thrown *after* everything that could be sent home has been, and
				// carrying the legs that did land. The order stays outstanding, so the
				// next tick tries the remainder again; what the operator gets in the
				// meantime is a named list of what is still open rather than a vault
				// that reports itself closed while holding a position.
				throw new VenueExecutionError(
					`Closed what could be closed and returned ${onBase} USDC, but ${failures.length} part${failures.length === 1 ? "" : "s"} of the position could not be closed — ${failures.join("; ")}.`,
					activity,
				);
			}

			return activity;
		},

		async rebalance({ market: ticker, targetUnits }) {
			const market = marketFor(ticker);
			const current = await perpPosition(deps, market);

			const delta = targetUnits - current;
			if (delta === 0n) {
				log("debug", `rebalance ${market.ticker}: the legs already match; nothing to do.`);
				return [];
			}

			// Snapped to the venue's grid, and a correction finer than one lot is
			// not a correction the venue can make: the order would be rejected
			// outright rather than filled approximately. Returning nothing here is
			// the honest answer — the legs are as close as this market allows.
			const lot = await lotUnits(deps, market, 18);
			const correction = snapToLot(abs(delta), lot);
			if (correction === 0n) {
				log(
					"debug",
					`rebalance ${market.ticker}: the legs are ${formatUnitsForVenue(abs(delta), 18)} apart, inside Pacifica's ${formatUnitsForVenue(lot, 18)} lot size; nothing can be traded to close it.`,
				);
				return [];
			}

			// The venue has a second floor, and it is denominated differently. A size
			// on the lot grid can still be rejected for being worth too little —
			// `min_order_size` is a minimum *notional in dollars*, so snapping to the
			// grid gives no protection against it. This is what rejected a 0.002 NVDA
			// correction worth $0.45 against a $10 floor, on every tick, indefinitely.
			//
			// Returned as nothing rather than thrown, matching the sub-lot case
			// directly above: in both the legs are as close as this venue will let
			// them be, which is a fact about the market and not a failure. The policy
			// checks this too and should not offer the action at all — this is the
			// backstop for a position that shrank between the decision and the order.
			const minOrderUsd = await minOrderNotionalUsd(deps, market);
			const correctionUsd = (Number(correction) / 1e18) * (await markPriceUsd(deps, market));
			if (minOrderUsd > 0 && correctionUsd < minOrderUsd) {
				log(
					"info",
					`rebalance ${market.ticker}: the ${formatUnitsForVenue(correction, 18)} correction is worth about $${correctionUsd.toFixed(2)}, under Pacifica's $${minOrderUsd} minimum order. Leaving the drift; it becomes placeable as the position grows.`,
				);
				return [];
			}

			log(
				"info",
				`rebalance ${market.ticker}: ${delta > 0n ? "selling" : "buying back"} ${formatUnitsForVenue(correction, 18)} ${market.perpSymbol} to match the spot leg.`,
			);

			// The perp leg only. Correcting on the spot side means another swap
			// through a thin pool, paying that pool's slippage to fix what is
			// usually a lot-grid rounding artifact.
			const receipt = await pacifica.createMarketOrder(deps.signPacifica, {
				account: config.solanaAddress,
				symbol: market.perpSymbol,
				side: delta > 0n ? "ask" : "bid",
				amount: formatUnitsForVenue(correction, 18),
				slippagePercent: String(config.slippagePercent),
				reduceOnly: delta < 0n,
			});

			return [
				{
					kind: "PERP_REBALANCE",
					chain: "SOLANA",
					symbol: market.perpSymbol,
					baseAmount: correction,
					notionalAssets: 0n,
					pnlAssets: 0n,
					feeAssets: 0n,
					// biome-ignore lint/suspicious/noExplicitAny: receipt shape varies.
					txRef: refToHex(String((receipt as any).order_id ?? "")),
					occurredAt: deps.now(),
				},
			];
		},
	};
}

/**
 * Bring freed perp margin back to Base.
 *
 * Called straight after a reduce-only close, which is the moment margin stops
 * backing a position and becomes withdrawable. The amount is the venue's own
 * `available_to_withdraw` rather than a fraction computed from the close: the
 * two disagree as soon as funding settles between the close and this read, and
 * only the venue's figure governs whether the withdrawal is accepted.
 *
 * Two hops, each recorded. The withdrawal moves USDC from the Pacifica account
 * to the agent's Solana wallet; the bridge moves it from there to Base. Neither
 * is instant and neither is free, which is why the fee shows up on the bridge
 * row as the difference between what was sent and what landed.
 *
 * **`retainForLeverageBps` is what stops a partial unwind undoing the buffer.**
 * `available_to_withdraw` is what *Pacifica* considers free at the account's
 * configured leverage, and Pacifica knows nothing about the margin this vault
 * holds on top of its requirement — so to the venue the whole buffer reads as
 * withdrawable, and an unwind that swept it would leave the surviving position
 * sitting at exactly its ceiling. Which is the state `MARGIN_BUFFER_BPS` exists
 * to prevent, arrived at from the other direction.
 *
 * So an unwind names the leverage the remaining position should be left at, and
 * this keeps back the margin that implies. The fraction itself is still not
 * invented here — it comes from `policy.ts` with the rest of the numbers that
 * move money. A caller that passes nothing sweeps, which is what a close order
 * means: there is no remaining position to leave margin behind for.
 *
 * `sweepIdle` additionally brings home whatever is sitting in the agent's Solana
 * wallet outside the venue. Ordinarily that is nothing, and an unwind leaves it
 * alone on purpose: it is there because a previous crossing fell below the
 * venue's deposit minimum or a deposit failed after the money arrived, and it
 * will be picked up by the next deployment for free. A close order has no next
 * deployment, so it sweeps.
 */
async function repatriateMargin(
	deps: VenueDeps,
	activity: ActivityInput[],
	options: { sweepIdle?: boolean; retainForLeverageBps?: number } = {},
): Promise<bigint> {
	// An account the venue has never seen holds no margin, so there is nothing to
	// withdraw — but there may still be USDC stranded in the Solana wallet from a
	// crossing that landed and failed to deposit, and a close order has to sweep
	// that. So this is null rather than a throw, and the sweep below still runs.
	const account = await deps.pacifica.accountInfo(deps.config.solanaAddress).catch((error) => {
		if (!isAccountNotFound(error)) throw error;
		return null;
	});
	const available = numberOrNull(account?.available_to_withdraw) ?? 0;
	let withdrawable = available > 0 ? BigInt(Math.round(available * 1e6)) : 0n;

	// Keep back what the surviving position is supposed to be backed by. Read
	// after the closes rather than inferred from them: a reduce-only order fills
	// on the venue's lot grid and funding settles in between, so the notional that
	// is actually still open is the venue's number, not one computed from what was
	// asked for.
	if (options.retainForLeverageBps !== undefined && withdrawable > 0n) {
		const retain = await retainedMargin(deps, options.retainForLeverageBps);
		withdrawable = withdrawable > retain ? withdrawable - retain : 0n;
	}

	// Read before the withdrawal so the sweep is the balance that was *already*
	// stranded. Reading afterwards would race the venue's settlement and either
	// double-count what the withdrawal is about to deliver or miss it entirely,
	// depending on how fast Pacifica happened to settle.
	const stranded = options.sweepIdle ? await deps.solanaIdleUsdc().catch(() => 0n) : 0n;

	if (withdrawable === 0n && stranded === 0n) return 0n;

	if (withdrawable > 0n) {
		await deps.pacifica.requestWithdrawal(deps.signPacifica, {
			account: deps.config.solanaAddress,
			amount: formatUnitsForVenue(withdrawable, 6),
		});
		activity.push({
			kind: "VENUE_WITHDRAW",
			chain: "SOLANA",
			symbol: "USDC",
			baseAmount: withdrawable,
			notionalAssets: withdrawable,
			pnlAssets: 0n,
			feeAssets: 0n,
			// Pacifica returns no identifier for a withdrawal, so the row is keyed by
			// the account and the moment instead. The arrival is findable on Solana as
			// an incoming transfer to that wallet, which is the reference that exists.
			txRef: refToHex(`pacifica-withdraw:${deps.config.solanaAddress}:${deps.now()}`),
			occurredAt: deps.now(),
		});
	}

	// One crossing for both, because a bridge charges per crossing rather than
	// per dollar. `toBase` waits for the destination balance to cover the whole
	// amount, which is also what makes the withdrawal's settlement delay
	// something this can simply wait out rather than poll for itself.
	const crossing = withdrawable + stranded;
	const bridged = await deps.bridge.toBase(crossing);
	activity.push({
		kind: "BRIDGE_OUT",
		chain: "SOLANA",
		symbol: "USDC",
		baseAmount: crossing,
		notionalAssets: crossing,
		pnlAssets: 0n,
		feeAssets: crossing > bridged.landed ? crossing - bridged.landed : 0n,
		txRef: bridged.txRef,
		occurredAt: deps.now(),
	});

	return bridged.landed;
}

/**
 * The margin to leave behind, above what the venue itself requires.
 *
 * Backing `N` of notional at `L` needs `N * BPS / L` of equity, and the venue
 * has already reserved `N` of that at its own 1x setting — so what a withdrawal
 * has to leave on top of `available_to_withdraw` is the difference. That
 * difference is the buffer, expressed in dollars.
 *
 * Zero when nothing is open, which is what makes a close order's sweep and a
 * partial unwind's retention the same code path.
 *
 * A read that fails is treated as no notional rather than allowed to throw. This
 * runs inside an unwind that has already sold the spot legs, and the caller
 * treats the whole repatriation as best-effort for that reason; turning a failed
 * price lookup into a thrown error here would discard the proceeds a redemption
 * is waiting on to protect a buffer the next tick can restore.
 */
async function retainedMargin(deps: VenueDeps, leverageBps: number): Promise<bigint> {
	const [positions, prices] = await Promise.all([
		deps.pacifica.positions(deps.config.solanaAddress).catch(() => []),
		deps.pacifica.prices().catch(() => []),
	]);

	let notional = 0n;
	for (const market of deps.config.markets) {
		const position = positions.find((p) => p.symbol === market.perpSymbol);
		if (!position) continue;

		const size = Math.abs(numberOrNull(position.amount) ?? 0);
		// Mark first, entry as the fallback — the same order `observe` values the
		// notional in, so the buffer this keeps back and the leverage that gets
		// reported are measured against the same price.
		const quote = prices.find((q) => q.symbol === market.perpSymbol);
		const mark = numberOrNull(quote?.mark) ?? numberOrNull(position.entry_price) ?? 0;
		if (size <= 0 || mark <= 0) continue;

		notional += BigInt(Math.round(size * mark * 1e6));
	}

	if (notional === 0n) return 0n;
	const required = (notional * BigInt(BPS)) / BigInt(leverageBps);
	return required > notional ? required - notional : 0n;
}

/**
 * How much of one market's perp leg is open, scaled to 1e18.
 *
 * Reads the whole position list and picks the symbol out, because Pacifica has
 * no per-symbol position endpoint. Absent means flat, which is the ordinary
 * state for a market a vault has been configured for and not yet deployed into.
 */
async function perpPosition(deps: VenueDeps, market: VenueMarket): Promise<bigint> {
	// An unregistered account is flat everywhere, which is the same answer an
	// absent position gets. Reached by a close order on a vault that never
	// deployed, where refusing would leave the order outstanding forever.
	const positions = await deps.pacifica.positions(deps.config.solanaAddress).catch((error) => {
		if (!isAccountNotFound(error)) throw error;
		return [];
	});
	const position = positions.find((p) => p.symbol === market.perpSymbol);
	// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
	return BigInt(Math.round(Math.abs(Number((position as any)?.amount ?? 0)) * 1e18));
}

/**
 * Close `units` of one market's position: the short first, then the spot.
 *
 * The order is the same as it has always been, and for the same reason. Selling
 * spot first would leave the short unhedged and directionally exposed for the
 * length of a bridge — minutes, on a leveraged position — whereas reducing the
 * short first leaves the position long-biased for exactly one Base transaction.
 *
 * Returns the USDC the sale actually produced, measured either side of the swap
 * rather than taken from the quote. The quote is a promise and the fill is the
 * fact, and the fact is what gets handed to `agentReturn`: that call moves real
 * tokens, so naming a number the wallet does not hold reverts a return whose
 * legs have already been closed.
 */
async function closeLeg(
	deps: VenueDeps,
	market: VenueMarket,
	closeUnits: bigint,
	/** What this close was meant to raise, for the activity row. Zero when closing in full. */
	notionalHint: bigint,
	activity: ActivityInput[],
): Promise<bigint> {
	const { config, publicClient, kyber, pacifica } = deps;

	// Down onto the venue's grid, which for a reduce-only close means closing at
	// most what is open rather than at least. The spot sale below still uses the
	// full `closeUnits`: the balance is the agent's own and has no grid, and
	// leaving spot behind to match a coarser perp leg would strand tokens the
	// close was asked to turn into USDC.
	const perpUnits = snapToLot(closeUnits, await lotUnits(deps, market, market.spotTokenDecimals));

	const closeReceipt =
		perpUnits === 0n
			? null
			: await pacifica.createMarketOrder(deps.signPacifica, {
					account: config.solanaAddress,
					symbol: market.perpSymbol,
					side: "bid",
					amount: formatUnitsForVenue(perpUnits, market.spotTokenDecimals),
					slippagePercent: String(config.slippagePercent),
					reduceOnly: true,
				});
	// No row when nothing was closed. A position smaller than one lot cannot be
	// reduced at all, and recording a close that never happened would put a leg
	// in the depositor's feed that the venue has no order for.
	if (closeReceipt) {
		activity.push({
			kind: "PERP_CLOSE",
			chain: "SOLANA",
			symbol: market.perpSymbol,
			baseAmount: perpUnits,
			notionalAssets: notionalHint,
			pnlAssets: 0n,
			feeAssets: 0n,
			// biome-ignore lint/suspicious/noExplicitAny: receipt shape varies.
			txRef: refToHex(String((closeReceipt as any).order_id ?? "")),
			occurredAt: deps.now(),
		});
	}

	// The spot side is capped at what is actually held. `closeUnits` can exceed
	// it — a close order names the larger of the two legs so the perp reaches
	// zero — and a swap for tokens the wallet does not have reverts.
	const balance = (await publicClient.readContract({
		abi: erc20Abi,
		address: market.spotToken,
		functionName: "balanceOf",
		args: [config.agentAddress],
	})) as bigint;
	const sellUnits = closeUnits < balance ? closeUnits : balance;
	if (sellUnits === 0n) return 0n;

	const route = await kyber.getRoute({
		tokenIn: market.spotToken,
		tokenOut: config.usdc,
		amountIn: sellUnits.toString(),
		slippagePercent: config.slippagePercent,
	});
	if (!route.ok) {
		throw new VenueExecutionError(
			`No spot route to exit ${market.symbol}: ${route.message}. The short was already reduced, so the position is long by ${sellUnits} units until this is retried.`,
			activity,
		);
	}
	const built = await kyber.buildRoute({
		routeSummary: route.quote.routeSummary,
		sender: config.agentAddress,
		recipient: config.agentAddress,
		slippagePercent: config.slippagePercent,
	});
	await ensureAllowance(deps, market.spotToken, built.routerAddress as Address, sellUnits);

	const usdcBefore = (await publicClient.readContract({
		abi: erc20Abi,
		address: config.usdc,
		functionName: "balanceOf",
		args: [config.agentAddress],
	})) as bigint;

	let sellTx: Hex;
	try {
		sellTx = await deps.walletClient.sendTransaction({
			// biome-ignore lint/suspicious/noExplicitAny: account is set by the caller.
			account: deps.walletClient.account as any,
			chain: null,
			to: built.routerAddress as Address,
			data: built.data as Hex,
			value: 0n,
		});
		await confirmed(publicClient, sellTx, `The ${market.symbol} spot sell`);
	} catch (error) {
		// The short has been reduced and the spot behind it has not. The position
		// is long-biased until the next tick rebalances it, which is a state the
		// operator has to be able to see.
		throw new VenueExecutionError(
			`Spot sell failed for ${market.symbol}; the short was already reduced, so the position is long by ${sellUnits} units until the next tick.`,
			activity,
			{ cause: error },
		);
	}

	const proceeds =
		((await publicClient.readContract({
			abi: erc20Abi,
			address: config.usdc,
			functionName: "balanceOf",
			args: [config.agentAddress],
		})) as bigint) - usdcBefore;

	activity.push({
		kind: "SPOT_SELL",
		chain: "BASE",
		symbol: market.symbol,
		baseAmount: sellUnits,
		notionalAssets: proceeds,
		pnlAssets: 0n,
		feeAssets: 0n,
		txRef: sellTx,
		occurredAt: deps.now(),
	});

	return proceeds;
}

/**
 * Hand USDC back to the vault, and record it.
 *
 * The only call in this file that makes money `freeAssets` again. Everything
 * else moves value between accounts the agent controls, and a depositor cannot
 * be paid out of any of them.
 */
async function returnAll(
	deps: VenueDeps,
	amount: bigint,
	activity: ActivityInput[],
): Promise<void> {
	if (amount <= 0n) return;

	const returnTx = await deps.returnToVault(amount);
	activity.push({
		kind: "BRIDGE_IN",
		chain: "BASE",
		symbol: "USDC",
		baseAmount: amount,
		notionalAssets: amount,
		pnlAssets: 0n,
		feeAssets: 0n,
		txRef: returnTx,
		occurredAt: deps.now(),
	});
}

/**
 * Decide which markets an unwind comes out of.
 *
 * Two passes, and the first is the one that does the work. Taking from whichever
 * markets are furthest *above* their target weight means raising cash and
 * correcting the weights are the same trade: a vault that has drifted to
 * 60/40 against a 50/50 mandate pays its next redemption entirely out of the
 * heavy side and comes back to neutral for free.
 *
 * The second pass only runs when the overweight alone is not enough, and it
 * takes greedily from the largest remaining leg rather than proportionally
 * across all of them. Proportional is the tidier-looking answer and the more
 * expensive one — it touches every market, and each market touched is a perp
 * order and a swap through its own pool, paying two sets of fees to preserve
 * ratios that the next deployment restores anyway.
 *
 * Exported for its tests. The allocation decides which depositors' exposure gets
 * sold, and it is worth being able to state what it does in cases that are hard
 * to reach through a live venue.
 */
/**
 * The smallest slice worth taking out of one market during an unwind.
 *
 * Every market an unwind touches is a perp order and a swap through that
 * market's own pool, so the fixed cost of reaching into a market is the same
 * whether it gives up ten dollars or ten thousand. Correcting a fifty-dollar
 * overweight is not worth a round trip; the drift stays, and the next
 * deployment — which pays no extra fee to prefer the underweight side — removes
 * it for nothing.
 */
export const MIN_UNWIND_LEG_USDC = 100_000_000n; // $100

export function allocateUnwind(
	legs: Array<{ ticker: string; value: bigint; targetWeightBps: number; sellable: boolean }>,
	amount: bigint,
): Array<{ ticker: string; amount: bigint }> {
	// Targets are measured against every leg, including ones that cannot be sold
	// today. Leaving an unroutable market out would inflate every other market's
	// share of the total and report the whole vault as overweight.
	const total = legs.reduce((sum, leg) => sum + leg.value, 0n);
	if (total === 0n || amount <= 0n) return [];

	const allocated = new Map<string, bigint>();
	const capacity = new Map<string, bigint>();
	for (const leg of legs) {
		allocated.set(leg.ticker, 0n);
		capacity.set(leg.ticker, leg.sellable ? leg.value : 0n);
	}

	let remaining = amount;

	// Pass 1: the overweight, heaviest first.
	const overweight = legs
		.filter((leg) => leg.sellable)
		.map((leg) => ({
			leg,
			over: leg.value - (total * BigInt(leg.targetWeightBps)) / BigInt(BPS),
		}))
		.filter(({ over }) => over > 0n)
		.sort((a, b) => (a.over === b.over ? 0 : a.over < b.over ? 1 : -1));

	for (const { leg, over } of overweight) {
		if (remaining === 0n) break;
		const take = min(min(remaining, over), capacity.get(leg.ticker) ?? 0n);
		// Below the floor the correction costs more in fees than the drift costs
		// in exposure, and the second pass will reach whichever leg is largest
		// anyway. Skipped rather than rounded up, because rounding up would take
		// a market *below* its target to save a trip.
		if (take < MIN_UNWIND_LEG_USDC) continue;
		allocated.set(leg.ticker, (allocated.get(leg.ticker) ?? 0n) + take);
		capacity.set(leg.ticker, (capacity.get(leg.ticker) ?? 0n) - take);
		remaining -= take;
	}

	// Pass 2: whatever is still needed, from the largest legs first.
	if (remaining > 0n) {
		const byRemaining = legs
			.filter((leg) => (capacity.get(leg.ticker) ?? 0n) > 0n)
			.sort((a, b) => {
				const left = capacity.get(a.ticker) ?? 0n;
				const right = capacity.get(b.ticker) ?? 0n;
				return left === right ? 0 : left < right ? 1 : -1;
			});

		for (const leg of byRemaining) {
			if (remaining === 0n) break;
			const take = min(remaining, capacity.get(leg.ticker) ?? 0n);
			if (take <= 0n) continue;
			allocated.set(leg.ticker, (allocated.get(leg.ticker) ?? 0n) + take);
			capacity.set(leg.ticker, (capacity.get(leg.ticker) ?? 0n) - take);
			remaining -= take;
		}
	}

	return legs
		.map((leg) => ({ ticker: leg.ticker, amount: allocated.get(leg.ticker) ?? 0n }))
		.filter((entry) => entry.amount > 0n);
}

/**
 * Flatten a short that has nothing behind it.
 *
 * Called only on the spot leg failing after the perp leg opened. The close is
 * reduce-only, so if the order never actually landed this is a no-op against
 * the venue rather than an accidental long. A failure here is swallowed on
 * purpose: the caller is already throwing, and the useful thing to hand back is
 * the record of what did happen, not a second error on top of the first.
 */
async function closeNaked(
	deps: VenueDeps,
	market: VenueMarket,
	units: bigint,
	activity: ActivityInput[],
): Promise<void> {
	try {
		const receipt = await deps.pacifica.createMarketOrder(deps.signPacifica, {
			account: deps.config.solanaAddress,
			symbol: market.perpSymbol,
			side: "bid",
			amount: formatUnitsForVenue(units, market.spotTokenDecimals),
			slippagePercent: String(deps.config.slippagePercent),
			reduceOnly: true,
		});
		activity.push({
			kind: "PERP_CLOSE",
			chain: "SOLANA",
			symbol: market.perpSymbol,
			baseAmount: units,
			notionalAssets: 0n,
			pnlAssets: 0n,
			feeAssets: 0n,
			// biome-ignore lint/suspicious/noExplicitAny: receipt shape varies.
			txRef: refToHex(String((receipt as any).order_id ?? "")),
			occurredAt: deps.now(),
		});
	} catch {
		// Left open, and deliberately visible: the activity rows show a PERP_OPEN
		// with no SPOT_BUY and no PERP_CLOSE, which is precisely the state an
		// operator needs to see rather than a silently balanced-looking feed.
	}
}

/**
 * Approve exactly what this trade needs, when the standing allowance is short.
 *
 * Not an infinite approval. The agent wallet is the one address in this system
 * whose key is used constantly, and an unlimited allowance to a router turns any
 * router compromise into a total loss of the spot leg rather than of one trade.
 */
async function ensureAllowance(
	deps: VenueDeps,
	token: Address,
	spender: Address,
	amount: bigint,
): Promise<void> {
	const current = await deps.publicClient.readContract({
		abi: erc20Abi,
		address: token,
		functionName: "allowance",
		args: [deps.config.agentAddress, spender],
	});
	if (current >= amount) return;

	const hash = await deps.walletClient.writeContract({
		// biome-ignore lint/suspicious/noExplicitAny: account is set by the caller.
		account: deps.walletClient.account as any,
		chain: null,
		abi: erc20Abi,
		address: token,
		functionName: "approve",
		args: [spender, amount],
	});
	await confirmed(deps.publicClient, hash, `The ${token} approval for ${spender}`);
}

/** USDC base units as dollars, for a log line rather than for arithmetic. */
function usd(amount: bigint): string {
	return `$${(Number(amount) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Pacifica takes decimal strings, not integers. */
function formatUnitsForVenue(raw: bigint, decimals: number): string {
	const divisor = 10 ** decimals;
	return (Number(raw) / divisor).toString();
}

/**
 * The venue's quantity grid for a market, in units of `decimals`.
 *
 * Pacifica rejects an order whose size is not a multiple of `lot_size` — the
 * whole order, not the remainder — so a size derived from anywhere else has to
 * be snapped to this before it is sent. Every quantity the agent computes comes
 * from somewhere with a finer grid than the venue's: a Kyber quote's output, an
 * ERC-20 balance, the difference between two legs. None of them land on it by
 * accident.
 */
async function lotUnits(deps: VenueDeps, market: VenueMarket, decimals: number): Promise<bigint> {
	const specs = await deps.pacifica.markets();
	const spec = specs.find((m) => m.symbol === market.perpSymbol);
	const lot = Number(spec?.lot_size);
	if (!Number.isFinite(lot) || lot <= 0) {
		throw new Error(
			`Pacifica did not report a usable lot size for ${market.perpSymbol}, so no order size can be checked against its grid.`,
		);
	}
	return BigInt(Math.round(lot * 10 ** decimals));
}

/**
 * The venue's minimum order notional for a market, in dollars.
 *
 * A different constraint from the lot grid and expressed in different units:
 * `lot_size` bounds the *quantity* an order may be, `min_order_size` bounds what
 * it may be *worth*. An order can satisfy either and fail the other.
 *
 * Zero when the venue does not report one, which is read as "no floor" rather
 * than as an error — refusing to trade because a spec field was missing would
 * turn a cosmetic gap in a market listing into a stalled hedge.
 */
async function minOrderNotionalUsd(deps: VenueDeps, market: VenueMarket): Promise<number> {
	const specs = await deps.pacifica.markets();
	const spec = specs.find((m) => m.symbol === market.perpSymbol);
	return numberOrNull(spec?.min_order_size) ?? 0;
}

/** The live mark for a market, with no fallback: zero means "cannot price it". */
async function markPriceUsd(deps: VenueDeps, market: VenueMarket): Promise<number> {
	const prices = await deps.pacifica.prices();
	const quote = prices.find((p) => p.symbol === market.perpSymbol);
	return numberOrNull(quote?.mark) ?? 0;
}

/**
 * Round an order size down onto the venue's grid.
 *
 * Down rather than to nearest, everywhere it is used. Rounding a hedge up opens
 * more short than there is spot behind it, and rounding a close up asks to
 * close more than is held — the first is exposure nobody chose and the second
 * is an order the venue rejects. Rounding down leaves at most one lot
 * unhedged, which the drift check sees and the next tick can act on.
 */
function snapToLot(units: bigint, lot: bigint): bigint {
	if (lot <= 0n) return units;
	return (units / lot) * lot;
}

/**
 * Pack a venue order id into hex for the on-chain feed.
 *
 * Pacifica identifies a fill by an order id rather than a transaction
 * signature, so this is what there is to point at. It is preserved verbatim
 * rather than hashed, because the point of the reference is that someone can
 * look it up.
 */
function refToHex(reference: string): Hex {
	const bytes = new TextEncoder().encode(reference);
	return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

/**
 * What Pacifica charges to move USDC out of the margin account, in USDC.
 *
 * Flat, and paid on every unwind — which makes it one of the fixed costs that
 * decide whether a small unwind is worth making at all. It has been in the
 * client's types since the beginning (`PacificaBridgeAsset.withdrawal_fee`) and
 * nothing has ever read it, so every cost estimate the agent could have made was
 * short by exactly this much.
 *
 * USDC specifically. `bridgeInfo` answers for every asset the venue bridges, and
 * the vault's margin is denominated in one of them.
 */
async function venueWithdrawalFee(deps: VenueDeps): Promise<bigint> {
	const assets = await deps.pacifica.bridgeInfo();
	const usdc = assets.find((asset) => asset.symbol.toUpperCase() === "USDC");
	const fee = numberOrNull(usdc?.withdrawal_fee) ?? 0;
	return fee > 0 ? BigInt(Math.round(fee * 1e6)) : 0n;
}

/** A venue decimal string as a number, or null when missing or unparseable. */
function numberOrNull(raw: string | number | null | undefined): number | null {
	if (raw === null || raw === undefined) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

function abs(value: bigint): bigint {
	return value < 0n ? -value : value;
}

function min(a: bigint, b: bigint): bigint {
	return a < b ? a : b;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export { parseUnits };
