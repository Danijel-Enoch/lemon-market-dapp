"use client";

import toast from "react-hot-toast";

import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { formatUnits, parseUnits } from "viem";
import {
	useAccount,
	useReadContract,
	useSendTransaction,
	useWaitForTransactionReceipt,
	useWriteContract,
} from "wagmi";

import { AuthGate } from "@app/components/ui/AuthGate";
import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@app/components/ui/select";
import { ERC20Abi, lpContract, usdc } from "@app/lib/contracts"; // Removed SyntheticAbi
import { addLiquidity, getMarkets, type Market } from "@app/lib/liquidity-api";

// Helper to format balance
const formatBalance = (balance?: bigint, decimals = 6) => {
	if (!balance) return "0.00";
	return Number(formatUnits(balance, decimals)).toFixed(2);
};

function AddLiquidityContent() {
	const navigate = useNavigate();
	const { address, chainId } = useAccount();
	const [amount, setAmount] = useState("");
	const [selectedMarketId, setSelectedMarketId] = useState<string>("");
	const [markets, setMarkets] = useState<Market[]>([]);
	const [isMarketsLoading, setIsMarketsLoading] = useState(true);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);

	// Contracts state
	const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
		address: usdc,
		abi: ERC20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: !!address },
	});

	const { data: allowance, refetch: refetchAllowance } = useReadContract({
		address: usdc,
		abi: ERC20Abi,
		functionName: "allowance",
		args: address ? [address, lpContract] : undefined,
		query: { enabled: !!address },
	});

	// Write hooks
	const {
		writeContract: writeApprove,
		data: approveHash,
		isPending: isApprovePending,
		error: approveError,
	} = useWriteContract();

	const {
		sendTransaction,
		data: addLiquidityHash,
		isPending: isAddLiquidityPending,
		error: addLiquidityError,
	} = useSendTransaction();

	// Transaction wait hooks
	const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } =
		useWaitForTransactionReceipt({
			hash: approveHash,
		});

	const { isLoading: isAddLiquidityConfirming, isSuccess: isAddLiquiditySuccess } =
		useWaitForTransactionReceipt({
			hash: addLiquidityHash,
		});

	// Fetch markets on mount
	useEffect(() => {
		const fetchMarkets = async () => {
			try {
				const response = await getMarkets();
				if (response.success && response.data.length > 0) {
					setMarkets(response.data);
					setSelectedMarketId(response.data[0].onChainData.marketId.split("-")[0]); // Default to first market
				}
			} catch (e) {
				console.error("Failed to fetch markets", e);
				setApiError("Failed to backend markets. Please try again later.");
			} finally {
				setIsMarketsLoading(false);
			}
		};
		fetchMarkets();
	}, []);

	// Refetch data after success
	useEffect(() => {
		if (isApproveSuccess) {
			toast.success("Approval successful! You can now add liquidity.");
			refetchAllowance();
		}
	}, [isApproveSuccess, refetchAllowance]);

	useEffect(() => {
		if (isAddLiquiditySuccess) {
			refetchBalance();
			// Optional: Show success toast or navigate
		}
	}, [isAddLiquiditySuccess, refetchBalance]);

	// Handlers
	const handleApprove = () => {
		if (!amount) return;
		const amountBigInt = parseUnits(amount, 6); // USDC has 6 decimals
		writeApprove({
			address: usdc,
			abi: ERC20Abi,
			functionName: "approve",
			args: [lpContract, amountBigInt],
		});
	};

	const handleAddLiquidity = async () => {
		if (!amount || !address || !selectedMarketId) return;
		setIsSubmitting(true);
		setApiError(null);

		try {
			const response = await addLiquidity({
				amount: amount,
				userAddress: address,
				chainId,
				marketId: selectedMarketId,
			});
			console.log({ response });

			if (response.success && response.data) {
				const { transactionData } = response.data;
				const { to, data, value, gasEstimate } = transactionData;
				sendTransaction({
					to: to as `0x${string}`,
					data: data as `0x${string}`,
					value: value ? BigInt(value) : BigInt(0),
					gas: gasEstimate ? BigInt(gasEstimate) : undefined,
				});
			} else {
				setApiError(response.error || "Failed to get transaction data");
			}
		} catch (err) {
			setApiError(err instanceof Error ? err.message : "An unknown error occurred");
		} finally {
			setIsSubmitting(false);
		}
	};

	const isLoading =
		isApprovePending ||
		isApproveConfirming ||
		isAddLiquidityPending ||
		isAddLiquidityConfirming ||
		isSubmitting;
	const amountBigInt = amount ? parseUnits(amount, 6) : BigInt(0);
	const hasAllowance = allowance ? allowance >= amountBigInt : false;
	const hasBalance = usdcBalance ? usdcBalance >= amountBigInt : false;
	const isAmountValid = amountBigInt > BigInt(0);

	return (
		<div className="min-h-screen w-full mt-8 max-w-lg mx-auto">
			<div className="flex justify-between items-center mb-6">
				<Button
					variant="ghost"
					className="pl-0 hover:bg-transparent hover:text-white"
					onClick={() => navigate("/liquidity")}
				>
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back to Liquidity
				</Button>
				<Button
					variant="link"
					className="text-muted-foreground hover:text-primary"
					onClick={() => navigate("/liquidity/remove")}
				>
					Remove Liquidity →
				</Button>
			</div>

			<Card className="border-accent/20">
				<CardHeader>
					<CardTitle>Add Liquidity</CardTitle>
					<CardDescription>Deposit USDC to earn trading fees.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="space-y-2">
						<Label>Select Market</Label>
						{isMarketsLoading ? (
							<div className="h-10 w-full animate-pulse bg-muted rounded-md" />
						) : (
							<Select
								value={selectedMarketId}
								onValueChange={setSelectedMarketId}
								disabled={isLoading || markets.length === 0}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a market" />
								</SelectTrigger>
								<SelectContent>
									{markets.map((m) => (
										<SelectItem key={m.onChainData.marketId} value={m.onChainData.marketId}>
											{m.onChainData.marketId.split("-")[0]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>

					<div className="space-y-2">
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">Amount (USDC)</span>
							<span className="text-muted-foreground">
								Balance: {formatBalance(usdcBalance)} USDC
							</span>
						</div>
						<div className="relative">
							<Input
								type="number"
								placeholder="0.00"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								className="pr-16"
								min="0"
							/>
							<Button
								variant="ghost"
								size="sm"
								className="absolute right-1 top-1 h-8 text-xs text-primary"
								onClick={() => usdcBalance && setAmount(formatUnits(usdcBalance, 6))}
							>
								MAX
							</Button>
						</div>
					</div>

					<div className="bg-orange-950/30 border border-orange-500/30 p-3 rounded-md text-sm text-orange-400">
						<p className="font-medium mb-1">Disclaimer</p>
						<p className="text-xs opacity-90">
							Your liquidity is used to pay out winning trades. You may lose your funds if traders
							win. Please check market conditions before adding liquidity.
						</p>
					</div>

					<div className="space-y-4">
						{!hasAllowance && isAmountValid ? (
							<Button
								className="w-full"
								onClick={handleApprove}
								disabled={isLoading || !hasBalance}
							>
								{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
								{isApprovePending || isApproveConfirming ? "Approving..." : "Approve USDC"}
							</Button>
						) : (
							<Button
								className="w-full"
								onClick={handleAddLiquidity}
								disabled={isLoading || !isAmountValid || !hasBalance || !selectedMarketId}
							>
								{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
								{isAddLiquidityPending || isAddLiquidityConfirming || isSubmitting
									? "Adding Liquidity..."
									: "Add Liquidity"}
							</Button>
						)}

						{!hasBalance && isAmountValid && (
							<p className="text-sm text-center text-red-500">Insufficient balance</p>
						)}

						{approveError && (
							<p className="text-sm text-center text-red-500">
								Approval failed: {approveError.message.slice(0, 50)}...
							</p>
						)}

						{addLiquidityError && (
							<p className="text-sm text-center text-red-500">
								Transaction failed: {addLiquidityError.message.slice(0, 50)}...
							</p>
						)}

						{apiError && <p className="text-sm text-center text-red-500">{apiError}</p>}

						{isAddLiquiditySuccess && !isLoading && (
							<p className="text-sm text-center text-green-500">Liquidity added successfully!</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export default function AddLiquidityPage() {
	return (
		<AuthGate
			icon={Wallet}
			title="Connect Wallet to Add Liquidity"
			description="Connect your wallet to deposit USDC."
		>
			<AddLiquidityContent />
		</AuthGate>
	);
}
