import {
	adminApi,
	useVaultMarkets,
	type Vault,
	type VaultableMarket,
	type VaultMarketConfig,
} from "@lemon/client";
import { Button, cn } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Which markets a vault runs, and in what proportion.
 *
 * A vault used to be one market by construction. On-chain it still looks like
 * one — `marketId` is set in the constructor and never changes — but that was
 * always a label rather than a constraint: the contract holds USDC, bounds what
 * the agent may withdraw, and checks the leverage it reports, and none of that
 * is per-market. So a vault can run a basis position in BTC, ETH and NVDA at
 * once, and this is where an operator says so.
 *
 * Two things about the form are load-bearing.
 *
 * **It is a set, not a list of edits.** Weights only mean anything together, so
 * the whole set goes in one request. Three individually reasonable requests can
 * leave a vault weighted to 140% between the second and the third, and an agent
 * ticking in that window deploys against it.
 *
 * **Removing is retiring.** A vault can hold a position in a market an operator
 * has changed their mind about, and deleting the row would make that position
 * invisible to the agent — unpriced in the NAV, unsellable, sitting in a wallet.
 * So a removed market keeps its row with a target of zero, which makes it the
 * most overweight market the vault has: the next unwind drains it first and no
 * new capital goes near it. The form says so rather than implying a delete.
 */
