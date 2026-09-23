import { formatQuantity } from "@lemon/core";
import { cn, Dialog, DialogContent } from "@lemon/ui";
import { motion } from "framer-motion";
import { Check, CopyIcon, ExternalLinkIcon, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { formatUnits } from "viem/utils";
import { useBalance, useDisconnect } from "wagmi";

interface WagmiAccount {
	address: string;
	balanceDecimals?: number;
	balanceFormatted?: string;
	balanceSymbol?: string;
	displayBalance?: string;
	displayName: string;
	ensAvatar?: string;
	ensName?: string;
	hasPendingTransactions: boolean;
}

interface ChainInfo {
	hasIcon: boolean;
	iconUrl?: string | undefined;
	iconBackground?: string | undefined;
	id: number;
	name?: string | undefined;
	unsupported?: boolean | undefined;
	blockExplorers?: {
		default?: {
			url?: string;
		};
	};
}

interface AccountModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	account?: WagmiAccount;
	chain?: ChainInfo;
}

export function AccountModal({ open, onOpenChange, account, chain }: AccountModalProps) {
	const { disconnect } = useDisconnect();
	const [copied, setCopied] = useState(false);

	const { data: balanceData } = useBalance({
		address: account?.address as `0x${string}` | undefined,
	});

	const handleCopy = async () => {
		if (!account) return;
		try {
			if (account.address) await navigator.clipboard.writeText(account.address);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch (_e) {
			// ignore failure
		}
	};

	const explorerUrl = chain?.blockExplorers?.default?.url;
	const accountExplorerUrl = explorerUrl
		? `${explorerUrl.replace(/\/$/, "")}/address/${account?.address}`
		: null;

	const shortenedAddress = account?.address
		? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
		: "";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton className="w-full max-w-sm p-0">
				<div className="p-6">
					{/* Identity. The avatar is framed as a square like every other
					    image in the system — a round portrait is the one shape that
					    would give away that this panel came from somewhere else. */}
					<div className="flex flex-col items-center gap-4">
						<div className="relative">
							<div className="flex size-20 items-center justify-center overflow-hidden rounded-[var(--pon-r-sm)] border border-[var(--pon-ink)] bg-[var(--pon-lime-dim)]">
								{account?.ensAvatar ? (
									<img src={account.ensAvatar} alt="Avatar" className="size-full object-cover" />
								) : account?.address ? (
									<img
										src={`https://effigy.im/a/${account.address}.svg`}
										alt="Avatar"
										className="size-full object-cover"
									/>
								) : (
									<span className="font-display text-3xl font-extrabold text-[var(--pon-ink)]">
										{account?.displayName?.[0]?.toUpperCase() ?? "?"}
									</span>
								)}
							</div>
							{chain?.hasIcon && chain?.iconUrl && (
								<div
									className="absolute -right-1.5 -bottom-1.5 size-6 overflow-hidden rounded-[var(--pon-r-sm)] border border-[var(--pon-ink)]"
									style={{ background: chain.iconBackground || "var(--pon-paper)" }}
								>
									<img src={chain.iconUrl} alt={chain.name ?? "Chain"} className="size-full" />
								</div>
							)}
						</div>

						<div className="space-y-2 text-center">
							<h3 className="t-h3 text-[var(--pon-fg-0)]">
								{account?.ensName || account?.displayName}
							</h3>
							<button
								type="button"
								onClick={handleCopy}
								className="group flex items-center gap-2 rounded-[var(--pon-r-sm)] border border-[var(--pon-line-2)] px-3 py-1.5 transition-colors hover:bg-[var(--pon-lime-dim)]"
							>
								<span className="font-fono text-[12.5px] text-[var(--pon-fg-2)]">
									{shortenedAddress}
								</span>
								{copied ? (
									<Check className="size-3.5 text-[var(--pon-fg-0)]" />
								) : (
									<CopyIcon className="size-3.5 text-[var(--pon-fg-3)] transition-colors group-hover:text-[var(--pon-fg-0)]" />
								)}
							</button>
						</div>

						{balanceData && (
							<div className="flex items-center gap-2 text-[var(--pon-fg-2)]">
								<Wallet className="size-4" />
								<span className="font-fono text-[13px] font-bold">
									{formatQuantity(
										parseFloat(formatUnits(balanceData.value, balanceData.decimals)),
										4,
									)}{" "}
									{balanceData.symbol}
								</span>
							</div>
						)}
					</div>

					<div className="my-5 h-px bg-[var(--pon-line)]" />

					{accountExplorerUrl && (
						<motion.a
							href={accountExplorerUrl}
							target="_blank"
							rel="noreferrer"
							whileTap={{ scale: 0.99 }}
							className={cn(
								"flex w-full items-center justify-center gap-2 rounded-[var(--pon-r-lg)] border border-[var(--pon-line-2)] px-4 py-2.5",
								"font-mono text-[12.5px] tracking-[-0.02em] text-[var(--pon-fg)] transition-colors",
								"hover:bg-[var(--pon-ink)] hover:text-[var(--pon-on-lime)]",
							)}
						>
							<ExternalLinkIcon className="size-4" />
							<span>View on Explorer</span>
						</motion.a>
					)}

					<motion.button
						type="button"
						onClick={() => {
							disconnect();
							onOpenChange(false);
						}}
						whileTap={{ scale: 0.99 }}
						className={cn(
							"mt-2.5 flex w-full items-center justify-center gap-2 rounded-[var(--pon-r-lg)] border border-[var(--pon-down)] px-4 py-2.5",
							"font-mono text-[12.5px] tracking-[-0.02em] text-[var(--pon-down)] transition-colors",
							"hover:bg-[var(--pon-down)] hover:text-[var(--pon-paper)]",
						)}
					>
						<LogOut className="size-4" />
						<span>Disconnect Wallet</span>
					</motion.button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
