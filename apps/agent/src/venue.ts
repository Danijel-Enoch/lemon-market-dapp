import type { KyberAggregatorClient } from "@lemon/kyber";
import type { PacificaClient } from "@lemon/pacifica";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { erc20Abi, parseUnits } from "viem";
import { toUnits, type Valuation, value } from "./valuation";
import type { ActivityInput } from "./vault";
import type { VenueAdapter } from "./worker";

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
	/** In-flight tracking, so a bridge does not read as a loss. */
	inFlight: () => bigint;
	now: () => number;
}

export interface BridgeAdapter {
	toSolana(amountUsdc: bigint): Promise<{ txRef: Hex; landed: bigint }>;
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
			const [balance, account, positions, markets] = await Promise.all([
				spotBalance(),
				pacifica.accountInfo(config.solanaAddress),
				pacifica.positions(config.solanaAddress),
				pacifica.markets(),
			]);

			const [sellQuote, idleUsdc] = await Promise.all([
				spotSellQuote(balance),
				usdcBalance(config.agentAddress),
			]);

			const position = positions.find((p) => p.symbol === config.perpSymbol);
			const market = markets.find((m) => m.symbol === config.perpSymbol);

			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const equity = BigInt(Math.round(Number((account as any).account_equity ?? 0) * 1e6));
			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const perpSize = Number((position as any)?.amount ?? 0);
			// biome-ignore lint/suspicious/noExplicitAny: venue payloads are loosely typed.
			const markPrice = Number((position as any)?.entry_price ?? (market as any)?.mark_price ?? 0);
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
			};
		},

		/**
		 * Put capital to work by *growing the existing position*, not opening a
		 * second one.
		 *
		 * This is what a new deposit does. The spot buy adds to the token balance
		 * the agent already holds, the bridged margin tops up the same Pacifica
		 * account, and the market order increases the size of the short that is
		 * already open — Pacifica nets per symbol, so a second ask deepens the
		 * existing position rather than creating a parallel one.
		 *
		 * That is the behaviour a pooled vault needs. Separate positions per
		 * deposit would fragment the book, pay entry fees repeatedly on the same
		 * exposure, and make a partial unwind for one withdrawal ambiguous about
		 * which position to close.
		 */
		async deploy({ spotNotional, perpMargin, leverageBps }) {
			const activity: ActivityInput[] = [];
			const at = deps.now();

			// 1. Spot leg on Base.
			const route = await kyber.getRoute({
				tokenIn: config.usdc,
				tokenOut: config.spotToken,
				amountIn: spotNotional.toString(),
				slippagePercent: config.slippagePercent,
			});
			if (!route.ok) throw new Error(`No spot route for ${config.symbol}: ${route.message}`);
			const summary = route.quote.routeSummary;
			const built = await kyber.buildRoute({
				routeSummary: summary,
				sender: config.agentAddress,
				recipient: config.agentAddress,
				slippagePercent: config.slippagePercent,
			});

			await ensureAllowance(deps, config.usdc, built.routerAddress as Address, spotNotional);

			const swapTx = await deps.walletClient.sendTransaction({
				// biome-ignore lint/suspicious/noExplicitAny: account is set by the caller.
				account: deps.walletClient.account as any,
				chain: null,
				to: built.routerAddress as Address,
				data: built.data as Hex,
				value: 0n,
			});
			await publicClient.waitForTransactionReceipt({ hash: swapTx });

			activity.push({
				kind: "SPOT_BUY",
				chain: "BASE",
				symbol: config.symbol,
				baseAmount: BigInt(built.amountOut ?? 0),
				notionalAssets: spotNotional,
				pnlAssets: 0n,
				feeAssets: 0n,
				txRef: swapTx,
				occurredAt: at,
			});

			// 2. Margin across to Solana.
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

			// 3. The short. Leverage is set before the order, not after — an order
			// placed at the account's previous leverage would open at the wrong
			// size and have to be corrected, paying taker fees twice.
			await pacifica.updateLeverage(deps.signPacifica, {
				account: config.solanaAddress,
				symbol: config.perpSymbol,
				leverage: Math.round(leverageBps / 10_000),
			});

			const receipt = await pacifica.createMarketOrder(deps.signPacifica, {
				account: config.solanaAddress,
				symbol: config.perpSymbol,
				side: "ask",
				amount: formatUnitsForVenue(BigInt(built.amountOut ?? 0), config.spotTokenDecimals),
				slippagePercent: String(config.slippagePercent),
			});

			activity.push({
				kind: "PERP_OPEN",
				chain: "SOLANA",
				symbol: config.perpSymbol,
				baseAmount: BigInt(built.amountOut ?? 0),
				notionalAssets: spotNotional,
				pnlAssets: 0n,
				feeAssets: 0n,
				// biome-ignore lint/suspicious/noExplicitAny: receipt shape varies.
				txRef: refToHex(String((receipt as any).order_id ?? "")),
				occurredAt: deps.now(),
			});

			return activity;
		},

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

			const sellTx = await deps.walletClient.sendTransaction({
				// biome-ignore lint/suspicious/noExplicitAny: account is set by the caller.
				account: deps.walletClient.account as any,
				chain: null,
				to: built.routerAddress as Address,
				data: built.data as Hex,
				value: 0n,
			});
			await publicClient.waitForTransactionReceipt({ hash: sellTx });

			activity.push({
				kind: "SPOT_SELL",
				chain: "BASE",
				symbol: config.symbol,
				baseAmount: closeUnits,
				notionalAssets: BigInt(built.amountOut ?? 0),
				pnlAssets: 0n,
				feeAssets: 0n,
				txRef: sellTx,
				occurredAt: deps.now(),
			});

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

function abs(value: bigint): bigint {
	return value < 0n ? -value : value;
}

export { parseUnits };
