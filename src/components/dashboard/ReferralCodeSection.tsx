import { Copy, Link, RefreshCw } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import useAsyncFn from "react-use/lib/useAsyncFn";
import { Button } from "@/components/ui/button";
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
	const [linkCopied, setLinkCopied] = useState(false);

	const [, handleCopyCode] = useAsyncFn(async () => {
		if (!referralCode) return;
		try {
			await navigator.clipboard.writeText(referralCode);
			setCopied(true);
			toast.success("Referral code copied to clipboard!");
			setTimeout(() => setCopied(false), 2000);
		} catch (_error) {
			toast.error("Failed to copy referral code");
			throw _error;
		}
	}, [referralCode]);

	const [, handleCopyReferralLink] = useAsyncFn(async () => {
		if (!referralCode) return;
		try {
			const baseUrl = window.location.origin;
			const referralLink = `${baseUrl}?ref=${referralCode}`;
			await navigator.clipboard.writeText(referralLink);
			setLinkCopied(true);
			toast.success("Referral link copied to clipboard!");
			setTimeout(() => setLinkCopied(false), 2000);
		} catch (_error) {
			toast.error("Failed to copy referral link");
			throw _error;
		}
	}, [referralCode]);

	const [, handleGenerateCode] = useAsyncFn(async () => {
		const code = await onGenerate();
		if (code) {
			toast.success("Referral code generated successfully!");
		} else {
			toast.error("Failed to generate referral code");
			throw new Error("Failed to generate referral code");
		}
	}, [onGenerate]);

	if (referralCode) {
		return (
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
				<div className="space-y-2">
					<Button onClick={handleCopyReferralLink} variant="default" className="w-full gap-2">
						{linkCopied ? (
							<>
								<span className="text-xs">✓</span>
								Link Copied!
							</>
						) : (
							<>
								<Link className="size-4" />
								Copy Referral Link
							</>
						)}
					</Button>
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
								Regenerate Code
							</>
						)}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					Share your referral link with friends to earn 10 points when they sign up!
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Create your unique referral code to start earning rewards when your friends join!
			</p>
			<Button onClick={handleGenerateCode} disabled={isGenerating} className="w-full">
				{isGenerating ? (
					<>
						<RefreshCw className="size-4 animate-spin mr-2" />
						Creating Code...
					</>
				) : (
					"Create Referral Code"
				)}
			</Button>
		</div>
	);
}
