import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface AccountModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	account?: any;
	chain?: any;
	openConnectModal?: () => void;
}

export function AccountModal({
	open,
	onOpenChange,
	account,
	chain,
	openConnectModal,
}: AccountModalProps) {
	const { disconnect } = useDisconnect();
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		if (!account) return;
		try {
			await navigator.clipboard.writeText(account.address);
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md w-full">
				<DialogHeader>
					<DialogTitle>Account</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-4 mt-2">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center font-mono">
							{account?.displayName?.[0] ?? account?.address?.slice(0, 2)}
						</div>
						<div className="flex-1">
							<div className="flex items-center gap-2">
								<div className="font-semibold">
									{account?.displayName ?? account?.ensName ?? account?.address}
								</div>
								<div className="text-muted-foreground text-sm">
									{account?.displayBalance?.value
										? account.displayBalance.formatted
										: account?.displayBalance}
								</div>
							</div>
							<div className="text-sm text-muted-foreground mt-1">{account?.address}</div>
						</div>
					</div>

					<div className="flex gap-2">
						<Button variant="outline" size="default" onClick={handleCopy}>
							<CopyIcon />
							{copied ? "Copied" : "Copy address"}
						</Button>

						{accountExplorerUrl && (
							<a
								href={accountExplorerUrl}
								target="_blank"
								rel="noreferrer"
								className={cn("w-full")}
							>
								<Button size="default" variant="ghost" asChild>
									<span>
										<ExternalLinkIcon className="mr-2" />
										View on explorer
									</span>
								</Button>
							</a>
						)}
					</div>

					<div className="flex gap-2">
						<Button variant="secondary" size="default" onClick={() => openConnectModal?.()}>
							Change wallet
						</Button>
						<Button
							variant="destructive"
							size="default"
							onClick={() => {
								disconnect();
								onOpenChange(false);
							}}
						>
							Disconnect
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
