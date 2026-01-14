import { Button } from "@app/components/ui/button";
import { Skeleton } from "@app/components/ui/skeleton";
import { formatLargeNumber } from "@app/lib/utils";
import {
	ArrowUpDown,
	DollarSign,
	TrendingUp,
	Wallet,
	Loader2,
	Zap,
	CircleDollarSign,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import {
	useConnection,
	useReadContract,
	useWriteContract,
	useWaitForTransactionReceipt,
	useSendTransaction,
} from "wagmi";
import { ERC20Abi, vaultContract, usdc, lmusdc } from "@app/lib/contracts";
import { formatUnits, parseUnits } from "viem";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getVaultUserStats, getVaultStats, getAnalyticsSummary } from "@app/lib/liquidity-api";

export const meta: MetaFunction = () => {
	return [
		{ title: "Liquidity Vault - Lemon Markets" },
		{
			name: "description",
			content: "Deposit into the unified LP vault and earn yield",
		},
	];
};

export const handle = {
	authTitle: "Connect Wallet to Access Vault",
	authDescription: "Connect your wallet to deposit into the liquidity vault and earn yield.",
	authIcon: Wallet,
};

type TabType = "deposit" | "withdraw";

// Duration options in days (minimum 2 days, maximum 6 months = 180 days)
const DURATION_OPTIONS = [
	{ label: "2 Days", value: 2, apy: 6.5 },
	{ label: "7 Days", value: 7, apy: 8.5 },
	{ label: "14 Days", value: 14, apy: 10.2 },
	{ label: "30 Days", value: 30, apy: 11.52 },
	{ label: "60 Days", value: 60, apy: 13.8 },
	{ label: "90 Days", value: 90, apy: 15.5 },
	{ label: "180 Days", value: 180, apy: 18.5 },
];

