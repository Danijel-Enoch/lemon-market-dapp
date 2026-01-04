import { Badge } from "@app/components/ui/badge";
import { Button } from "@app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@app/components/ui/dialog";
import { Input } from "@app/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/ui/tabs";
import { useClosePosition } from "@app/hooks/useClosePosition";
import {
	extractTokenSymbol,
	formatPositionSize,
	isPositionProfitable,
	modifyPosition,
	type Position,
	validateLeverage,
	validateMargin,
} from "@app/lib/position-api";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { useAsyncCallback } from "@app/hooks/useAsyncCallback";
import { useConnection, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";

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
	tradingPairAddress,
}: PositionsTableProps) {
	const { address } = useConnection();
	const { sendTransaction, data: hash, isPending } = useSendTransaction();
	const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
	const navigate = useNavigate();

	// State for position management
	const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
	const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
	const [isModifyDialogOpen, setIsModifyDialogOpen] = useState(false);
	const [closeLoadingToastId, setCloseLoadingToastId] = useState<string | null>(null);

	// Modify position form state
	const [newMargin, setNewMargin] = useState("");
	const [newLeverage, setNewLeverage] = useState(2);

	// Open positions (status === "OPEN" or "OPENED")
	const openPositions = positions.filter(
		(pos) => pos.status.toLowerCase() === "opened" || pos.status.toLowerCase() === "open",
	);
	// Closed positions (status !== "OPEN" and "OPENED")
	const closedPositions = positions.filter(
		(pos) => pos.status.toLowerCase() !== "opened" && pos.status.toLowerCase() !== "open",
	);

	// Handle close position with TanStack Query mutation
	const {
		closePosition,
		isClosing: isClosingPosition,
		error: closeError,
	} = useClosePosition({
		onSuccess: () => {
			if (closeLoadingToastId) {
				toast.dismiss(closeLoadingToastId);
				setCloseLoadingToastId(null);
			}
			toast.success(
				<div>
					{`Successfully submitted close transaction for ${selectedPosition?.pair}!`}
					<div className="text-xs text-muted-foreground">
						Transaction is being processed on the blockchain
					</div>
				</div>,
			);
			setIsCloseDialogOpen(false);
			setSelectedPosition(null);
		},
		onError: (error: Error) => {
			if (closeLoadingToastId) {
				toast.dismiss(closeLoadingToastId);
				setCloseLoadingToastId(null);
			}
			const errorMessage = error.message || "Failed to close position";
			toast.error(
				<div>
					Failed to close position
					<div className="text-xs text-muted-foreground">{errorMessage}</div>
				</div>,
			);
		},
	});

	const handleClosePosition = (position: Position) => {
		const toastId = toast.loading(`Closing ${position.pair} position...`);
		setCloseLoadingToastId(toastId);
		closePosition({
			positionId: parseInt(position.id, 10),
			marketId: position.tokenSymbol,
		});
	};

	// Handle modify position
	const [{ loading: isModifyingPosition, error: modifyError }, handleModifyPosition] =
		useAsyncCallback(async () => {
			if (!address || !selectedPosition) {
				throw new Error("Please connect your wallet first");
			}

			// Validate inputs
			const marginValidation = validateMargin(newMargin);
			if (!marginValidation.valid) {
				throw new Error(marginValidation.error || "Invalid margin");
			}

			const leverageValidation = validateLeverage(newLeverage);
			if (!leverageValidation.valid) {
				throw new Error(leverageValidation.error || "Invalid leverage");
			}

			// Show initial loading toast
			const loadingToastId = toast.loading(`Modifying ${selectedPosition.pair} position...`);

			try {
				const tokenSymbol = extractTokenSymbol(selectedPosition.pair);

				const result = await modifyPosition({
					positionId: selectedPosition.positionId,
					tokenSymbol,
					newMargin,
					newLeverage,
					userAddress: address,
					pairAddress: tradingPairAddress,
				});

				if (!result.success) {
					toast.dismiss(loadingToastId);
					throw new Error(result.error || "Failed to modify position");
				}

				if (!result.data) {
					toast.dismiss(loadingToastId);
					throw new Error("No transaction data returned from API");
				}

				// Send the transaction
				sendTransaction({
					to: result.data.to as `0x${string}`,
					data: result.data.data as `0x${string}`,
					value: BigInt(0),
					gas: result.data.gasEstimate ? BigInt(result.data.gasEstimate) : undefined,
				});

				// Dismiss loading toast and show success
				toast.dismiss(loadingToastId);
				toast.success(
					<div>
						{`Successfully submitted modification for ${selectedPosition.pair}!`}
						<div className="text-xs text-muted-foreground">
							Transaction is being processed on the blockchain
						</div>
					</div>,
				);

				// Close the dialog and reset form
				setIsModifyDialogOpen(false);
				setSelectedPosition(null);
				setNewMargin("");
				setNewLeverage(2);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Failed to modify position";
				toast.error(
					<div>
						Failed to modify position
						<div className="text-xs text-muted-foreground">{errorMessage}</div>
					</div>,
				);
				throw error;
			}
		}, [address, selectedPosition, newMargin, newLeverage, tradingPairAddress, sendTransaction]);

	// Handle dialog opens
	const openCloseDialog = (position: Position) => {
		setSelectedPosition(position);
		setIsCloseDialogOpen(true);
	};

	const _openModifyDialog = (position: Position) => {
		setSelectedPosition(position);
		setNewMargin(position.margin.replace(/[$,]/g, ""));
		setNewLeverage(position.leverageValue);
		setIsModifyDialogOpen(true);
	};

	// Navigate to position's chart
	const navigateToChart = (position: Position) => {
		const tokenSymbol = extractTokenSymbol(position.pair);
		navigate(`/perp?token=${tokenSymbol}`);
	};

	// Track if we've already shown the confirmation toast for this hash
	const confirmedHashRef = useRef<string | null>(null);

	// Handle transaction confirmation
	useEffect(() => {
		if (isConfirmed && hash && confirmedHashRef.current !== hash) {
			confirmedHashRef.current = hash;

			// Show confirmation toast
			toast.success(
				"Transaction confirmed! Your transaction has been confirmed on the blockchain.",
			);

			// Refresh positions after confirmation
			setTimeout(() => {
				onRefetch();
			}, 2000);
		}
	}, [isConfirmed, hash, onRefetch]);

	return (
		<div className="bg-card border border-gray-100/10 rounded-lg">
			<Tabs defaultValue="open" className="w-full">
				<TabsList className="grid w-full grid-cols-2 gap-0 mb-4">
					<TabsTrigger
						value="open"
						className="text-[#818181] hover:text-[#bdbdbd] data-[state=active]:text-[#4DAD31] data-[state=active]:border-[#4DAD31]"
					>
						Open Positions ({openPositions.length})
					</TabsTrigger>
					<TabsTrigger
						value="history"
						className="text-[#818181] hover:text-[#bdbdbd] data-[state=active]:text-[#4DAD31] data-[state=active]:border-[#4DAD31]"
					>
						Position History ({closedPositions.length})
					</TabsTrigger>
				</TabsList>

				<TabsContent value="open" className="mt-0">
					{openPositions.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12">
							<div className="text-gray-400 mb-2">No open positions</div>
							<p className="text-gray-500 text-sm">Your open positions will appear here</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-slate-800">
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Position</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Size</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Entry Price</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Margin</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Leverage</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">PnL</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Liq. Price</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Actions</th>
									</tr>
								</thead>
								<tbody>
									{openPositions.map((position) => (
										<tr
											key={position.id}
											onClick={() => navigateToChart(position)}
											className="border-b border-slate-800/50 hover:bg-slate-800/20 cursor-pointer transition-colors"
										>
											<td className="p-4">
												<div className="flex items-center gap-2">
													<span className="text-white font-medium">{position.pair}</span>
													<Badge
														variant={position.isLong ? "default" : "destructive"}
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
													position.tokenSymbol,
												)}
											</td>
											<td className="p-4 text-white">{position.entryPrice}</td>
											<td className="p-4 text-white">{position.margin}</td>
											<td className="p-4 text-white">{position.leverage}</td>
											<td className="p-4">
												<div className="flex flex-col">
													<span
														className={`font-medium ${
															isPositionProfitable(position.realtimeData.realtimePnl)
																? "text-green-400"
																: "text-red-400"
														}`}
													>
														{position.realtimeData.pnlPercentage}
													</span>
													<span
														className={`text-sm ${
															isPositionProfitable(position.realtimeData.realtimePnl)
																? "text-green-400"
																: "text-red-400"
														}`}
													>
														{position.realtimeData.realtimePnl}
													</span>
												</div>
											</td>
											<td className="p-4 text-white">{position.liquidationPrice}</td>
											<td className="p-4">
												<div className="flex items-center gap-2">
													{/* <Button
														size="sm"
														variant="outline"
														onClick={() => {}}
														className="border-green-600 text-green-400 hover:bg-green-600 hover:text-white flex items-center gap-1"
													>
														<svg
															width="16"
															height="16"
															viewBox="0 0 24 24"
															fill="currentColor"
															className="shrink-0"
														>
															<title>
																Generate PNL
															</title>
															<path d="M12 2L13.09 8.26L19 7L17.91 13.26L22 14L16.96 20.74L11 19L5.04 20.74L0 14L4.09 13.26L3 7L8.91 8.26L12 2Z" />
														</svg>
														PnL
													</Button> */}
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
														onClick={(e) => {
															e.stopPropagation();
															openCloseDialog(position);
														}}
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
							<div className="text-gray-400 mb-2">No position history</div>
							<p className="text-gray-500 text-sm">Your closed positions will appear here</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-slate-800">
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Position</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Size</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Entry Price</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Exit Price</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">PnL</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Status</th>
										<th className="text-left p-4 text-gray-400 text-sm font-medium">Closed At</th>
									</tr>
								</thead>
								<tbody>
									{closedPositions.map((position) => (
										<tr
											key={position.id}
											onClick={() => navigateToChart(position)}
											className="border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/20 transition-colors"
										>
											<td className="p-4">
												<div className="flex items-center gap-2">
													<span className="text-white font-medium">{position.pair}</span>
													<Badge
														variant={position.isLong ? "default" : "destructive"}
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
													position.tokenSymbol,
												)}
											</td>
											<td className="p-4 text-white">{position.entryPrice}</td>
											<td className="p-4 text-white">{position.exitPrice || "N/A"}</td>
											<td className="p-4">
												<div className="flex flex-col">
													<span
														className={`font-medium ${
															isPositionProfitable(position.pnl) ? "text-green-400" : "text-red-400"
														}`}
													>
														{position.pnlPercentage || "0%"}
													</span>
													<span
														className={`text-sm ${
															isPositionProfitable(position.pnl) ? "text-green-400" : "text-red-400"
														}`}
													>
														{position.pnl}
													</span>
												</div>
											</td>
											<td className="p-4">
												<Badge
													variant="secondary"
													className={
														position.status === "LIQUIDATED"
															? "bg-red-500/20 text-red-400"
															: "bg-gray-500/20 text-gray-400"
													}
												>
													{position.status}
												</Badge>
											</td>
											<td className="p-4 text-gray-400 text-sm">{position.closedAt || "N/A"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</TabsContent>
			</Tabs>

			<Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
				<DialogContent className="bg-slate-900 border-slate-800 text-white">
					<DialogHeader>
						<DialogTitle>Close Position</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						{selectedPosition && (
							<div className="bg-slate-800 p-4 rounded">
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-gray-400">Position:</span>
										<div className="font-medium">
											{selectedPosition.tokenSymbol.split("-")[0]}{" "}
											{selectedPosition.isLong ? "Long" : "Short"}
										</div>
									</div>
									<div>
										<span className="text-gray-400">Current PnL:</span>
										<div
											className={`font-medium ${
												isPositionProfitable(selectedPosition.realtimeData.realtimePnl)
													? "text-green-400"
													: "text-red-400"
											}`}
										>
											{selectedPosition.realtimeData.realtimePnl}
										</div>
									</div>
								</div>
							</div>
						)}
						{closeError && (
							<div className="bg-red-500/20 border border-red-500/50 text-red-400 p-3 rounded text-sm">
								{closeError.message}
							</div>
						)}{" "}
						<div className="flex gap-3 justify-end">
							<Button
								variant="outline"
								onClick={() => setIsCloseDialogOpen(false)}
								disabled={isClosingPosition || isPending}
							>
								Cancel
							</Button>
							<Button
								onClick={() => selectedPosition && handleClosePosition(selectedPosition)}
								disabled={isClosingPosition || isPending}
								className="bg-red-600 hover:bg-red-700"
							>
								{isClosingPosition || isPending ? "Processing..." : "Close Position"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={isModifyDialogOpen} onOpenChange={setIsModifyDialogOpen}>
				<DialogContent className="bg-slate-900 border-slate-800 text-white">
					<DialogHeader>
						<DialogTitle>Modify Position</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						{selectedPosition && (
							<div className="bg-slate-800 p-4 rounded">
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-gray-400">Position:</span>
										<div className="font-medium">
											{selectedPosition.pair} {selectedPosition.side}
										</div>
									</div>
									<div>
										<span className="text-gray-400">Current Margin:</span>
										<div className="font-medium">{selectedPosition.margin}</div>
									</div>
									<div>
										<span className="text-gray-400">Current Leverage:</span>
										<div className="font-medium">{selectedPosition.leverage}</div>
									</div>
								</div>
							</div>
						)}
						<div className="space-y-3">
							<div>
								<label className="text-sm text-gray-400 mb-1 block" htmlFor="">
									New Margin (USDC)
								</label>
								<Input
									type="number"
									value={newMargin}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
										setNewMargin(e.target.value)
									}
									placeholder="Enter new margin amount"
									className="bg-slate-800 border-slate-700 text-white"
								/>
							</div>

							<div>
								<label className="text-sm text-gray-400 mb-1 block" htmlFor="">
									New Leverage (1x - 100x)
								</label>
								<div className="flex items-center gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={() => setNewLeverage(Math.max(1, newLeverage - 1))}
										disabled={newLeverage <= 1}
									>
										-
									</Button>
									<Input
										type="number"
										value={newLeverage}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
											setNewLeverage(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))
										}
										className="bg-slate-800 border-slate-700 text-white text-center"
										min={1}
										max={100}
									/>
									<Button
										size="sm"
										variant="outline"
										onClick={() => setNewLeverage(Math.min(100, newLeverage + 1))}
										disabled={newLeverage >= 100}
									>
										+
									</Button>
								</div>
							</div>
						</div>
						{modifyError && (
							<div className="bg-red-500/20 border border-red-500/50 text-red-400 p-3 rounded text-sm">
								{modifyError.message}
							</div>
						)}{" "}
						<div className="flex gap-3 justify-end">
							<Button
								variant="outline"
								onClick={() => setIsModifyDialogOpen(false)}
								disabled={isClosingPosition || isPending}
							>
								Cancel
							</Button>
							<Button
								onClick={handleModifyPosition}
								disabled={isClosingPosition || isPending}
								className="bg-blue-600 hover:bg-blue-700"
							>
								{isModifyingPosition || isPending ? "Processing..." : "Modify Position"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
