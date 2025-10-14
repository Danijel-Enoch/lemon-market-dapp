"use client";

import { useState } from "react";
import {
	useAccount,
	useSendTransaction,
	useWaitForTransactionReceipt
} from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toast } from "@/components/ui/toast";
import {
	calculatePnlPercentage,
	closePosition,
	extractTokenSymbol,
	formatPositionSize,
	isPositionProfitable,
	modifyPosition,
	type Position,
	validateLeverage,
	validateMargin
} from "@/lib/position-api";

interface PositionsTableProps {
	positions: Position[];
	isLoading: boolean;
	error: string | null;
	onRefetch: () => void;
	tradingPairAddress?: string;
}

export function PositionsTable({
	positions,
	isLoading: _isLoading,
	error: _error,
	onRefetch,
	tradingPairAddress
}: PositionsTableProps) {
	const { address } = useAccount();
	const { sendTransaction, data: hash, isPending } = useSendTransaction();
	const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

	// State for position management
	const [selectedPosition, setSelectedPosition] = useState<Position | null>(
		null
	);
	const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
	const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);

	// Modify position form state
	const [newMargin, setNewMargin] = useState("");
	const [newLeverage, setNewLeverage] = useState(2);

	// Open positions (status === "open")
	const openPositions = positions.filter(
		(pos) => pos.status.toLowerCase() === "open"
	);
	// Closed positions (status !== "open")
	const closedPositions = positions.filter(
		(pos) => pos.status.toLowerCase() !== "open"
	);

	// Handle close position
	const handleClosePosition = async (position: Position) => {
		if (!address) {
			setApiError("Please connect your wallet first");
			return;
		}

		setApiError(null);

		try {
			// Show initial loading toast
			const loadingToastId = Toast.transaction.pending(
				`Closing ${position.pair} position...`,
				{
					description: "Please confirm the transaction in your wallet"
				}
			);

			const tokenSymbol = extractTokenSymbol(position.pair);

			const result = await closePosition({
				positionId: position.positionId,
				tokenSymbol,
				userAddress: address,
				tokenAddress: position.tokenaddress,
				pairAddress: tradingPairAddress
			});

			if (!result.success) {
				Toast.dismiss(loadingToastId);
				throw new Error(result.error || "Failed to close position");
			}

			if (!result.data) {
				Toast.dismiss(loadingToastId);
				throw new Error("No transaction data returned from API");
			}

			// Send the transaction
			sendTransaction({
				to: result.data.to as `0x${string}`,
				data: result.data.data as `0x${string}`,
				value: BigInt(0),
				gas: result.data.gasEstimate
					? BigInt(result.data.gasEstimate)
					: undefined
			});

			// Dismiss loading toast and show success
			Toast.dismiss(loadingToastId);
			Toast.transaction.success(
				`Successfully submitted close transaction for ${position.pair}!`,
				{
					description:
						"Transaction is being processed on the blockchain"
				}
			);

			// Close the dialog
			setIsCloseDialogOpen(false);
			setSelectedPosition(null);
		} catch (error) {
			console.error("Error closing position:", error);
			const errorMessage =
				error instanceof Error
					? error.message
					: "Failed to close position";
			setApiError(errorMessage);
			Toast.transaction.failed("Failed to close position", {
				description: errorMessage
			});
		}
	};

	// Handle modify position
	const handleModifyPosition = async () => {
		if (!address || !selectedPosition) {
			setApiError("Please connect your wallet first");
			return;
		}

		// Validate inputs
		const marginValidation = validateMargin(newMargin);
		if (!marginValidation.valid) {
			setApiError(marginValidation.error!);
			return;
		}

		const leverageValidation = validateLeverage(newLeverage);
		if (!leverageValidation.valid) {
			setApiError(leverageValidation.error!);
			return;
		}

		setApiError(null);

		try {
			// Show initial loading toast
			const loadingToastId = Toast.transaction.pending(
				`Modifying ${selectedPosition.pair} position...`,
				{
					description: "Please confirm the transaction in your wallet"
				}
			);

			const tokenSymbol = extractTokenSymbol(selectedPosition.pair);

			const result = await modifyPosition({
				positionId: selectedPosition.positionId,
				tokenSymbol,
				newMargin,
				newLeverage,
				userAddress: address,
				pairAddress: tradingPairAddress
			});

			if (!result.success) {
				Toast.dismiss(loadingToastId);
				throw new Error(result.error || "Failed to modify position");
			}

			if (!result.data) {
				Toast.dismiss(loadingToastId);
				throw new Error("No transaction data returned from API");
			}

			// Send the transaction
			sendTransaction({
				to: result.data.to as `0x${string}`,
				data: result.data.data as `0x${string}`,
				value: BigInt(0),
				gas: result.data.gasEstimate
					? BigInt(result.data.gasEstimate)
					: undefined
			});

			// Dismiss loading toast and show success
			Toast.dismiss(loadingToastId);
			Toast.transaction.success(
				`Successfully submitted modification for ${selectedPosition.pair}!`,
				{
					description:
						"Transaction is being processed on the blockchain"
				}
			);

			// Close the dialog and reset form
			setIsModifyDialogOpen(false);
			setSelectedPosition(null);
			setNewMargin("");
			setNewLeverage(2);
		} catch (error) {
			console.error("Error modifying position:", error);
			const errorMessage =
				error instanceof Error
					? error.message
					: "Failed to modify position";
			setApiError(errorMessage);
			Toast.transaction.failed("Failed to modify position", {
				description: errorMessage
			});
		}
	};

	// Handle dialog opens
	const openCloseDialog = (position: Position) => {
		setSelectedPosition(position);
		setApiError(null);
		setIsCloseDialogOpen(true);
	};

	const openModifyDialog = (position: Position) => {
		setSelectedPosition(position);
		setNewMargin(position.margin.replace(/[$,]/g, ""));
		setNewLeverage(position.leverageValue);
		setApiError(null);
		setIsModifyDialogOpen(true);
	};

	// Handle transaction confirmation
	if (isConfirmed && hash) {
		// Show confirmation toast
		Toast.transaction.confirmed("Transaction confirmed!", {
			hash,
			description: "Your transaction has been confirmed on the blockchain"
		});

		// Refresh positions after confirmation
		setTimeout(() => {
			onRefetch();
		}, 2000);
	}

	return (
		<div className="bg-card border border-gray-100/10 rounded-lg">
			<Tabs defaultValue="open" className="w-full">
				<TabsList className="bg-transparent border-b border-gray-100/10 p-0 h-auto w-full justify-start">
					<TabsTrigger
						value="open"
						className="bg-transparent text-white text-sm font-medium  data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 rounded-none px-6 py-3"
					>
						Open Positions ({openPositions.length})
					</TabsTrigger>
					<TabsTrigger
						value="history"
						className="bg-transparent text-white text-sm font-medium  data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 rounded-none px-6 py-3"
					>
						Position History ({closedPositions.length})
					</TabsTrigger>
				</TabsList>

				<TabsContent value="open" className="mt-0">
					{openPositions.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12">
							<div className="text-gray-400 mb-2">
								No open positions
							</div>
							<p className="text-gray-500 text-sm">
								Your open positions will appear here
							</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-slate-800">
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Position
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Size
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Entry Price
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Margin
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Leverage
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											PnL
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Liq. Price
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Actions
										</th>
									</tr>
								</thead>
								<tbody>
									{openPositions.map((position) => (
										<tr
											key={position.id}
											className="border-b border-slate-800/50 hover:bg-slate-800/20"
										>
											<td className="p-4">
												<div className="flex items-center gap-2">
													<span className="text-white font-medium">
														{position.pair}
													</span>
													<Badge
														variant={
															position.isLong
																? "default"
																: "destructive"
														}
														className={
															position.isLong
																? "bg-green-500/20 text-green-400 border-green-500/50"
																: "bg-red-500/20 text-red-400 border-red-500/50"
														}
													>
														{position.side}
													</Badge>
												</div>
											</td>
											<td className="p-4 text-white">
												{formatPositionSize(
													position.margin,
													position.leverage,
													position.entryPrice,
													position.tokenSymbol
												)}
											</td>
											<td className="p-4 text-white">
												{position.entryPrice}
											</td>
											<td className="p-4 text-white">
												{position.margin}
											</td>
											<td className="p-4 text-white">
												{position.leverage}
											</td>
											<td className="p-4">
												<div className="flex flex-col">
													<span
														className={`font-medium ${
															isPositionProfitable(
																position.pnlRaw
															)
																? "text-green-400"
																: "text-red-400"
														}`}
													>
														{position.pnl}
													</span>
													<span
														className={`text-sm ${
															isPositionProfitable(
																position.pnlRaw
															)
																? "text-green-400"
																: "text-red-400"
														}`}
													>
														{calculatePnlPercentage(
															position.pnlRaw,
															position.margin
														)}
													</span>
												</div>
											</td>
											<td className="p-4 text-white">
												{position.liquidationPrice}
											</td>
											<td className="p-4">
												<div className="flex items-center gap-2">
													{/* <Button
														size="sm"
														variant="outline"
														onClick={() =>
															openModifyDialog(
																position
															)
														}
														className="border-blue-600 text-blue-400 hover:bg-blue-600 hover:text-white"
													>
														Modify
													</Button> */}
													<Button
														size="sm"
														variant="outline"
														onClick={() =>
															openCloseDialog(
																position
															)
														}
														className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
													>
														Close
													</Button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</TabsContent>

				<TabsContent value="history" className="mt-0">
					{closedPositions.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12">
							<div className="text-gray-400 mb-2">
								No position history
							</div>
							<p className="text-gray-500 text-sm">
								Your closed positions will appear here
							</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-slate-800">
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Position
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Size
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Entry Price
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Exit Price
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											PnL
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Status
										</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">
											Closed At
										</th>
									</tr>
								</thead>
								<tbody>
									{closedPositions.map((position) => (
										<tr
											key={position.id}
											className="border-b border-slate-800/50"
										>
											<td className="p-4">
												<div className="flex items-center gap-2">
													<span className="text-white font-medium">
														{position.pair}
													</span>
													<Badge
														variant={
															position.isLong
																? "default"
																: "destructive"
														}
														className={
															position.isLong
																? "bg-green-500/20 text-green-400 border-green-500/50"
																: "bg-red-500/20 text-red-400 border-red-500/50"
														}
													>
														{position.side}
													</Badge>
												</div>
											</td>
											<td className="p-4 text-white">
												{formatPositionSize(
													position.margin,
													position.leverage,
													position.entryPrice,
													position.tokenSymbol
												)}
											</td>
											<td className="p-4 text-white">
												{position.entryPrice}
											</td>
											<td className="p-4 text-white">
												{position.exitPrice || "N/A"}
											</td>
											<td className="p-4">
												<div className="flex flex-col">
													<span
														className={`font-medium ${
															isPositionProfitable(
																position.pnlRaw
															)
																? "text-green-400"
																: "text-red-400"
														}`}
													>
														{position.pnl}
													</span>
													<span
														className={`text-sm ${
															isPositionProfitable(
																position.pnlRaw
															)
																? "text-green-400"
																: "text-red-400"
														}`}
													>
														{calculatePnlPercentage(
															position.pnlRaw,
															position.margin
														)}
													</span>
												</div>
											</td>
											<td className="p-4">
												<Badge
													variant="secondary"
													className="bg-gray-500/20 text-gray-400"
												>
													{position.status}
												</Badge>
											</td>
											<td className="p-4 text-gray-400 text-sm">
												{new Date(
													position.lastUpdatedAt
												).toLocaleDateString()}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</TabsContent>
			</Tabs>

			{/* Close Position Dialog */}
			<Dialog
				open={isCloseDialogOpen}
				onOpenChange={setIsCloseDialogOpen}
			>
				<DialogContent className="bg-slate-900 border-slate-800 text-white">
					<DialogHeader>
						<DialogTitle>Close Position</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						{selectedPosition && (
							<div className="bg-slate-800 p-4 rounded">
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-gray-400">
											Position:
										</span>
										<div className="font-medium">
											{selectedPosition.pair}{" "}
											{selectedPosition.side}
										</div>
									</div>
									<div>
										<span className="text-gray-400">
											Current PnL:
										</span>
										<div
											className={`font-medium ${
												isPositionProfitable(
													selectedPosition.pnlRaw
												)
													? "text-green-400"
													: "text-red-400"
											}`}
										>
											{selectedPosition.pnl}
										</div>
									</div>
								</div>
							</div>
						)}

						{apiError && (
							<div className="bg-red-500/20 border border-red-500/50 text-red-400 p-3 rounded text-sm">
								{apiError}
							</div>
						)}

						<div className="flex gap-3 justify-end">
							<Button
								variant="outline"
								onClick={() => setIsCloseDialogOpen(false)}
								disabled={isPending}
							>
								Cancel
							</Button>
							<Button
								onClick={() =>
									selectedPosition &&
									handleClosePosition(selectedPosition)
								}
								disabled={isPending}
								className="bg-red-600 hover:bg-red-700"
							>
								{isPending ? "Processing..." : "Close Position"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Modify Position Dialog */}
			<Dialog
				open={isModifyDialogOpen}
				onOpenChange={setIsModifyDialogOpen}
			>
				<DialogContent className="bg-slate-900 border-slate-800 text-white">
					<DialogHeader>
						<DialogTitle>Modify Position</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						{selectedPosition && (
							<div className="bg-slate-800 p-4 rounded">
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-gray-400">
											Position:
										</span>
										<div className="font-medium">
											{selectedPosition.pair}{" "}
											{selectedPosition.side}
										</div>
									</div>
									<div>
										<span className="text-gray-400">
											Current Margin:
										</span>
										<div className="font-medium">
											{selectedPosition.margin}
										</div>
									</div>
									<div>
										<span className="text-gray-400">
											Current Leverage:
										</span>
										<div className="font-medium">
											{selectedPosition.leverage}
										</div>
									</div>
								</div>
							</div>
						)}

						<div className="space-y-3">
							<div>
								<label className="text-sm text-gray-400 mb-1 block">
									New Margin (USDC)
								</label>
								<Input
									type="number"
									value={newMargin}
									onChange={(
										e: React.ChangeEvent<HTMLInputElement>
									) => setNewMargin(e.target.value)}
									placeholder="Enter new margin amount"
									className="bg-slate-800 border-slate-700 text-white"
								/>
							</div>

							<div>
								<label className="text-sm text-gray-400 mb-1 block">
									New Leverage (1x - 100x)
								</label>
								<div className="flex items-center gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											setNewLeverage(
												Math.max(1, newLeverage - 1)
											)
										}
										disabled={newLeverage <= 1}
									>
										-
									</Button>
									<Input
										type="number"
										value={newLeverage}
										onChange={(
											e: React.ChangeEvent<HTMLInputElement>
										) =>
											setNewLeverage(
												Math.max(
													1,
													Math.min(
														100,
														parseInt(
															e.target.value
														) || 1
													)
												)
											)
										}
										className="bg-slate-800 border-slate-700 text-white text-center"
										min={1}
										max={100}
									/>
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											setNewLeverage(
												Math.min(100, newLeverage + 1)
											)
										}
										disabled={newLeverage >= 100}
									>
										+
									</Button>
								</div>
							</div>
						</div>

						{apiError && (
							<div className="bg-red-500/20 border border-red-500/50 text-red-400 p-3 rounded text-sm">
								{apiError}
							</div>
						)}

						<div className="flex gap-3 justify-end">
							<Button
								variant="outline"
								onClick={() => setIsModifyDialogOpen(false)}
								disabled={isPending}
							>
								Cancel
							</Button>
							<Button
								onClick={handleModifyPosition}
								disabled={isPending}
								className="bg-blue-600 hover:bg-blue-700"
							>
								{isPending
									? "Processing..."
									: "Modify Position"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
