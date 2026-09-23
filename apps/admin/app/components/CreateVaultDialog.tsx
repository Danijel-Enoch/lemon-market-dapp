import {
	adminApi,
	type PacificaAccountStatus,
	type PreparedVault,
	shortAddress,
	usePacificaAccount,
	type VaultableMarket,
} from "@lemon/client";
import { vaultFactoryAbi } from "@lemon/contracts";
import { Button, Segmented } from "@lemon/ui";
import { useAppChain } from "@lemon/wallet";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
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
	chainId,
	factoryAddress,
	onClose,
}: {
	market: VaultableMarket;
	/**
	 * The chain this vault will live on.
	 *
	 * Threaded through every step rather than inferred, because all three of
	 * them depend on it and they must agree: the agent wallet is derived from a
	 * path containing the chain, the factory call goes to that chain's factory,
	 * and the recorded configuration is keyed by it. A mismatch between the
	 * derivation and the transaction would create a vault whose immutable agent
	 * address nobody can sign for.
	 */
	chainId: number;
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

	const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();

	/**
	 * The wallet has to be on the vault's chain before the factory call.
	 *
	 * `chainId` below is pinned on the transaction, so wagmi refuses to sign
	 * rather than send it to the wrong network — correct, and the reason this is
	 * needed: refusing produced "The current chain of the wallet (id: 8453) does
	 * not match the target chain for the transaction (id: 196)" with no way
	 * forward, because nothing in this dialog ever asked the wallet to move. The
	 * switch is a prompt rather than an automatic action: it is the user's wallet
	 * and their decision, and on a chain they have never used it is an
	 * `wallet_addEthereumChain` they should see coming.
	 */
	const { chain: targetChain, onWrongChain, promptSwitch, isSwitching } = useAppChain(chainId);
	const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

	/**
	 * The wallet's own failures, shown.
	 *
	 * `useWriteContract`'s error used to be dropped on the floor here, and this
	 * is the worst place in the app for that: a rejected signature, a wrong
	 * chain, an account without gas or a factory call that reverts on estimation
	 * all resolve in milliseconds, so the button flickers and returns to
	 * "Create vault" with nothing said. The operator clicks it again, and again,
	 * and the console looks broken rather than refused.
	 *
	 * The local `error` wins when set, because it carries the more specific
	 * message — the deployed-but-unrecorded case in particular, which the
	 * operator has to act on differently.
	 */
	const shownError = error ?? (writeError ? writeError.message.split("\n")[0] : null);

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
			setPrepared(await adminApi.prepare({ ticker: market.ticker, tier, chainId }));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setPreparing(false);
		}
	}

	function onDeploy() {
		if (!prepared) return;
		// Belt and braces: the button offers the switch instead of a deploy while
		// this is true, so reaching here means the chain changed under us.
		if (onWrongChain) {
			promptSwitch();
			return;
		}
		setError(null);
		writeContract({
			abi: vaultFactoryAbi,
			address: factoryAddress,
			// Pinned so wagmi refuses rather than sends if the wallet is on another
			// chain. Unpinned, a factory call meant for Arbitrum would be signed
			// against whatever chain the wallet happened to be on — reverting at
			// best, and at worst hitting a different contract at the same address.
			chainId,
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

		// A reverted transaction still produces a receipt — `waitForTransactionReceipt`
		// resolves for it rather than throwing. Without this check the failure fell
		// through to the "no VaultCreated event" branch below, which tells the
		// operator the transaction *confirmed* and the vault *may exist*. Both are
		// wrong for a plain revert, and the second one is the sentence that stops
		// them retrying the thing that would have worked.
		if (receipt.status === "reverted") {
			setError(
				"The transaction reverted, so no vault was created. The most likely cause is that this market and tier already has one — reload the market list before retrying.",
			);
			return;
		}

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
				chainId,
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
	}, [receipt, prepared, recording, done, market, chainId, factoryAddress, queryClient]);

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
			{/*
			  Named as a dialog rather than left as a div. Without the role a
			  screen reader announces this as more of the page it covers, and the
			  market list behind it stays in the reading order — so an operator
			  can be reading the row for one market while the form in front of
			  them is about another.
			*/}
			<div
				role="dialog"
				aria-modal="true"
				aria-label={`New ${market.ticker} vault`}
				className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--pon-r-lg,16px)] border border-[var(--pon-line-2)] bg-[var(--pon-bg-2)] p-6"
			>
				<h2 className="text-lg font-semibold text-[var(--pon-fg-0)]">New {market.ticker} vault</h2>
				<p className="mt-1 text-sm text-[var(--pon-fg-3)]">{market.name}</p>

				{done ? (
					<div className="mt-5 space-y-4">
						<div className="flex gap-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-ink)] bg-[var(--pon-lime-dim)] p-4">
							<Check className="mt-0.5 size-4 shrink-0 text-[var(--pon-lime)]" />
							<div className="text-sm">
								<p className="font-medium text-[var(--pon-fg-0)]">Vault created</p>
								<p className="mt-1 text-[var(--pon-fg-2)]">
									{shortAddress(done)}. The agent picks it up on its next cycle and will start
									reporting valuations before it trades.
								</p>
							</div>
						</div>

						<PacificaSetup vault={done} />

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
							<div className="flex gap-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-amber)] bg-[var(--pon-lime-dim)] p-4 text-sm text-[var(--pon-fg-2)]">
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

						{shownError && (
							<p className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-down)] bg-[var(--pon-lime-dim)] p-3 text-sm text-[var(--pon-down)]">
								{shownError}
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
							) : onWrongChain ? (
								/* Named, not "wrong network": the operator picked this chain a
								   step ago, so the useful sentence is which one to move to. */
								<Button className="flex-1" onClick={promptSwitch} disabled={isSwitching}>
									{isSwitching ? (
										<>
											<Loader2 className="mr-2 size-4 animate-spin" />
											Switching…
										</>
									) : (
										`Switch wallet to ${targetChain.name}`
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

/**
 * The last step of creating a vault: the agent's Pacifica side.
 *
 * Offered here rather than left to the agent because of what the first deposit
 * looks like if it is not ready. Pacifica keys accounts by Solana address and
 * registers one the first time USDC arrives — there is no account to create at
 * the venue. What has to exist first is the USDC token account that deposit is
 * signed from, which costs rent that the agent's own wallet cannot pay: it
 * holds USDC and never SOL, so a separate fee payer covers it.
 *
 * The bridge already creates that account idempotently on the first crossing,
 * so nothing here is load-bearing. What it buys is *when* a misconfigured or
 * empty fee payer is discovered. Left alone, that discovery happens mid-bridge,
 * with a depositor's capital already drawn out of the vault and in the air
 * between two chains. Done here it costs a click and a few thousand lamports.
 */
function PacificaSetup({ vault }: { vault: string }) {
	const queryClient = useQueryClient();
	const { data: status, isLoading, error: loadError } = usePacificaAccount(vault, true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<{ summary: string; url: string | null } | null>(null);

	async function onSetUp() {
		setBusy(true);
		setError(null);
		try {
			const { setup } = await adminApi.setUpPacificaAccount(vault);
			setResult({ summary: setup.summary, url: setup.explorerUrl });
			queryClient.invalidateQueries({ queryKey: ["admin-pacifica-account", vault] });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	if (isLoading) {
		return (
			<p className="flex items-center gap-2 text-xs text-[var(--pon-fg-4)]">
				<Loader2 className="size-3.5 animate-spin" /> Checking the agent's Pacifica account…
			</p>
		);
	}

	// A vault that exists with an unchecked Pacifica side is still a working
	// vault — the bridge sets it up on its own. So this reports and moves on
	// rather than turning a successful creation into a failure screen.
	if (loadError || !status) {
		return (
			<p className="rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4 text-xs leading-relaxed text-[var(--pon-fg-3)]">
				The agent's Pacifica account could not be checked from here:{" "}
				{loadError instanceof Error ? loadError.message : "no answer"}. The vault is created and the
				agent creates the account itself on its first bridge, so this is worth a look but not
				blocking.
			</p>
		);
	}

	return (
		<div className="space-y-3 rounded-[var(--pon-r-md,12px)] border border-[var(--pon-line-2)] bg-[var(--pon-surface)] p-4">
			<div>
				<p className="text-sm font-medium text-[var(--pon-fg-0)]">Pacifica account</p>
				<p className="mt-1 text-xs leading-relaxed text-[var(--pon-fg-3)]">{describe(status)}</p>
			</div>

			<AddressLine label="Account" value={status.account} />
			<AddressLine label="USDC account" value={status.tokenAccount} />

			{status.blockedReason && !status.tokenAccountExists && (
				<p className="text-xs leading-relaxed text-[var(--pon-amber)]">{status.blockedReason}</p>
			)}

			{result ? (
				<p className="text-xs leading-relaxed text-[var(--pon-up)]">
					{result.summary}
					{result.url && (
						<>
							{" "}
							<a
								href={result.url}
								target="_blank"
								rel="noreferrer noopener"
								className="inline-flex items-center gap-1 underline hover:text-[var(--pon-lime)]"
							>
								Transaction <ExternalLink className="size-3" />
							</a>
						</>
					)}
				</p>
			) : (
				<Button
					variant="outline"
					size="sm"
					className="w-full"
					disabled={busy || !status.canSetUp}
					onClick={onSetUp}
				>
					{busy ? (
						<>
							<Loader2 className="mr-1.5 size-3.5 animate-spin" /> Creating…
						</>
					) : status.tokenAccountExists ? (
						"Already set up"
					) : (
						"Create Pacifica account"
					)}
				</Button>
			)}

			{error && <p className="text-xs leading-relaxed text-[var(--pon-down)]">{error}</p>}
		</div>
	);
}

/** One sentence for whichever of the three states the account is in. */
function describe(status: PacificaAccountStatus): string {
	if (status.registered) {
		return `Pacifica already knows this account${status.equityUsd ? `, holding ${status.equityUsd} USD of equity` : ""}. Nothing to do.`;
	}
	if (status.tokenAccountExists) {
		return `The USDC account exists. Pacifica registers the account itself on the agent's first deposit of at least ${status.minimumDepositUsdc} USDC.`;
	}
	return `Pacifica has no account to create — it registers one on the first deposit. What this creates is the USDC account the agent deposits from, whose rent its own wallet cannot pay.`;
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
