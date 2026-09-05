import { adlRisk } from "@lemon/core";
import type { KyberAggregatorClient } from "@lemon/kyber";
import type { PacificaClient } from "@lemon/pacifica";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { erc20Abi, parseUnits } from "viem";
import { MIN_DEPLOY_USDC } from "./policy";
import { toUnits, type Valuation, value } from "./valuation";
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
 */
export interface VenueConfig {
	symbol: string;
	/** The Base ERC-20 that is the spot leg. */
	spotToken: Address;
	spotTokenDecimals: number;
	usdc: Address;
	/** Pacifica's wire symbol, e.g. "NVDA". */
	perpSymbol: string;
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
	 * A callback rather than the `VaultClient` itself, matching the paper
	 * adapter. The adapter's job is to turn a position into USDC at the agent's
	 * Base wallet; which vault that USDC belongs to is the worker's knowledge,
	 * and handing the whole client over here would let a venue adapter report
	 * NAV or fulfil a redemption — neither of which it has any business doing.
	 */
	returnToVault: (amount: bigint) => Promise<Hex>;
	/** In-flight tracking, so a bridge does not read as a loss. */
	inFlight: () => bigint;
	now: () => number;
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

export function createVenueAdapter(deps: VenueDeps): VenueAdapter {
	const { config, publicClient, kyber, pacifica } = deps;

	async function spotBalance(): Promise<bigint> {
		return publicClient.readContract({
			abi: erc20Abi,
			address: config.spotToken,
			functionName: "balanceOf",
			args: [config.agentAddress],
		});
	}

	/**
	 * What the whole spot holding would fetch if sold now.
	 *
	 * Quoted at the full size rather than a unit price scaled up. A tokenized
	 * equity on a thin Aerodrome pool moves several percent against a real-sized
	 * sale, so a unit quote multiplied out reports a holding the vault cannot
	 * actually liquidate at that price — and that error lands directly in every
	 * holder's share value.
	 */
	async function spotSellQuote(balance: bigint): Promise<bigint | null> {
		if (balance === 0n) return 0n;
		try {
			const route = await kyber.getRoute({
				tokenIn: config.spotToken,
				tokenOut: config.usdc,
				amountIn: balance.toString(),
				slippagePercent: config.slippagePercent,
			});
			// `QuoteResult` is a discriminated union: `ok: false` is "no pool",
			// which is ordinary state. The quote's fields sit under `quote`, not at
			// the top level — reading `routeSummary.amountOut` off the envelope
			// yields undefined and prices every holding at null.
			if (!route.ok) return null;
			return BigInt(route.quote.amountOut);
		} catch {
			// Null, not zero. An unroutable pool is an unknown value, and the
			// valuation layer refuses to price it rather than marking it to zero.
			return null;
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

	return {
		async observe() {
			// `prices()`, not `markets()`. Market info is the venue's *spec* — tick
			// size, lot size, leverage caps, funding rate — and carries no mark at
			// all, so the old fallback to `market.mark_price` was reading undefined
			// and the position was being valued at its entry price forever.
			const [balance, account, positions, prices, markets] = await Promise.all([
				spotBalance(),
				pacifica.accountInfo(config.solanaAddress),
				pacifica.positions(config.solanaAddress),
				pacifica.prices(),
				pacifica.markets(),
			]);

			const [sellQuote, idleUsdc] = await Promise.all([
				spotSellQuote(balance),
				usdcBalance(config.agentAddress),
			]);

			const position = positions.find((p) => p.symbol === config.perpSymbol);
			const market = markets.find((m) => m.symbol === config.perpSymbol);
			const price = prices.find((q) => q.symbol === config.perpSymbol);

			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const equityUsd = Number((account as any).account_equity ?? 0);
			const equity = BigInt(Math.round(equityUsd * 1e6));
			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const perpSize = Number((position as any)?.amount ?? 0);
			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const entryPrice = Number((position as any)?.entry_price ?? 0);
			const mark = Number(price?.mark ?? 0);
			// Mark for the notional, with entry as the fallback: an unpriced mark
			// should not silently value the leg at zero.
			const markPrice = Number.isFinite(mark) && mark > 0 ? mark : entryPrice;
			const notional = BigInt(Math.round(Math.abs(perpSize) * markPrice * 1e6));

			const valuation: Valuation = value({
				spotTokenBalance: balance,
				spotTokenDecimals: config.spotTokenDecimals,
				spotSellQuoteUsdc: sellQuote,
				perpEquityUsdc: equity,
				perpNotionalUsdc: notional,
				idleAtAgentUsdc: idleUsdc,
				inFlightUsdc: deps.inFlight(),
			});

			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const fundingHourly = Number((market as any)?.funding_rate ?? 0) * 100;

			// Scored off the live mark, not the entry fallback. A stale mark would
			// report zero profit and so zero queue position — silence in exactly
			// the state that most warrants a warning.
			const adl = adlRisk({
				side: "short",
				entryPrice: entryPrice > 0 ? entryPrice : null,
				markPrice: Number.isFinite(mark) && mark > 0 ? mark : null,
				size: perpSize,
				equityUsd: equityUsd > 0 ? equityUsd : null,
				oraclePrice: numberOrNull(price?.oracle),
				price24hAgo: numberOrNull(price?.yesterday_price),
			});

			return {
				valuation,
				spotUnits: toUnits(balance, config.spotTokenDecimals),
				// Perp size is a decimal count of units; scale it to the same 1e18
				// basis so the two legs are comparable.
				perpUnits: BigInt(Math.round(Math.abs(perpSize) * 1e18)),
				// Pacifica quotes one rate where positive means longs pay shorts,
				// so the short side receives exactly this. See the README.
				fundingShortPercentPerHour: fundingHourly,
				spotBuyable: sellQuote !== null,
				spotSellable: sellQuote !== null,
				symbol: config.symbol,
				adl,
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
		 */
		async deploy({ spotNotional, perpMargin, leverageBps }) {
			const activity: ActivityInput[] = [];

			// 0. Prove the spot leg is routable before any money leaves Base.
			// Bridging first and discovering afterwards that the pool cannot fill
			// strands the margin on Solana with nothing to hedge and a slow way back.
			const probe = await kyber.getRoute({
				tokenIn: config.usdc,
				tokenOut: config.spotToken,
				amountIn: spotNotional.toString(),
				slippagePercent: config.slippagePercent,
			});
			if (!probe.ok) throw new Error(`No spot route for ${config.symbol}: ${probe.message}`);

			// 1. Margin across to Solana. Nothing is exposed while it flies.
			const bridged = await deps.bridge.toSolana(perpMargin);
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

			// 2. Leverage is set before the order, not after — an order placed at the
			// account's previous leverage would open at the wrong size and have to be
			// corrected, paying taker fees twice.
			await pacifica.updateLeverage(deps.signPacifica, {
				account: config.solanaAddress,
				symbol: config.perpSymbol,
				leverage: Math.round(leverageBps / 10_000),
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
			const carriable = (bridged.landed * BigInt(leverageBps)) / 10_000n;
			const spend = carriable < spotNotional ? carriable : spotNotional;
			if (spend < MIN_DEPLOY_USDC) {
				throw new VenueExecutionError(
					`Only ${bridged.landed} of ${perpMargin} USDC survived the bridge, which carries ${spend} of hedge — below the deploy minimum. Margin is on Solana and no position was opened.`,
					activity,
				);
			}

			// Quoted *now*, not reused from the probe above. The probe is minutes old
			// by this point and priced a market that has moved since; sizing the hedge
			// off it would bake the bridge's duration into the hedge ratio as drift.
			const route = await kyber.getRoute({
				tokenIn: config.usdc,
				tokenOut: config.spotToken,
				amountIn: spend.toString(),
				slippagePercent: config.slippagePercent,
			});
			if (!route.ok) {
				throw new VenueExecutionError(
					`Margin bridged but no spot route for ${config.symbol}: ${route.message}`,
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
					`Margin bridged but the ${config.symbol} route quoted zero output; refusing to short against nothing.`,
					activity,
				);
			}

			// The approval goes here rather than beside the swap, so the window in
			// which the short is naked is one transaction and not two.
			await ensureAllowance(deps, config.usdc, built.routerAddress as Address, spend);

			// 4. The short, sized on that quote.
			const receipt = await pacifica.createMarketOrder(deps.signPacifica, {
				account: config.solanaAddress,
				symbol: config.perpSymbol,
				side: "ask",
				amount: formatUnitsForVenue(expectedUnits, config.spotTokenDecimals),
				slippagePercent: String(config.slippagePercent),
			});
			activity.push({
				kind: "PERP_OPEN",
				chain: "SOLANA",
				symbol: config.perpSymbol,
				baseAmount: expectedUnits,
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
			const before = await spotBalance();
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
				await publicClient.waitForTransactionReceipt({ hash: swapTx });
			} catch (error) {
				// The short is open and there is nothing behind it. Unwinding it here
				// is not tidiness — leaving it until the next tick means holding a
				// leveraged naked short across a tick interval, which is the exposure
				// this whole ordering exists to avoid.
				await closeNaked(deps, expectedUnits, activity);
				throw new VenueExecutionError(
					`Spot buy failed for ${config.symbol}; the short opened against it was closed.`,
					activity,
					{ cause: error },
				);
			}

			const received = (await spotBalance()) - before;
			activity.push({
				kind: "SPOT_BUY",
				chain: "BASE",
				symbol: config.symbol,
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
		 * The last step is the one that matters. Closing both legs leaves the
		 * proceeds at the agent's own wallets, where `freeAssets` does not count
		 * them and `fulfillRedeem` cannot pay from them — so an unwind that stops
		 * at the venues has sold a depositor's position without moving them any
		 * closer to being paid, and the queue stalls with the money already out of
		 * the market. `returnToVault` is what closes that loop.
		 */
		async unwind({ amount }) {
			const activity: ActivityInput[] = [];

			// Close the perp first. Selling spot first would leave the short
			// unhedged and directionally exposed for the length of a bridge —
			// which is minutes, on a leveraged position.
			const balance = await spotBalance();
			const total = await spotSellQuote(balance);
			if (total === null || total === 0n) {
				throw new Error("Cannot price the spot leg, so cannot size an unwind against it.");
			}

			const fraction = amount > total ? 1 : Number(amount) / Number(total);
			const closeUnits = BigInt(Math.floor(Number(balance) * fraction));

			const closeReceipt = await pacifica.createMarketOrder(deps.signPacifica, {
				account: config.solanaAddress,
				symbol: config.perpSymbol,
				side: "bid",
				amount: formatUnitsForVenue(closeUnits, config.spotTokenDecimals),
				slippagePercent: String(config.slippagePercent),
				reduceOnly: true,
			});
			activity.push({
				kind: "PERP_CLOSE",
				chain: "SOLANA",
				symbol: config.perpSymbol,
				baseAmount: closeUnits,
				notionalAssets: amount,
				pnlAssets: 0n,
				feeAssets: 0n,
				// biome-ignore lint/suspicious/noExplicitAny: receipt shape varies.
				txRef: refToHex(String((closeReceipt as any).order_id ?? "")),
				occurredAt: deps.now(),
			});

			// Sell the matching spot.
			const route = await kyber.getRoute({
				tokenIn: config.spotToken,
				tokenOut: config.usdc,
				amountIn: closeUnits.toString(),
				slippagePercent: config.slippagePercent,
			});
			if (!route.ok) throw new Error(`No spot route to exit ${config.symbol}: ${route.message}`);
			const built = await kyber.buildRoute({
				routeSummary: route.quote.routeSummary,
				sender: config.agentAddress,
				recipient: config.agentAddress,
				slippagePercent: config.slippagePercent,
			});
			await ensureAllowance(deps, config.spotToken, built.routerAddress as Address, closeUnits);

			// Measured either side of the swap rather than taken from the quote.
			// The quote is a promise and the fill is the fact, and the fact is what
			// has to be handed to `returnToVault` — that call moves real tokens, so
			// naming a number the wallet does not hold reverts an unwind whose legs
			// have already been closed.
			const usdcBefore = await usdcBalance(config.agentAddress);
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
				await publicClient.waitForTransactionReceipt({ hash: sellTx });
			} catch (error) {
				// The short has been reduced and the spot behind it has not. The
				// position is long-biased until the next tick rebalances it, which
				// is a state the operator has to be able to see.
				throw new VenueExecutionError(
					`Spot sell failed for ${config.symbol}; the short was already reduced, so the position is long by ${closeUnits} units until the next tick.`,
					activity,
					{ cause: error },
				);
			}
			const proceeds = (await usdcBalance(config.agentAddress)) - usdcBefore;

			activity.push({
				kind: "SPOT_SELL",
				chain: "BASE",
				symbol: config.symbol,
				baseAmount: closeUnits,
				notionalAssets: proceeds,
				pnlAssets: 0n,
				feeAssets: 0n,
				txRef: sellTx,
				occurredAt: deps.now(),
			});

			// Bring the margin the close just freed back to Base — best-effort, and
			// deliberately not fatal.
			//
			// `closeUnits` was sized so that the *spot* proceeds alone cover the
			// requested amount, so the queue is already payable by this point. A
			// venue withdrawal that has not settled, or a bridge that is down, must
			// not throw away the half that is home and leave the redemption unpaid
			// after the position has been sold. What does not make it stays as idle
			// USDC on Solana, which the valuation still counts, and comes back with
			// the next unwind.
			let repatriated = 0n;
			try {
				repatriated = await repatriateMargin(deps, activity);
			} catch {
				// Visible by its absence: a PERP_CLOSE with no VENUE_WITHDRAW against
				// it is exactly what an operator needs to see, and it is more useful
				// than a thrown error that would also discard the spot proceeds.
				repatriated = 0n;
			}

			// The one call that actually clears the redemption queue. Everything
			// above this line moved value between the agent's own accounts.
			const returned = proceeds + repatriated;
			if (returned > 0n) {
				const returnTx = await deps.returnToVault(returned);
				activity.push({
					kind: "BRIDGE_IN",
					chain: "BASE",
					symbol: "USDC",
					baseAmount: returned,
					notionalAssets: returned,
					pnlAssets: 0n,
					feeAssets: 0n,
					txRef: returnTx,
					occurredAt: deps.now(),
				});
			}

			return activity;
		},

		async rebalance({ targetUnits }) {
			const positions = await pacifica.positions(config.solanaAddress);
			const position = positions.find((p) => p.symbol === config.perpSymbol);
			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const current = BigInt(Math.round(Math.abs(Number((position as any)?.amount ?? 0)) * 1e18));

			const delta = targetUnits - current;
			if (delta === 0n) return [];

			// The perp leg only. Correcting on the spot side means another swap
			// through a thin pool, paying that pool's slippage to fix what is
			// usually a lot-grid rounding artifact.
			const receipt = await pacifica.createMarketOrder(deps.signPacifica, {
				account: config.solanaAddress,
				symbol: config.perpSymbol,
				side: delta > 0n ? "ask" : "bid",
				amount: formatUnitsForVenue(abs(delta), 18),
				slippagePercent: String(config.slippagePercent),
				reduceOnly: delta < 0n,
			});

			return [
				{
					kind: "PERP_REBALANCE",
					chain: "SOLANA",
					symbol: config.perpSymbol,
					baseAmount: abs(delta),
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
 * Note what this deliberately does not do: it keeps no discretionary buffer
 * above the venue's own margin requirement. `available_to_withdraw` is what
 * Pacifica considers free at the account's configured leverage, and leaving
 * some of it behind would quietly de-lever the vault below the mandate it sold
 * its depositors. If a buffer is ever wanted it belongs in `policy.ts` as a
 * named fraction, with the rest of the numbers that move money — not as a
 * constant invented here.
 */
async function repatriateMargin(deps: VenueDeps, activity: ActivityInput[]): Promise<bigint> {
	const account = await deps.pacifica.accountInfo(deps.config.solanaAddress);
	const available = numberOrNull(account.available_to_withdraw) ?? 0;
	if (available <= 0) return 0n;
	const withdrawable = BigInt(Math.round(available * 1e6));

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

	const bridged = await deps.bridge.toBase(withdrawable);
	activity.push({
		kind: "BRIDGE_OUT",
		chain: "SOLANA",
		symbol: "USDC",
		baseAmount: withdrawable,
		notionalAssets: withdrawable,
		pnlAssets: 0n,
		feeAssets: withdrawable > bridged.landed ? withdrawable - bridged.landed : 0n,
		txRef: bridged.txRef,
		occurredAt: deps.now(),
	});

	return bridged.landed;
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
	units: bigint,
	activity: ActivityInput[],
): Promise<void> {
	try {
		const receipt = await deps.pacifica.createMarketOrder(deps.signPacifica, {
			account: deps.config.solanaAddress,
			symbol: deps.config.perpSymbol,
			side: "bid",
			amount: formatUnitsForVenue(units, deps.config.spotTokenDecimals),
			slippagePercent: String(deps.config.slippagePercent),
			reduceOnly: true,
		});
		activity.push({
			kind: "PERP_CLOSE",
			chain: "SOLANA",
			symbol: deps.config.perpSymbol,
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
	await deps.publicClient.waitForTransactionReceipt({ hash });
}

/** Pacifica takes decimal strings, not integers. */
function formatUnitsForVenue(raw: bigint, decimals: number): string {
	const divisor = 10 ** decimals;
	return (Number(raw) / divisor).toString();
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

/** A venue decimal string as a number, or null when missing or unparseable. */
function numberOrNull(raw: string | number | null | undefined): number | null {
	if (raw === null || raw === undefined) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

function abs(value: bigint): bigint {
	return value < 0n ? -value : value;
}

export { parseUnits };