export function VaultMarketsDialog({
	vault,
	board,
	onClose,
}: {
	vault: Vault;
	/** The curated basis board. The pairing is never resolved from a ticker here. */
	board: VaultableMarket[];
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const { data, isLoading } = useVaultMarkets(vault.address, true);

	const [rows, setRows] = useState<Row[] | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Seeded from the server once, then owned by the form. Re-seeding on every
	// fetch would discard a half-typed set of weights the moment a background
	// refetch landed.
	useEffect(() => {
		if (data && rows === null) {
			setRows(data.markets.filter((m) => m.enabled).map(toRow));
		}
	}, [data, rows]);

	const current = rows ?? [];
	const total = current.reduce((sum, row) => sum + row.targetWeightBps, 0);
	const balanced = total === 10_000;

	// Markets already on the vault are not offered again, and neither are ones
	// the board says cannot be traded — a market a vault can take capital for and
	// not deploy into is worse than one it does not have.
	const taken = new Set(current.map((row) => row.ticker));
	const available = board
		.filter((m) => !taken.has(m.ticker.toUpperCase()))
		.filter((m) => m.spotTradable && m.reasons.length === 0);

	// Retired markets are shown rather than hidden. A vault holding a position in
	// a market nobody wants any more is exactly the state an operator has to be
	// able to see, and it disappears from the list the moment it is drained.
	const retired = (data?.markets ?? []).filter(
		(m) => !m.enabled || !taken.has(m.ticker.toUpperCase()),
	);

	function setWeight(ticker: string, percent: number) {
		setRows((previous) =>
			(previous ?? []).map((row) =>
				row.ticker === ticker
					? { ...row, targetWeightBps: Math.round(Math.min(100, Math.max(0, percent)) * 100) }
					: row,
			),
		);
	}

	function add(market: VaultableMarket) {
		setRows((previous) => [
			...(previous ?? []),
			{
				ticker: market.ticker.toUpperCase(),
				spotTokenSymbol: market.spot.symbol,
				perpSymbol: market.perp.pacificaSymbol,
				targetWeightBps: 0,
			},
		]);
	}

	function remove(ticker: string) {
		setRows((previous) => (previous ?? []).filter((row) => row.ticker !== ticker));
	}

	/**
	 * Spread the weights evenly across whatever is in the list.
	 *
	 * The remainder goes on the first market rather than being dropped, because
	 * three markets do not divide 10,000 and a set that sums to 9,999 is refused
	 * by the server — correctly, since a set that does not add up is far more
	 * often a typo than an intention to leave a sliver idle.
	 */
	function distribute() {
		setRows((previous) => {
			const list = previous ?? [];
			if (list.length === 0) return list;
			const share = Math.floor(10_000 / list.length);
			const remainder = 10_000 - share * list.length;
			return list.map((row, index) => ({
				...row,
				targetWeightBps: share + (index === 0 ? remainder : 0),
			}));
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			await adminApi.setVaultMarkets(
				vault.address,
				current.map((row) => ({ ticker: row.ticker, targetWeightBps: row.targetWeightBps })),
				// The vault's own chain. Without it the API resolves the address,
				// which is correct but refuses when the same address is a vault on
				// two chains — and here the caller already knows which one.
				vault.chainId,
			);
			queryClient.invalidateQueries({ queryKey: ["admin-vault-markets", vault.address] });
			queryClient.invalidateQueries({ queryKey: ["admin-vaults"] });
			queryClient.invalidateQueries({ queryKey: ["vaults"] });
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
			<div
				role="dialog"
				aria-modal="true"
				aria-label={`Markets for ${vault.ticker ?? vault.symbol}`}
				className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-6"
			>
				<header className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-lg font-medium text-[var(--pon-fg-0)]">
							Markets · {vault.ticker ?? vault.symbol}
						</h2>
						<p className="mt-1 text-sm text-[var(--pon-fg-3)]">
							The agent runs one basis position per market, sharing a single margin account. It
							deploys into whichever market is furthest below its share, one per tick, so the
							weights are reached over time rather than in one trade.
						</p>
					</div>
					<Button variant="ghost" size="sm" onClick={onClose}>
						Close
					</Button>
				</header>

				{isLoading || rows === null ? (
					<p className="mt-6 flex items-center gap-2 text-sm text-[var(--pon-fg-3)]">
						<Loader2 className="size-4 animate-spin" /> Reading the vault's markets…
					</p>
				) : (
					<>
						<ul className="mt-5 divide-y divide-[var(--pon-line)] overflow-hidden rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)]">
							{current.length === 0 && (
								<li className="px-4 py-6 text-center text-sm text-[var(--pon-fg-3)]">
									No markets. A vault needs at least one — to stand it down instead, close its
									positions.
								</li>
							)}
							{current.map((row) => (
								<li key={row.ticker} className="flex items-center gap-3 px-4 py-3">
									<div className="min-w-0 flex-1">
										<p className="font-medium text-[var(--pon-fg-0)]">{row.ticker}</p>
										<p className="font-mono text-[11px] text-[var(--pon-fg-4)]">
											{row.spotTokenSymbol} on Base · {row.perpSymbol} perp
										</p>
									</div>
									<label className="flex items-center gap-1.5">
										<span className="sr-only">{row.ticker} target weight, percent</span>
										<input
											type="number"
											min={0}
											max={100}
											step={0.5}
											value={row.targetWeightBps / 100}
											onChange={(e) => setWeight(row.ticker, Number(e.target.value))}
											className="w-20 rounded-[var(--pon-r-sm,8px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] px-2 py-1 text-right tabular-nums text-[var(--pon-fg-0)]"
										/>
										<span className="text-sm text-[var(--pon-fg-3)]">%</span>
									</label>
									<Button
										variant="ghost"
										size="sm"
										aria-label={`Retire ${row.ticker}`}
										onClick={() => remove(row.ticker)}
									>
										<Trash2 className="size-3.5" />
									</Button>
								</li>
							))}
						</ul>

						<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
							<p
								className={cn(
									"text-sm tabular-nums",
									balanced ? "text-[var(--pon-fg-3)]" : "text-[var(--pon-amber)]",
								)}
							>
								{(total / 100).toFixed(2)}% allocated
								{!balanced && " — the weights have to add up to 100%"}
							</p>
							<Button variant="outline" size="sm" onClick={distribute} disabled={!current.length}>
								Split evenly
							</Button>
						</div>

						{retired.length > 0 && (
							<div className="mt-5 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line)] bg-[var(--pon-bg-2)] p-4">
								<h3 className="text-sm font-medium text-[var(--pon-fg-0)]">Retired</h3>
								<p className="mt-1 text-xs text-[var(--pon-fg-3)]">
									Kept, not deleted. The vault may still hold a position in these, and a deleted
									market is one the agent can no longer see, value or sell. Their target is zero,
									which makes them the first place the next unwind takes from.
								</p>
								<ul className="mt-2 flex flex-wrap gap-2">
									{retired.map((market) => (
										<li
											key={market.ticker}
											className="rounded-[var(--pon-r-sm)] border border-[var(--pon-line)] px-2.5 py-1 font-mono text-[11px] text-[var(--pon-fg-2)]"
										>
											{market.ticker}
										</li>
									))}
								</ul>
							</div>
						)}

						{available.length > 0 && (
							<div className="mt-5">
								<h3 className="text-sm font-medium text-[var(--pon-fg-0)]">Add a market</h3>
								<p className="mt-1 text-xs text-[var(--pon-fg-3)]">
									Only markets whose spot leg can be bought and sold on Base today. The token and
									perp pairing is resolved on the server from the curated board — never from the
									ticker.
								</p>
								<ul className="mt-2 flex flex-wrap gap-2">
									{available.map((market) => (
										<li key={market.id}>
											<Button variant="outline" size="sm" onClick={() => add(market)}>
												<Plus className="mr-1 size-3" />
												{market.ticker}
											</Button>
										</li>
									))}
								</ul>
							</div>
						)}

						{error && (
							<div className="mt-5 flex gap-2 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-down)] bg-[var(--pon-lime-dim)] p-3 text-sm">
								<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--pon-down)]" />
								<p className="text-[var(--pon-fg-2)]">{error}</p>
							</div>
						)}

						<footer className="mt-6 flex justify-end gap-2">
							<Button variant="ghost" onClick={onClose}>
								Cancel
							</Button>
							<Button
								variant="shine"
								disabled={saving || !balanced || current.length === 0}
								onClick={save}
							>
								{saving ? "Saving…" : "Save markets"}
							</Button>
						</footer>
					</>
				)}
			</div>
		</div>
	);
}

interface Row {
	ticker: string;
	spotTokenSymbol: string;
	perpSymbol: string;
	targetWeightBps: number;
}

function toRow(market: VaultMarketConfig): Row {
	return {
		ticker: market.ticker,
		spotTokenSymbol: market.spotTokenSymbol,
		perpSymbol: market.perpSymbol,
		targetWeightBps: market.targetWeightBps,
	};
}