export default function LiquidityPage() {
	const { address } = useConnection();
	const queryClient = useQueryClient();

	// State
	const [activeTab, setActiveTab] = useState<TabType>("deposit");
	const [depositAmount, setDepositAmount] = useState("");
	const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[3]); // Default 30 days
	const [lockIndex, setLockIndex] = useState("");
	const [isProcessing, setIsProcessing] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);

	// Read USDC balance
	const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
		address: usdc,
		abi: ERC20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: !!address },
	});

	// Read USDC allowance for vault
	const { data: allowance, refetch: refetchAllowance } = useReadContract({
		address: usdc,
		abi: ERC20Abi,
		functionName: "allowance",
		args: address ? [address, vaultContract as `0x${string}`] : undefined,
		query: { enabled: !!address },
	});

	// Read LMUSDC balance (LP tokens)
	const { data: lmusdcBalance, refetch: refetchLpBalance } = useReadContract({
		address: lmusdc,
		abi: ERC20Abi,
		functionName: "balanceOf",
		args: address ? [address] : undefined,
		query: { enabled: !!address },
	});

	// Approval transaction
	const {
		writeContract: writeApprove,
		data: approveHash,
		isPending: isApprovePending,
		error: approveError,
	} = useWriteContract();

	const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } =
		useWaitForTransactionReceipt({
			hash: approveHash,
		});

	// Deposit transaction
	const {
		sendTransaction: sendDeposit,
		data: depositHash,
		isPending: isDepositPending,
		error: depositError,
	} = useSendTransaction();

	const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } =
		useWaitForTransactionReceipt({
			hash: depositHash,
		});

	// Analytics Data
	const { data: vaultUserStats, isLoading: isUserStatsLoading } = useQuery({
		queryKey: ["vaultUserStats", address],
		queryFn: () => getVaultUserStats(address as string),
		enabled: !!address,
	});

	const { data: vaultStats, isLoading: isVaultStatsLoading } = useQuery({
		queryKey: ["vaultStats"],
		queryFn: getVaultStats,
	});

	const { data: analyticsSummary, isLoading: isSummaryLoading } = useQuery({
		queryKey: ["analyticsSummary"],
		queryFn: getAnalyticsSummary,
	});

	// Derived vault data
	const vaultData = {
		totalDeposits: vaultStats?.data.totalInsuranceLiquidity
			? Number(formatUnits(BigInt(vaultStats.data.totalInsuranceLiquidity), 6))
			: 0,
		allTimeFees: analyticsSummary?.data.totalFees
			? Number(formatUnits(BigInt(analyticsSummary.data.totalFees), 6))
			: 0,
		projectedAPY: vaultStats?.data.estimatedAPR ? Number(vaultStats.data.estimatedAPR) : 0,
		userDeposit: vaultUserStats?.data.totalLpAdded
			? Number(formatUnits(BigInt(vaultUserStats.data.totalLpAdded), 6))
			: 0,
		currentEarnings: (() => {
			if (!vaultUserStats || !vaultStats) return 0;
			const lpBalance = BigInt(vaultUserStats.data.lpTokenBalance);
			const sharePrice = BigInt(vaultStats.data.currentSharePrice);
			const totalAdded = BigInt(vaultUserStats.data.totalLpAdded);
			const currentValue = (lpBalance * sharePrice) / BigInt(1e18);
			return Number(formatUnits(currentValue - totalAdded, 6));
		})(),
		totalShares: vaultUserStats?.data.lpTokenBalance
			? Number(formatUnits(BigInt(vaultUserStats.data.lpTokenBalance), 6))
			: 0,
	};

	// Refetch allowance after approval
	useEffect(() => {
		if (isApproveSuccess) {
			toast.success("Approval successful! You can now deposit.");
			refetchAllowance();
		}
	}, [isApproveSuccess, refetchAllowance]);

	// Handle deposit success
	useEffect(() => {
		if (isDepositSuccess) {
			toast.success("Deposit successful!");
			setDepositAmount("");
			refetchBalance();
			refetchLpBalance();
			setIsProcessing(false);
			// Invalidate queries to refetch data
			queryClient.invalidateQueries({ queryKey: ["vaultUserStats"] });
			queryClient.invalidateQueries({ queryKey: ["vaultStats"] });
			queryClient.invalidateQueries({ queryKey: ["analyticsSummary"] });
		}
	}, [isDepositSuccess, refetchBalance, refetchLpBalance, queryClient]);

	// Handle deposit error
	useEffect(() => {
		if (depositError) {
			const errorMsg = depositError.message || "Deposit transaction failed";
			setApiError(errorMsg);
			toast.error(errorMsg);
			setIsProcessing(false);
		}
	}, [depositError]);

	const handleApprove = () => {
		if (!depositAmount) return;
		const amountBigInt = parseUnits(depositAmount, 6); // USDC has 6 decimals
		setApiError(null);
		writeApprove({
			address: usdc,
			abi: ERC20Abi,
			functionName: "approve",
			args: [vaultContract, amountBigInt],
		});
	};

	const handleDeposit = async () => {
		if (!address || !depositAmount || Number(depositAmount) <= 0) return;

		setIsProcessing(true);
		setApiError(null);
		try {
			// Convert duration from days to seconds
			const durationInSeconds = selectedDuration.value * 24 * 60 * 60;

			const response = await fetch(import.meta.env.VITE_API_BASE_URL || "https://api.degenoptions.xyz"+ "/liquidity/vault/deposit-insurance", {
				method: "POST",
				headers: {
					Accept: "*/*",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					userAddress: address,
					amount: depositAmount,
					duration: durationInSeconds.toString(),
				}),
			});

			const data = await response.json();
			console.log("Deposit response:", data);

			if (!response.ok || !data.success) {
				const errorMsg = data.error || data.message || `HTTP error! status: ${response.status}`;
				setApiError(errorMsg);
				toast.error(errorMsg);
				setIsProcessing(false);
				return;
			}

			// Check simulation result
			if (data.simulationResult && !data.simulationResult.success) {
				const errorMsg = "Transaction simulation failed. Please check your inputs.";
				setApiError(errorMsg);
				toast.error(errorMsg);
				setIsProcessing(false);
				return;
			}

			// Execute the transaction with the data returned from API
			if (data.data?.to && data.data.data) {
				sendDeposit({
					to: data.data.to as `0x${string}`,
					data: data.data.data as `0x${string}`,
					value: BigInt(data.data.value || "0x0"),
				});
				// Note: Success/error handling is done in useEffect hooks
			} else {
				throw new Error("Invalid transaction data received from API");
			}
		} catch (error) {
			console.error("Deposit error:", error);
			const errorMsg = error instanceof Error ? error.message : "Failed to deposit";
			setApiError(errorMsg);
			toast.error(errorMsg);
			setIsProcessing(false);
		}
	};

	const handleWithdraw = async () => {
		if (!address || !lockIndex) return;

		setIsProcessing(true);
		setApiError(null);
		try {
			const response = await fetch(import.meta.env.VITE_API_BASE_URL || "https://api.degenoptions.xyz" + "/liquidity/vault/withdraw-insurance", {
				method: "POST",
				headers: {
					Accept: "*/*",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					userAddress: address,
					lockIndex: lockIndex,
				}),
			});

			const data = await response.json();
			console.log("Withdraw response:", data);

			if (!response.ok || !data.success) {
				const errorMsg = data.error || data.message || `HTTP error! status: ${response.status}`;
				setApiError(errorMsg);
				toast.error(errorMsg);
				return;
			}

			// Handle success
			toast.success("Withdrawal successful!");
			setLockIndex("");
			refetchBalance();
			refetchLpBalance();
			// Invalidate queries to refetch data
			queryClient.invalidateQueries({ queryKey: ["vaultUserStats"] });
			queryClient.invalidateQueries({ queryKey: ["vaultStats"] });
			queryClient.invalidateQueries({ queryKey: ["analyticsSummary"] });
		} catch (error) {
			console.error("Withdraw error:", error);
			const errorMsg = error instanceof Error ? error.message : "Failed to withdraw";
			setApiError(errorMsg);
			toast.error(errorMsg);
		} finally {
			setIsProcessing(false);
		}
	};

	const estimatedReceive =
		depositAmount && Number(depositAmount) > 0
			? (Number(depositAmount) * 0.99).toFixed(2) // Mock calculation
			: "0";

	const estimatedYield =
		depositAmount && Number(depositAmount) > 0
			? (
					(Number(depositAmount) * selectedDuration.apy) /
					100 /
					(365 / selectedDuration.value)
				).toFixed(2)
			: "0";

	return (
		<div className="mt-8 max-w-7xl mx-auto">
			{/* Header Banner */}
			<div className="bg-linear-to-r from-purple-900/40 via-purple-800/30 to-purple-900/40 border border-purple-700/30 rounded-2xl p-8 mb-8">
				<div className="flex items-start gap-6">
					<div className="w-20 h-20 rounded-full bg-linear-to-br from-[#a3e635]/20 to-[#a3e635]/5 flex items-center justify-center border-2 border-[#a3e635]/30 shadow-lg shadow-[#a3e635]/10">
						<Zap className="w-10 h-10 text-[#a3e635] fill-[#a3e635]/20" />
					</div>
					<div className="flex-1">
						<h1 className="text-3xl font-bold text-white mb-2">Lemon LP Vault</h1>
						<p className="text-purple-200 text-sm mb-3 max-w-2xl">
							All liquidity pools have been unified into one LP Vault. Your deposits continue to
							earn yield, with better APYs than before.
						</p>
						<a
							href="#"
							className="text-[#a3e635] text-sm font-medium hover:underline inline-flex items-center gap-1"
						>
							Learn more about vault unification →
						</a>
					</div>
				</div>
			</div>

			{/* Stats Grid */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
				<div className="bg-[#0f0f0f] border border-[#2c2c2c] rounded-xl p-6">
					<div className="flex items-center gap-3 mb-3">
						<div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
							<DollarSign className="w-5 h-5 text-yellow-500" />
						</div>
						<span className="text-[#9AA0A0] text-sm">Vault Deposits</span>
					</div>
					<div className="text-3xl font-bold text-white">
						{isVaultStatsLoading ? (
							<Skeleton className="h-9 w-32 bg-[#1a1a1a]" />
						) : (
							`$${formatLargeNumber(vaultData.totalDeposits)}`
						)}
					</div>
				</div>

				<div className="bg-[#0f0f0f] border border-[#2c2c2c] rounded-xl p-6">
					<div className="flex items-center gap-3 mb-3">
						<div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
							<ArrowUpDown className="w-5 h-5 text-green-500" />
						</div>
						<span className="text-[#9AA0A0] text-sm">All-time Fees</span>
					</div>
					<div className="text-3xl font-bold text-white">
						{isSummaryLoading ? (
							<Skeleton className="h-9 w-24 bg-[#1a1a1a]" />
						) : (
							`$${formatLargeNumber(vaultData.allTimeFees)}`
						)}
					</div>
				</div>

				<div className="bg-[#0f0f0f] border border-[#2c2c2c] rounded-xl p-6">
					<div className="flex items-center gap-3 mb-3">
						<div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
							<TrendingUp className="w-5 h-5 text-purple-500" />
						</div>
						<span className="text-[#9AA0A0] text-sm">Projected APY</span>
					</div>
					<div className="text-3xl font-bold text-[#a3e635]">
						{isVaultStatsLoading ? (
							<Skeleton className="h-9 w-16 bg-[#1a1a1a]" />
						) : (
							`${vaultData.projectedAPY}%`
						)}
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				{/* Main Deposit/Withdraw Panel */}
				<div className="lg:col-span-2">
					<div className="bg-[#0f0f0f] border border-[#2c2c2c] rounded-xl overflow-hidden">
						{/* Tabs */}
						<div className="flex border-b border-[#2c2c2c]">
							<button
								type="button"
								onClick={() => setActiveTab("deposit")}
								className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
									activeTab === "deposit"
										? "bg-[#1a1a1a] text-white border-b-2 border-[#a3e635]"
										: "text-[#9AA0A0] hover:text-white hover:bg-[#151515]"
								}`}
							>
								Deposit
							</button>
							<button
								type="button"
								onClick={() => setActiveTab("withdraw")}
								className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
									activeTab === "withdraw"
										? "bg-[#1a1a1a] text-white border-b-2 border-[#a3e635]"
										: "text-[#9AA0A0] hover:text-white hover:bg-[#151515]"
								}`}
							>
								Withdraw
							</button>
						</div>

						{/* Content */}
						<div className="p-6">
							{activeTab === "deposit" ? (
								<div className="space-y-6">
									{/* Deposit Amount */}
									<div>
										<label htmlFor="deposit-amount" className="block text-sm text-[#9AA0A0] mb-2">
											Deposit Amount
										</label>
										<div className="relative">
											<input
												id="deposit-amount"
												type="number"
												value={depositAmount}
												onChange={(e) => setDepositAmount(e.target.value)}
												placeholder="0"
												className="w-full bg-[#1a1a1a] border border-[#2c2c2c] rounded-lg px-4 py-3 text-white text-lg pr-20 focus:outline-none focus:border-[#a3e635] transition-colors"
											/>
											<div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
												<span className="text-white font-medium">USDC</span>
												<div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
													<CircleDollarSign className="w-3.5 h-3.5 text-blue-400" />
												</div>
											</div>
										</div>
										<button
											type="button"
											className="mt-2 text-xs text-[#a3e635] hover:underline flex items-center gap-1"
											onClick={() => {
												if (usdcBalance) {
													setDepositAmount(formatUnits(usdcBalance as bigint, 6));
												}
											}}
										>
											<Wallet className="w-3 h-3" />
											Balance:{" "}
											{usdcBalance
												? Number(formatUnits(usdcBalance as bigint, 6)).toFixed(2)
												: "0.00"}{" "}
											USDC
											<span className="ml-2 text-[#9AA0A0]">Max</span>
										</button>
									</div>

									{/* Duration Selection */}
									<div>
										<label className="block text-sm text-[#9AA0A0] mb-3">Lock Duration</label>
										<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
											{DURATION_OPTIONS.map((option) => (
												<button
													key={option.value}
													type="button"
													onClick={() => setSelectedDuration(option)}
													className={`p-4 rounded-lg border-2 transition-all ${
														selectedDuration.value === option.value
															? "border-[#a3e635] bg-[#a3e635]/10"
															: "border-[#2c2c2c] bg-[#1a1a1a] hover:border-[#3c3c3c]"
													}`}
												>
													<div className="text-white font-semibold mb-1">{option.label}</div>
													<div className="text-xs text-[#a3e635]">{option.apy}% APY</div>
												</button>
											))}
										</div>
									</div>

									{/* Estimates */}
									<div className="bg-[#1a1a1a] border border-[#2c2c2c] rounded-lg p-4 space-y-3">
										<div className="flex justify-between items-center">
											<span className="text-sm text-[#9AA0A0]">Receive</span>
											<span className="text-white font-semibold">{estimatedReceive} lmUSDC</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-sm text-[#9AA0A0]">Est. Deposit Fee:</span>
											<span className="text-white">0 USDC</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-sm text-[#9AA0A0]">Est. APY:</span>
											<span className="text-[#a3e635] font-semibold">{selectedDuration.apy}%</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-sm text-[#9AA0A0]">Est. Annual Yield:</span>
											<span className="text-[#a3e635] font-semibold">{estimatedYield} USDC</span>
										</div>
									</div>

									{/* Approve/Deposit Buttons */}
									<div className="space-y-3">
										{(() => {
											const amountBigInt = depositAmount ? parseUnits(depositAmount, 6) : BigInt(0);
											const hasAllowance = allowance
												? (allowance as bigint) >= amountBigInt
												: false;
											const hasBalance = usdcBalance
												? (usdcBalance as bigint) >= amountBigInt
												: false;
											const isAmountValid = amountBigInt > BigInt(0);
											const isLoading =
												isProcessing ||
												isApprovePending ||
												isApproveConfirming ||
												isDepositPending ||
												isDepositConfirming;

											if (!hasAllowance && isAmountValid) {
												return (
													<Button
														onClick={handleApprove}
														disabled={isLoading || !hasBalance}
														className="w-full bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold py-6 text-lg rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
													>
														{isLoading ? (
															<>
																<Loader2 className="mr-2 h-5 w-5 animate-spin inline" />
																Approving...
															</>
														) : (
															"Approve USDC"
														)}
													</Button>
												);
											}

											return (
												<Button
													onClick={handleDeposit}
													disabled={!isAmountValid || !hasBalance || isLoading}
													className="w-full bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold py-6 text-lg rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
												>
													{isLoading ? (
														<>
															<Loader2 className="mr-2 h-5 w-5 animate-spin inline" />
															Processing...
														</>
													) : (
														"Deposit"
													)}
												</Button>
											);
										})()}

										{/* Error Messages */}
										{approveError && (
											<p className="text-sm text-center text-red-500">
												Approval failed: {approveError.message.slice(0, 100)}
											</p>
										)}
										{depositError && (
											<p className="text-sm text-center text-red-500">
												Deposit failed: {depositError.message.slice(0, 100)}
											</p>
										)}
										{apiError && <p className="text-sm text-center text-red-500">{apiError}</p>}
									</div>
								</div>
							) : (
								<div className="space-y-6">
									{/* Active Positions */}
									<div className="space-y-4">
										<h3 className="text-white font-semibold">Your Active Positions</h3>
										{!vaultUserStats || vaultUserStats.data.positions.length === 0 ? (
											<div className="bg-[#1a1a1a] border border-[#2c2c2c] rounded-lg p-8 text-center">
												<p className="text-[#9AA0A0] text-sm">No active positions found.</p>
											</div>
										) : (
											<div className="space-y-3">
												{vaultUserStats.data.positions.map((pos, index) => {
													const isUnlocked = Date.now() / 1000 >= Number(pos.unlockTime);
													const unlockDate = new Date(Number(pos.unlockTime) * 1000);

													const contractIndex = vaultUserStats.data.positions.length - 1 - index;

													return (
														<div
															key={pos.id}
															className={`bg-[#1a1a1a] border ${
																lockIndex === contractIndex.toString()
																	? "border-[#a3e635]"
																	: "border-[#2c2c2c]"
															} rounded-lg p-4 transition-colors hover:border-[#3c3c3c] cursor-pointer`}
															onClick={() => setLockIndex(contractIndex.toString())}
														>
															<div className="flex justify-between items-start mb-2">
																<div>
																	<span className="text-white font-medium">
																		{Number(formatUnits(BigInt(pos.amount), 6)).toFixed(2)} USDC
																	</span>
																	<p className="text-xs text-[#9AA0A0]">
																		Locked at:{" "}
																		{new Date(
																			Number(pos.blockTimestamp) * 1000,
																		).toLocaleDateString()}
																	</p>
																</div>
																<div className="text-right">
																	{isUnlocked ? (
																		<span className="text-xs font-semibold text-[#a3e635] bg-[#a3e635]/10 px-2 py-1 rounded">
																			Unlocked
																		</span>
																	) : (
																		<span className="text-xs font-semibold text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
																			Locked
																		</span>
																	)}
																	<p className="text-xs text-[#9AA0A0] mt-1">
																		Unlock: {unlockDate.toLocaleDateString()}
																	</p>
																</div>
															</div>
															{lockIndex === contractIndex.toString() && (
																<div className="mt-4 pt-4 border-t border-[#2c2c2c]">
																	<Button
																		onClick={(e) => {
																			e.stopPropagation();
																			handleWithdraw();
																		}}
																		disabled={!isUnlocked || isProcessing}
																		className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg transition-colors"
																	>
																		{isProcessing
																			? "Processing..."
																			: isUnlocked
																				? "Withdraw Position"
																				: `Unlocks on ${unlockDate.toLocaleDateString()}`}
																	</Button>
																</div>
															)}
														</div>
													);
												})}
											</div>
										)}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Vault Portfolio Stats */}
				<div className="lg:col-span-1">
					<div className="bg-[#0f0f0f] border border-[#2c2c2c] rounded-xl p-6 sticky top-4">
						<h2 className="text-lg font-bold text-white mb-6">Vault Portfolio Stats</h2>

						<div className="space-y-4">
							<div className="flex justify-between items-center py-3 border-b border-[#2c2c2c]">
								<span className="text-sm text-[#9AA0A0]">My Deposit</span>
								<span className="text-white font-semibold">
									{isUserStatsLoading ? (
										<Skeleton className="h-5 w-16 bg-[#1a1a1a]" />
									) : (
										`${vaultData.userDeposit.toFixed(2)} USDC`
									)}
								</span>
							</div>

							<div className="flex justify-between items-center py-3 border-b border-[#2c2c2c]">
								<span className="text-sm text-[#9AA0A0]">Total Shares</span>
								<span className="text-white font-semibold">
									{isUserStatsLoading || !lmusdcBalance ? (
										<Skeleton className="h-5 w-20 bg-[#1a1a1a]" />
									) : (
										`${Number(formatUnits(lmusdcBalance as bigint, 6)).toFixed(2)} lmUSDC`
									)}
								</span>
							</div>

							<div className="flex justify-between items-center py-3">
								<span className="text-sm text-[#9AA0A0]">P/L</span>
								<span
									className={`font-semibold ${
										vaultData.currentEarnings >= 0 ? "text-[#a3e635]" : "text-red-500"
									}`}
								>
									{isUserStatsLoading || isVaultStatsLoading ? (
										<Skeleton className="h-5 w-16 bg-[#1a1a1a]" />
									) : (
										`${vaultData.currentEarnings >= 0 ? "+" : ""}${vaultData.currentEarnings.toFixed(2)} USDC`
									)}
								</span>
							</div>
						</div>

						{/* Empty State */}
						{vaultData.userDeposit === 0 && (
							<div className="mt-8 text-center py-8">
								<div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
									<Wallet className="w-8 h-8 text-[#9AA0A0]" />
								</div>
								<p className="text-sm text-[#9AA0A0] mb-2">No deposits yet</p>
								<p className="text-xs text-[#6c6c6c]">
									Deposit into the vault to start earning yield
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
