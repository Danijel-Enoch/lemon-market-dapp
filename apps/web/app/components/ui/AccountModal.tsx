import { Dialog, DialogContent } from "@app/components/ui/dialog";
import { cn } from "@app/lib/utils";
import { formatQuantity } from "@lemon/core";
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
			<DialogContent
				showCloseButton
				className="max-w-sm w-full bg-[#0f1419]/95 backdrop-blur-xl border border-[var(--pon-line)] rounded-lg p-0 overflow-hidden"
			>
				<div className="absolute inset-0 pon-bloom" />

				<div className="relative p-6">
					<div className="flex flex-col items-center gap-4">
						<div className="relative">
							<div className="w-20 h-20 rounded-full bg-linear-to-br from-lime-500/20 to-emerald-500/20 border-2 border-[var(--pon-lime)] flex items-center justify-center shadow-lg shadow-lime-500/10 overflow-hidden">
								{account?.ensAvatar ? (
									<img
										src={account.ensAvatar}
										alt="Avatar"
										className="w-full h-full rounded-full object-cover"
									/>
								) : account?.address ? (
									<img
										src={`https://effigy.im/a/${account.address}.svg`}
										alt="Avatar"
										className="w-full h-full rounded-full object-cover"
									/>
								) : (
									<span className="text-2xl font-bold text-[var(--pon-lime)]">
										{account?.displayName?.[0]?.toUpperCase() ?? "?"}
									</span>
								)}
							</div>
							{chain?.hasIcon && chain?.iconUrl && (
								<div
									className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 border-[#0f1419] shadow-md"
									style={{ background: chain.iconBackground || "#1a1f26" }}
								>
									<img
										src={chain.iconUrl}
										alt={chain.name ?? "Chain"}
										className="w-full h-full rounded-full"
									/>
								</div>
							)}
						</div>

						<div className="text-center space-y-1">
							<h3 className="text-xl font-bold text-white">
								{account?.ensName || account?.displayName}
							</h3>
							<button
								type="button"
								onClick={handleCopy}
								className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--pon-surface-2)] hover:bg-white/10 border border-[var(--pon-line)] transition-all duration-200"
							>
								<span className="text-sm text-[var(--pon-fg-2)] font-fono">{shortenedAddress}</span>
								{copied ? (
									<Check className="w-3.5 h-3.5 text-[var(--pon-lime)]" />
								) : (
									<CopyIcon className="w-3.5 h-3.5 text-[var(--pon-fg-2)] group-hover:text-[var(--pon-lime)] transition-colors" />
								)}
							</button>
						</div>

						{balanceData && (
							<div className="flex items-center gap-2 text-[var(--pon-fg-2)]">
								<Wallet className="w-4 h-4" />
								<span className="text-base font-medium">
									{formatQuantity(
										parseFloat(formatUnits(balanceData.value, balanceData.decimals)),
										4,
									)}{" "}
									{balanceData.symbol}
								</span>
							</div>
						)}
					</div>

					<div className="h-px bg-linear-to-r from-transparent via-white/10 to-transparent my-5" />

					{accountExplorerUrl && (
						<motion.a
							href={accountExplorerUrl}
							target="_blank"
							rel="noreferrer"
							whileHover={{ scale: 1.02 }}
							whileTap={{ scale: 0.98 }}
							className={cn(
								"w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg",
								"bg-[var(--pon-surface-2)] hover:bg-white/10 border border-[var(--pon-line)] hover:border-white/20",
								"text-sm font-medium text-[var(--pon-fg)] hover:text-white transition-all duration-200",
							)}
						>
							<ExternalLinkIcon className="w-4 h-4" />
							<span>View on Explorer</span>
						</motion.a>
					)}

					<motion.button
						type="button"
						onClick={() => {
							disconnect();
							onOpenChange(false);
						}}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
						className={cn(
							"w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 rounded-lg",
							"bg-[var(--pon-down)]/10 hover:bg-[var(--pon-down)]/20",
							"border border-[var(--pon-down)]/30 hover:border-red-500/40",
							"text-sm font-medium text-[var(--pon-down)] hover:text-red-300 transition-all duration-200",
						)}
					>
						<LogOut className="w-4 h-4" />
						<span>Disconnect Wallet</span>
					</motion.button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
