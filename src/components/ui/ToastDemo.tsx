"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
						onClick={() => toast.success(message, { icon: null })}
						variant="outline"
						className="text-green-600 border-green-600"
					>
						Success
					</Button>

					<Button
						onClick={() => toast.error(message, { icon: null })}
						variant="outline"
						className="text-red-600 border-red-600"
					>
						Error
					</Button>

					<Button
						onClick={() => toast(message, { icon: null })}
						variant="outline"
						className="text-yellow-600 border-yellow-600"
					>
						Warning
					</Button>

					<Button
						onClick={() => toast(message, { icon: null })}
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
							onClick={() => toast.loading("Transaction pending...", { icon: null })}
							variant="outline"
							size="sm"
						>
							Pending
						</Button>

						<Button
							onClick={() =>
								toast.success(
									<div>
										Transaction successful!
										<div className="text-xs text-muted-foreground">
											<a
												href={`https://etherscan.io/tx/${txHash}`}
												target="_blank"
												rel="noreferrer"
											>
												View on Explorer
											</a>
										</div>
									</div>,
									{ icon: null },
								)
							}
							variant="outline"
							size="sm"
						>
							Success
						</Button>

						<Button
							onClick={() => toast.error("Transaction failed", { icon: null })}
							variant="outline"
							size="sm"
						>
							Failed
						</Button>

						<Button
							onClick={() =>
								toast.success(
									<div>
										Transaction confirmed!
										<div className="text-xs text-muted-foreground">
											<a
												href={`https://etherscan.io/tx/${txHash}`}
												target="_blank"
												rel="noreferrer"
											>
												View on Explorer
											</a>
										</div>
									</div>,
									{ icon: null },
								)
							}
							variant="outline"
							size="sm"
						>
							Confirmed
						</Button>
					</div>
				</div>

				<Button onClick={() => toast.dismiss()} variant="destructive" size="sm" className="w-full">
					Dismiss All
				</Button>
			</CardContent>
		</Card>
	);
}
