"use client";

import { Share2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMiniAppActions } from "@/hooks/useMiniAppActions";

interface ShareTradeButtonProps {
	tradeDetails?: {
		pair: string;
		type: "long" | "short";
		leverage: number;
		amount: string;
	};
}

export function ShareTradeButton({ tradeDetails }: ShareTradeButtonProps) {
	const { composeCast, addMiniApp, isMiniApp } = useMiniAppActions();

	const handleShare = async () => {
		if (!tradeDetails) return;

		const text = `Just opened a ${tradeDetails.leverage}x ${tradeDetails.type} on ${tradeDetails.pair} with ${tradeDetails.amount} USDC on @lemonmarkets 🍋`;
		const embeds = [window.location.href];

		await composeCast({ text, embeds });
	};

	const handleAddApp = async () => {
		await addMiniApp();
	};

	if (!isMiniApp) {
		return null; // Don't show these buttons on regular website
	}

	return (
		<div className="flex gap-2">
			<Button
				onClick={handleShare}
				variant="outline"
				size="sm"
				className="flex items-center gap-2"
				disabled={!tradeDetails}
			>
				<Share2 className="w-4 h-4" />
				Share Trade
			</Button>

			<Button
				onClick={handleAddApp}
				variant="outline"
				size="sm"
				className="flex items-center gap-2"
			>
				<UserPlus className="w-4 h-4" />
				Add App
			</Button>
		</div>
	);
}
