import { adminApi, type PreparedVault, shortAddress, type VaultableMarket } from "@lemon/client";
import { vaultFactoryAbi } from "@lemon/contracts";
import { Button, Segmented } from "@lemon/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { decodeEventLog } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

/**
 * Creating a vault, in the order the chain forces.
 *
 * A vault's agent wallet is immutable and set in the constructor, so the address
 * has to exist before the vault does. That makes this a three-step flow rather
 * than a form:
 *
 *   1. **Derive** — the server works out the agent's address from the market and
 *      tier. Nothing is created.
 *   2. **Deploy** — the admin's own wallet sends the factory transaction. Not the
 *      server's: creating a vault commits capital and names the agent that will
 *      hold it, and that should carry a human signature rather than being
 *      something a leaked API key can do.
 *   3. **Record** — the venue configuration is written, which is what lets the
 *      agent start trading. Until then the vault exists and the agent refuses to
 *      touch it.
 *
 * Step 1 exists mostly so step 2 is not blind. It is the only moment anyone
 * looks at the wallet about to be handed the whole position.
 */
export function CreateVaultDialog({
	market,
	factoryAddress,
	onClose,
}: {
	market: VaultableMarket;
	factoryAddress: `0x${string}`;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [tier, setTier] = useState<"conservative" | "leveraged">("conservative");
	const [prepared, setPrepared] = useState<PreparedVault | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [preparing, setPreparing] = useState(false);
	const [recording, setRecording] = useState(false);
	const [done, setDone] = useState<string | null>(null);

	const { writeContract, data: hash, isPending } = useWriteContract();
	const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

	// Re-derive whenever the tier changes: the two tiers of one market are
	// separate vaults with separate agents, so the address is not the same.
	useEffect(() => {
		setPrepared(null);
		setError(null);
	}, []);

	const existing =
		tier === "conservative" ? market.existing.conservative : market.existing.leveraged;

	async function onPrepare() {
		setPreparing(true);
		setError(null);
		try {
			setPrepared(await adminApi.prepare({ ticker: market.ticker, tier }));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setPreparing(false);
		}
	}

	function onDeploy() {
		if (!prepared) return;
		setError(null);
		writeContract({
			abi: vaultFactoryAbi,
			address: factoryAddress,
			functionName: "createVault",
			args: [
				prepared.marketId,
				prepared.agentEvmAddress,
				prepared.name,
				prepared.symbol,
				{
					tier: tier === "conservative" ? 0 : 1,
					targetLeverageBps: prepared.targetLeverageBps,
					maxLeverageBps: prepared.maxLeverageBps,
				},
			],
		});
	}

	// Once the transaction confirms, pull the new vault address out of the
	// factory's own event rather than guessing it — CREATE addresses depend on
	// the factory nonce, which is not something to reimplement here.
	useEffect(() => {
		if (!receipt || !prepared || recording || done) return;

		const address = vaultAddressFrom(receipt.logs, factoryAddress);
		if (!address) {
			setError(
				"The transaction confirmed but no VaultCreated event was found in it. The vault may exist; check the factory before retrying.",
			);
			return;
		}

		setRecording(true);
		adminApi
			.record({
				address,
				ticker: prepared.ticker,
				tier: prepared.tier,
				spotTokenAddress: market.spot.address,
				spotTokenDecimals: market.spot.decimals,
				spotTokenSymbol: market.spot.symbol,
				perpSymbol: market.perp.pacificaSymbol,
			})
			.then(() => {
				setDone(address);
				queryClient.invalidateQueries({ queryKey: ["admin-markets"] });
				queryClient.invalidateQueries({ queryKey: ["admin-vaults"] });
				queryClient.invalidateQueries({ queryKey: ["vaults"] });
			})
			.catch((e) =>
				// The vault is deployed either way, so this is a recoverable state
				// rather than a failure — and saying so stops an operator deploying
				// a second one.
				setError(
					`The vault deployed at ${address} but its configuration could not be saved: ${e instanceof Error ? e.message : String(e)}. The agent will not trade it until this is fixed. Do not deploy again.`,
				),
			)
			.finally(() => setRecording(false));
	}, [receipt, prepared, recording, done, market, factoryAddress, queryClient]);

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
			<div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] p-6">
				<h2 className="text-lg font-semibold text-[var(--pon-fg-0)]">New {market.ticker} vault</h2>
				<p className="mt-1 text-sm text-[var(--pon-fg-3)]">{market.name}</p>

				{done ? (
					<div className="mt-5 space-y-4">
						<div className="flex gap-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-lime)]/30 bg-[var(--pon-lime-dim)] p-4">
							<Check className="mt-0.5 size-4 shrink-0 text-[var(--pon-lime)]" />
							<div className="text-sm">
								<p className="font-medium text-[var(--pon-fg-0)]">Vault created</p>
								<p className="mt-1 text-[var(--pon-fg-2)]">
									{shortAddress(done)}. The agent picks it up on its next cycle and will start
									reporting valuations before it trades.
								</p>
							</div>
						</div>
						<Button className="w-full" onClick={onClose}>
							Done
						</Button>
					</div>
				) : (
					<div className="mt-5 space-y-5">
						<div>
							<span className="mb-2 block text-sm font-medium text-[var(--pon-fg)]">Risk tier</span>
							<Segmented<"conservative" | "leveraged">
								options={[
									{ value: "conservative", label: "No leverage" },
									{ value: "leveraged", label: "Leveraged 2–3x" },
								]}
								value={tier}
								onChange={(value) => {
									setTier(value);
									setPrepared(null);
								}}
							/>
							<p className="mt-2 text-xs leading-relaxed text-[var(--pon-fg-3)]">
								{tier === "conservative"
									? "The short leg is fully collateralised. No liquidation price, and yield is funding on capital deployed one-for-one."
									: "The short leg targets 2x with a hard ceiling of 3x, enforced by the contract on every valuation the agent reports. This introduces a liquidation price."}
							</p>
							<p className="mt-2 text-xs text-[var(--pon-fg-4)]">
								The tier is fixed at creation and cannot be changed afterwards — the two are
								different products, and changing one into the other under people who already
								deposited is not something the contract allows.
							</p>
						</div>

						{existing && (
							<div className="flex gap-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-amber)]/30 bg-[var(--pon-amber)]/10 p-4 text-sm text-[var(--pon-fg-2)]">
								<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--pon-amber)]" />
								<p>
									A {tier} vault for {market.ticker} already exists at {shortAddress(existing)}. One
									market and tier gets one vault.
								</p>
							</div>
						)}

						{market.reasons.length > 0 && (
							<div className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4 text-sm">
								<p className="font-medium text-[var(--pon-fg)]">
									This market is not currently tradable
								</p>
								<ul className="mt-2 list-disc space-y-1 pl-4 text-[var(--pon-fg-3)]">
									{market.reasons.map((reason) => (
										<li key={reason}>{reason}</li>
									))}
								</ul>
								<p className="mt-2 text-xs text-[var(--pon-fg-4)]">
									A vault can still be created — it will take deposits and hold them idle until the
									market becomes tradable again.
								</p>
							</div>
						)}

						{prepared && (
							<div className="space-y-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4">
								<p className="text-sm font-medium text-[var(--pon-fg-0)]">
									This wallet will hold the position
								</p>
								<AddressLine label="Agent (Base)" value={prepared.agentEvmAddress} />
								<AddressLine label="Agent (Solana)" value={prepared.agentSolanaAddress} />
								<dl className="space-y-1 text-xs text-[var(--pon-fg-3)]">
									<Field label="Share token" value={prepared.symbol} />
									<Field label="Spot leg" value={`${market.spot.symbol} on Base`} />
									<Field label="Perp leg" value={`${market.perp.pacificaSymbol} on Pacifica`} />
									<Field
										label="Leverage"
										value={`${(prepared.targetLeverageBps / 10_000).toFixed(1)}x target, ${(prepared.maxLeverageBps / 10_000).toFixed(0)}x ceiling`}
									/>
								</dl>
								<p className="text-xs leading-relaxed text-[var(--pon-fg-4)]">
									Derived from NEAR chain signatures, so no private key exists anywhere. It is baked
									into the vault as the only address funds can be sent to, and cannot be changed
									later.
								</p>
							</div>
						)}

						{error && (
							<p className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-down)]/30 bg-[var(--pon-down)]/10 p-3 text-sm text-[var(--pon-down)]">
								{error}
							</p>
						)}

						<div className="flex gap-3">
							<Button variant="outline" className="flex-1" onClick={onClose}>
								Cancel
							</Button>
							{!prepared ? (
								<Button
									className="flex-1"
									onClick={onPrepare}
									disabled={preparing || Boolean(existing)}
								>
									{preparing ? (
										<>
											<Loader2 className="mr-2 size-4 animate-spin" /> Deriving…
										</>
									) : (
										"Derive agent wallet"
									)}
								</Button>
							) : (
								<Button
									className="flex-1"
									onClick={onDeploy}
									disabled={isPending || isConfirming || recording}
								>
									{isPending || isConfirming || recording ? (
										<>
											<Loader2 className="mr-2 size-4 animate-spin" />
											{recording ? "Saving…" : "Deploying…"}
										</>
									) : (
										"Create vault"
									)}
								</Button>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function AddressLine({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex items-center justify-between gap-2 text-xs">
			<span className="text-[var(--pon-fg-3)]">{label}</span>
			<button
				type="button"
				onClick={() => {
					navigator.clipboard.writeText(value);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				}}
				className="inline-flex items-center gap-1.5 font-mono text-[var(--pon-fg)] hover:text-[var(--pon-lime)]"
			>
				{value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value}
				{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
			</button>
		</div>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-2">
			<dt>{label}</dt>
			<dd className="text-[var(--pon-fg)]">{value}</dd>
		</div>
	);
}

/**
 * Read the new vault's address out of the factory's own event.
 *
 * A CREATE address depends on the factory's nonce, and computing it here would
 * be a second implementation of something the receipt already states. Logs from
 * other contracts in the same transaction are skipped by address, and a log that
 * does not decode is skipped rather than throwing — an unrelated event should not
 * lose the operator their vault address.
 */
function vaultAddressFrom(
	logs: readonly { address: string; topics: readonly string[]; data: string }[],
	factoryAddress: string,
): `0x${string}` | null {
	for (const log of logs) {
		if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) continue;
		try {
			const decoded = decodeEventLog({
				abi: vaultFactoryAbi,
				// biome-ignore lint/suspicious/noExplicitAny: viem's log tuple typing.
				topics: log.topics as any,
				data: log.data as `0x${string}`,
			});
			if (decoded.eventName === "VaultCreated") {
				return (decoded.args as { vault: `0x${string}` }).vault;
			}
		} catch {
			// Not one of ours, or an ABI change. Keep looking.
		}
	}
	return null;
}
