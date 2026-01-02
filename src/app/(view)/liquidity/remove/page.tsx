"use client";

import toast from "react-hot-toast";

import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	useAccount,
	useSendTransaction,
	useWaitForTransactionReceipt,
} from "wagmi";

import { AuthGate } from "@/components/ui/AuthGate";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getMarkets, removeLiquidity, type Market } from "@/lib/liquidity-api";

function RemoveLiquidityContent() {
	const navigate = useNavigate();
	const { address, chainId } = useAccount();
	const [amount, setAmount] = useState("");
	const [selectedMarketId, setSelectedMarketId] = useState<string>("");
	const [markets, setMarkets] = useState<Market[]>([]);
	const [isMarketsLoading, setIsMarketsLoading] = useState(true);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);

	// Write hooks
	const {
		sendTransaction,
		data: removeLiquidityHash,
		isPending: isRemoveLiquidityPending,
		error: removeLiquidityError,
	} = useSendTransaction();

	// Transaction wait hooks
	const {
		isLoading: isRemoveLiquidityConfirming,
		isSuccess: isRemoveLiquiditySuccess,
	} = useWaitForTransactionReceipt({
		hash: removeLiquidityHash,
	});

	// Fetch markets on mount
	useEffect(() => {
		const fetchMarkets = async () => {
			try {
				const response = await getMarkets();
				if (response.success && response.data.length > 0) {
					setMarkets(response.data);
					setSelectedMarketId(
						response.data[0].onChainData.marketId.split("-")[0]
					); // Default to first market
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
		if (isRemoveLiquiditySuccess) {
			toast.success("Liquidity removed successfully!");
			// Optional: Navigate back or clear form
		}
	}, [isRemoveLiquiditySuccess]);

	const handleRemoveLiquidity = async () => {
		if (!amount || !address || !selectedMarketId) return;
		setIsSubmitting(true);
		setApiError(null);

		try {
			const response = await removeLiquidity({
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
			setApiError(
				err instanceof Error ? err.message : "An unknown error occurred"
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const isLoading =
		isRemoveLiquidityPending || isRemoveLiquidityConfirming || isSubmitting;

	const isAmountValid = Number(amount) > 0;

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
					<CardDescription>
						Withdraw your liquidity from the pool.
					</CardDescription>
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
										<SelectItem
											key={m.onChainData.marketId}
											value={m.onChainData.marketId}
										>
											{
												m.onChainData.marketId.split(
													"-"
												)[0]
											}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>

					<div className="space-y-2">
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">
								Amount to Remove
							</span>
							{/* Balance is unknown for now without API support */}
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
						</div>
					</div>

					<div className="space-y-4">
						<Button
							className="w-full"
							onClick={handleRemoveLiquidity}
							disabled={
								isLoading || !isAmountValid || !selectedMarketId
							}
						>
							{isLoading ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							{isRemoveLiquidityPending ||
							isRemoveLiquidityConfirming ||
							isSubmitting
								? "Removing Liquidity..."
								: "Remove Liquidity"}
						</Button>

						{removeLiquidityError && (
							<p className="text-sm text-center text-red-500">
								Transaction failed:{" "}
								{removeLiquidityError.message.slice(0, 50)}...
							</p>
						)}

						{apiError && (
							<p className="text-sm text-center text-red-500">
								{apiError}
							</p>
						)}

						{isRemoveLiquiditySuccess && !isLoading && (
							<p className="text-sm text-center text-green-500">
								Liquidity removed successfully!
							</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

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
