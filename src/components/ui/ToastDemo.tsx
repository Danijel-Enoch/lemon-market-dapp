"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Toast } from "@/components/ui/toast";

export function ToastDemo() {
	const [message, setMessage] = useState("Hello from toast!");
	const [txHash, setTxHash] = useState("0x1234567890abcdef1234567890abcdef12345678");

	return (
		<Card className="max-w-md mx-auto m-4">
			<CardHeader>
				<CardTitle>Toast Notifications Demo</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Input
						placeholder="Toast message"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
					/>
					<Input
						placeholder="Transaction hash"
						value={txHash}
						onChange={(e) => setTxHash(e.target.value)}
					/>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<Button
						onClick={() => Toast.success(message)}
						variant="outline"
						className="text-green-600 border-green-600"
					>
						Success
					</Button>

					<Button
						onClick={() => Toast.error(message)}
						variant="outline"
						className="text-red-600 border-red-600"
					>
						Error
					</Button>

					<Button
						onClick={() => Toast.warning(message)}
						variant="outline"
						className="text-yellow-600 border-yellow-600"
					>
						Warning
					</Button>

					<Button
						onClick={() => Toast.info(message)}
						variant="outline"
						className="text-blue-600 border-blue-600"
					>
						Info
					</Button>
				</div>

				<div className="space-y-2">
					<h3 className="font-medium">Transaction Toasts:</h3>
					<div className="grid grid-cols-2 gap-2">
						<Button
							onClick={() => Toast.transaction.pending("Transaction pending...")}
							variant="outline"
							size="sm"
						>
							Pending
						</Button>

						<Button
							onClick={() =>
								Toast.transaction.success("Transaction successful!", {
									hash: txHash,
									explorerUrl: `https://etherscan.io/tx/${txHash}`,
								})
							}
							variant="outline"
							size="sm"
						>
							Success
						</Button>

						<Button
							onClick={() => Toast.transaction.failed("Transaction failed")}
							variant="outline"
							size="sm"
						>
							Failed
						</Button>

						<Button
							onClick={() =>
								Toast.transaction.confirmed("Transaction confirmed!", {
									hash: txHash,
									explorerUrl: `https://etherscan.io/tx/${txHash}`,
								})
							}
							variant="outline"
							size="sm"
						>
							Confirmed
						</Button>
					</div>
				</div>

				<Button onClick={() => Toast.dismiss()} variant="destructive" size="sm" className="w-full">
					Dismiss All
				</Button>
			</CardContent>
		</Card>
	);
}
