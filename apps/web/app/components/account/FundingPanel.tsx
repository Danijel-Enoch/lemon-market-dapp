import { Callout } from "@app/components/common/Callout";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { usePacificaAccount, useRefreshAccount } from "@app/hooks/useAccount";
import { pacificaApi } from "@app/lib/api";
import { erc20Abi } from "@app/lib/erc20";
import { formatUsd, toBaseUnits, USDC_ADDRESS } from "@lemon/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useConnection, useWriteContract } from "wagmi";

/**
 * Moving USDC from the connected wallet into the Pacifica account.
 *
 * Three things happen, and the panel is honest that they are three:
 *
 *   1. The user sends USDC from their own wallet to a bridge address.
 *   2. Relay delivers it to the derived Solana wallet — minutes, not seconds.
 *   3. The server credits it into Pacifica, which needs a signature from that
 *      derived wallet and so cannot be done by the user directly.
 *
 * Step 2 is where funds are visibly gone from one place and not yet in the
 * other. Rather than hide it behind a spinner that could mean anything, the
 * balance in transit is shown for what it is, with the credit step offered as
 * soon as it can succeed.
 */

const MINIMUM_DEPOSIT = 10;

export function FundingPanel() {
	const { address } = useConnection();
	const [amount, setAmount] = useState("");
	const { data: account } = usePacificaAccount();
	const refresh = useRefreshAccount();
	const { writeContractAsync } = useWriteContract();

	const { data: depositStatus } = useQuery({
		queryKey: ["pacifica-deposit-status"],
		queryFn: () => pacificaApi.depositStatus(),
		refetchInterval: 15_000,
	});

	const pending = account?.pendingUsdc ?? 0;
	const parsed = Number(amount);
	const validAmount = Number.isFinite(parsed) && parsed >= MINIMUM_DEPOSIT;

	/** Step 1 and 2: get a bridge address, then send USDC to it from the wallet. */
	const bridge = useMutation({
		mutationFn: async () => {
			const quote = await pacificaApi.fundAddress({
				amount: toBaseUnits(amount, 6).toString(),
			});

			const hash = await writeContractAsync({
				address: USDC_ADDRESS,
				abi: erc20Abi,
				functionName: "transfer",
				args: [quote.depositAddress as `0x${string}`, toBaseUnits(amount, 6)],
			});

			return { hash, quote };
		},
		onSuccess: () => {
			toast.success("Bridging — this usually takes a couple of minutes.");
			setAmount("");
			refresh();
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Bridge failed"),
	});

	/** Step 3: credit what has arrived into Pacifica. */
	const credit = useMutation({
		mutationFn: () => pacificaApi.credit(pending),
		onSuccess: (result) => {
			toast.success(`Credited ${formatUsd(result.amount)} to your Pacifica account`);
			refresh();
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Deposit failed"),
	});

	return (
		<div className="space-y-4 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-3)] p-5">
			<div className="space-y-1">
				<h3 className="t-body font-medium text-[var(--ink-1)]">Add funds</h3>
				<p className="t-label text-[var(--ink-2)]">
					Send USDC from your connected wallet. It bridges to Solana and lands in your Pacifica
					balance.
				</p>
			</div>

			{depositStatus && !depositStatus.available && depositStatus.reason && (
				<Callout tone="warning" title="Deposits are unavailable">
					{depositStatus.reason}
				</Callout>
			)}

			{/* Money that has bridged but is not yet tradable. */}
			{pending > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--surface-4)] px-4 py-3">
					<div>
						<p className="t-caption text-[var(--ink-2)]">Arrived, not yet credited</p>
						<p className="font-fono text-lg text-[var(--ink-1)]">{formatUsd(pending)}</p>
					</div>
					<Button
						size="sm"
						disabled={credit.isPending || pending < MINIMUM_DEPOSIT}
						onClick={() => credit.mutate()}
					>
						{credit.isPending ? (
							<>
								<Loader2 size={14} className="animate-spin" /> Crediting…
							</>
						) : (
							<>
								Credit to Pacifica <ArrowRight size={14} />
							</>
						)}
					</Button>
				</div>
			)}

			<div className="flex flex-wrap gap-2">
				<Input
					value={amount}
					onChange={(event) => setAmount(event.target.value)}
					inputMode="decimal"
					placeholder={`Minimum ${MINIMUM_DEPOSIT} USDC`}
					className="min-w-[180px] flex-1"
					aria-label="Amount in USDC"
				/>
				<Button
					disabled={!address || !validAmount || bridge.isPending}
					onClick={() => bridge.mutate()}
				>
					{bridge.isPending ? "Check your wallet…" : "Send USDC"}
				</Button>
			</div>

			{amount !== "" && !validAmount && (
				<p className="t-micro text-amber-400">
					Pacifica's minimum deposit is {MINIMUM_DEPOSIT} USDC.
				</p>
			)}
		</div>
	);
}
