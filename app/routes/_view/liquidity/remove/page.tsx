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
import { Slider } from "@app/components/ui/slider";
import { ERC20Abi, lpContract } from "@app/lib/contracts";
import {
	getMarkets,
	removeLiquidity,
	getLiquidityPositions,
	type Market,
	type LiquidityPosition,
} from "@app/lib/liquidity-api";

function RemoveLiquidityContent() {
	const navigate = useNavigate();
	const { address, chainId } = useAccount();
	const [amount, setAmount] = useState("");
	const [selectedMarketId, setSelectedMarketId] = useState<string>("");
	const [markets, setMarkets] = useState<Market[]>([]);
	const [positions, setPositions] = useState<LiquidityPosition[]>([]);
	const [isMarketsLoading, setIsMarketsLoading] = useState(true);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);

	console.log("State Debug:", {
		selectedMarketId,
		positionsCount: positions.length,
	});

	const selectedPosition = positions.find(
		(p) => p.marketId === selectedMarketId || p.onChainData?.marketId === selectedMarketId,
	);

	// Determine LP Token Address
	const lpTokenAddress = selectedPosition?.lpTokenDetails?.lpToken || selectedPosition?.lp;

	console.log("Derived Debug:", {
		selectedPosition,
		lpTokenAddress,
	});

	// Allowance check
	const { data: allowance, refetch: refetchAllowance } = useReadContract({
		address: lpTokenAddress as `0x${string}`,
		abi: ERC20Abi,
		functionName: "allowance",
		args: address ? [address, lpContract] : undefined,
		query: { enabled: !!address && !!lpTokenAddress },
	});

	// Balance check (LP Token)
	const { data: lpBalance, refetch: refetchLpBalance } = useReadContract({
		address: lpTokenAddress as `0x${string}`,
		abi: ERC20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: !!address && !!lpTokenAddress },
	});

	console.log("LP Balance Debug:", {
		lpBalance,
		formatted: lpBalance ? formatUnits(lpBalance as bigint, 18) : "N/A",
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
		data: removeLiquidityHash,
		isPending: isRemoveLiquidityPending,
		error: removeLiquidityError,
	} = useSendTransaction();

	// Transaction wait hooks
	const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } =
		useWaitForTransactionReceipt({
			hash: approveHash,
		});

	const { isLoading: isRemoveLiquidityConfirming, isSuccess: isRemoveLiquiditySuccess } =
		useWaitForTransactionReceipt({
			hash: removeLiquidityHash,
		});

	// Fetch markets on mount
	useEffect(() => {
		const fetchMarkets = async () => {
			try {
				const response = await getMarkets();
				if (response.success && response.data.length > 0) {
					setMarkets(response.data);
					setSelectedMarketId(response.data[0].onChainData.marketId); // Default to first market
				}
			} catch (e) {
				console.error("Failed to fetch markets", e);
				setApiError("Failed to fetch markets. Please try again later.");
			} finally {
				setIsMarketsLoading(false);
			}
		};
		fetchMarkets();
	}, []);

	useEffect(() => {
		const fetchPositions = async () => {
			if (!address) return;
			try {
				const response = await getLiquidityPositions(address);
				if (response.success) {
					setPositions(response.data);
				}
				console.log(".....................................", response.data);
			} catch (e) {
				console.error("Failed to fetch positions", e);
			}
		};
		fetchPositions();
	}, [address]);

	useEffect(() => {
		if (isApproveSuccess) {
			toast.success("Approval successful! You can now remove liquidity.");
			refetchAllowance();
		}
	}, [isApproveSuccess, refetchAllowance]);

	useEffect(() => {
		if (isRemoveLiquiditySuccess) {
			toast.success("Liquidity removed successfully!");
			refetchLpBalance(); // Refresh balance
			// Optional: Navigate back or clear form
		}
	}, [isRemoveLiquiditySuccess, refetchLpBalance]);

	const handleApprove = () => {
		if (!amount || !lpTokenAddress) return;
		const amountBigInt = parseUnits(amount, 18);
		writeApprove({
			address: lpTokenAddress as `0x${string}`,
			abi: ERC20Abi,
			functionName: "approve",
			args: [lpContract, amountBigInt],
		});
	};

	const handleRemoveLiquidity = async () => {
		if (!amount || !address || !selectedMarketId) return;
		setIsSubmitting(true);
		setApiError(null);

		try {
			console.log({ amount, address, selectedMarketId, chainId });
			const response = await removeLiquidity({
				lpTokenAmount: amount,
				userAddress: address,
				marketId: selectedMarketId,
			});
			console.table({ response });

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
			console.error({ err });
			setApiError(err instanceof Error ? err.message : "An unknown error occurred");
		} finally {
			setIsSubmitting(false);
		}
	};

	const isLoading =
		isRemoveLiquidityPending ||
		isRemoveLiquidityConfirming ||
		isSubmitting ||
		isApprovePending ||
		isApproveConfirming;

	// Calculate current balance (prioritize on-chain)
	const currentBalance =
		lpBalance !== undefined && lpBalance !== null
			? (lpBalance as bigint)
			: selectedPosition
				? BigInt(
						selectedPosition.lpTokenDetails?.balance || selectedPosition.lpTokensReceived || "0",
					)
				: BigInt(0);

	const amountBigInt = amount ? parseUnits(amount, 18) : BigInt(0);
	const isAmountValid = Number(amount) > 0 && amountBigInt <= currentBalance;
	const hasAllowance = allowance ? (allowance as bigint) >= amountBigInt : false;
	const isExceedingBalance = amountBigInt > currentBalance;

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
					onClick={() => navigate("/liquidity/add")}
				>
					Add Liquidity →
				</Button>
			</div>

			<Card className="border-accent/20">
				<CardHeader>
					<CardTitle>Remove Liquidity</CardTitle>
					<CardDescription>Withdraw your liquidity from the pool.</CardDescription>
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
							<span className="text-muted-foreground">Amount to Remove</span>
							<span className="text-muted-foreground">
								Balance:{" "}
								{lpBalance !== undefined && lpBalance !== null
									? parseFloat(formatUnits(lpBalance as bigint, 18)).toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 6,
										})
									: selectedPosition
										? parseFloat(
												formatUnits(
													BigInt(
														selectedPosition.lpTokenDetails?.balance ||
															selectedPosition.lpTokensReceived ||
															"0",
													),
													18,
												),
											).toLocaleString(undefined, {
												minimumFractionDigits: 2,
												maximumFractionDigits: 6,
											})
										: "0.00"}
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
								className="absolute right-0 top-0 h-full px-3 text-xs text-muted-foreground hover:text-foreground"
								onClick={() => {
									if (lpBalance) {
										setAmount(formatUnits(lpBalance as bigint, 18));
									}
								}}
							>
								MAX
							</Button>
						</div>
						<div className="pt-2">
							<Slider
								defaultValue={[0]}
								max={100}
								step={25}
								onValueChange={(val) => {
									if (lpBalance) {
										const percentage = val[0];
										const balance = BigInt(lpBalance as bigint);
										const newAmount = (balance * BigInt(percentage)) / BigInt(100);
										setAmount(formatUnits(newAmount, 18));
									}
								}}
							/>
							<div className="flex justify-between mt-1 text-xs text-muted-foreground">
								<span>0%</span>
								<span>25%</span>
								<span>50%</span>
								<span>75%</span>
								<span>100%</span>
							</div>
						</div>
					</div>

					<div className="space-y-4">
						{!hasAllowance && isAmountValid ? (
							<Button
								className="w-full"
								onClick={handleApprove}
								disabled={isLoading || !lpTokenAddress}
							>
								{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
								{isApprovePending || isApproveConfirming ? "Approving..." : "Approve LP Token"}
							</Button>
						) : (
							<Button
								className="w-full"
								onClick={handleRemoveLiquidity}
								disabled={isLoading || !isAmountValid || !selectedMarketId}
							>
								{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
								{isRemoveLiquidityPending || isRemoveLiquidityConfirming || isSubmitting
									? "Removing Liquidity..."
									: "Remove Liquidity"}
							</Button>
						)}

						{!isAmountValid && isExceedingBalance && (
							<p className="text-sm text-center text-red-500">Amount exceeds balance</p>
						)}

						{approveError && (
							<p className="text-sm text-center text-red-500">
								Approval failed: {approveError.message.slice(0, 50)}...
							</p>
						)}

						{removeLiquidityError && (
							<p className="text-sm text-center text-red-500">
								Transaction failed: {removeLiquidityError.message.slice(0, 50)}...
							</p>
						)}

						{apiError && <p className="text-sm text-center text-red-500">{apiError}</p>}

						{isRemoveLiquiditySuccess && !isLoading && (
							<p className="text-sm text-center text-green-500">Liquidity removed successfully!</p>
						)}

						{/* Debug info - Remove after fixing */}
						<div className="mt-4 p-2 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-mono overflow-auto max-h-40">
							<p className="font-bold">Debug Info:</p>
							<p>Selected Market: {selectedMarketId}</p>
							<p>Positions Loaded: {positions.length}</p>
							<p>Found Position: {selectedPosition ? "Yes" : "No"}</p>
							{selectedPosition && (
								<>
									<p>
										Pos ID: {selectedPosition.marketId} / {selectedPosition.onChainData?.marketId}
									</p>
									<p>LP Token: {lpTokenAddress || "None"}</p>
									<p>API Balance: {selectedPosition.lpTokenDetails?.balance || "N/A"}</p>
								</>
							)}
							<p>Live Balance: {lpBalance ? listBalance(lpBalance) : "None"}</p>
							<p>Available Position IDs:</p>
							<ul className="list-disc pl-4">
								{positions.map((p, i) => (
									<li key={i}>
										{p.marketId} (Chain: {p.onChainData?.marketId})
									</li>
								))}
							</ul>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

const listBalance = (bal: unknown) => {
	if (typeof bal === "bigint") return bal.toString();
	return String(bal);
};

export default function RemoveLiquidityPage() {
	return (
		<AuthGate
			icon={Wallet}
			title="Connect Wallet to Remove Liquidity"
			description="Connect your wallet to withdraw funds."
		>
			<RemoveLiquidityContent />
		</AuthGate>
	);
}
