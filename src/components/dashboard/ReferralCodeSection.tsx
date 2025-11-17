"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ReferralCodeSectionProps {
	referralCode: string | null;
	isGenerating: boolean;
	onGenerate: () => Promise<string | null>;
}

export function ReferralCodeSection({
	referralCode,
	isGenerating,
	onGenerate,
}: ReferralCodeSectionProps) {
	const [copied, setCopied] = useState(false);

	const handleCopyCode = async () => {
		if (!referralCode) return;
		try {
			await navigator.clipboard.writeText(referralCode);
			setCopied(true);
			toast.success("Referral code copied to clipboard!");
			setTimeout(() => setCopied(false), 2000);
		} catch (_error) {
			toast.error("Failed to copy referral code");
		}
	};

	const handleGenerateCode = async () => {
		const code = await onGenerate();
		if (code) {
			toast.success("Referral code generated successfully!");
		} else {
			toast.error("Failed to generate referral code");
		}
	};

	return (
		<Card className="border-accent/20">
			<CardHeader className="border-b border-accent/10 pb-4">
				<CardTitle className="text-base font-semibold">Referral Code</CardTitle>
			</CardHeader>
			<CardContent className="pt-6">
				{referralCode ? (
					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<Input value={referralCode} readOnly className="bg-input/50 font-mono text-sm" />
							<Button
								size="icon"
								variant="outline"
								onClick={handleCopyCode}
								className="shrink-0"
								title="Copy referral code"
							>
								{copied ? <span className="text-xs">✓</span> : <Copy className="size-4" />}
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							Share your referral code with friends to earn rewards!
						</p>
						<Button
							onClick={handleGenerateCode}
							disabled={isGenerating}
							variant="outline"
							className="w-full"
						>
							{isGenerating ? (
								<>
									<RefreshCw className="size-4 animate-spin" />
									Generating...
								</>
							) : (
								<>
									<RefreshCw className="size-4" />
									Generate New Code
								</>
							)}
						</Button>
					</div>
				) : (
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							Create your unique referral code to start earning rewards when your friends trade!
						</p>
						<Button onClick={handleGenerateCode} disabled={isGenerating} className="w-full">
							{isGenerating ? (
								<>
									<RefreshCw className="size-4 animate-spin" />
									Creating Code...
								</>
							) : (
								"Create Referral Code"
							)}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
