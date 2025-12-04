import { Wallet } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useAccount } from "wagmi";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectWallet } from "@/components/ui/ConnectWallet";

interface AuthGateProps {
	children: ReactNode;
	/** Title shown when wallet is not connected */
	title?: string;
	/** Description text explaining why connection is needed */
	description?: string;
	/** Icon component to display (defaults to Wallet) */
	icon?: ComponentType<{ className?: string }>;
	/** If true, shows inline card instead of full-page centered view */
	inline?: boolean;
}

/**
 * AuthGate - A consistent wrapper for pages/sections requiring wallet connection.
 * 
 * Usage:
 * ```tsx
 * <AuthGate title="Connect to View Portfolio">
 *   <PortfolioContent />
 * </AuthGate>
 * ```
 */
export function AuthGate({
	children,
	title = "Connect Wallet",
	description = "Connect your wallet to access this feature.",
	icon: Icon = Wallet,
	inline = false,
}: AuthGateProps) {
	const { isConnected } = useAccount();

	if (isConnected) {
		return <>{children}</>;
	}

	if (inline) {
		return (
			<Card className="border-accent/20">
				<CardContent className="flex flex-col items-center justify-center py-8 text-center">
					<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
						<Icon className="w-6 h-6 text-primary" />
					</div>
					<h3 className="text-lg font-medium mb-2">{title}</h3>
					<p className="text-muted-foreground text-sm max-w-md mb-4">
						{description}
					</p>
					<ConnectWallet />
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-screen-2xl">
				<div className="flex flex-col items-center justify-center py-20 text-center">
					<div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
						<Icon className="w-8 h-8 text-primary" />
					</div>
					<h2 className="text-2xl font-semibold mb-3">{title}</h2>
					<p className="text-muted-foreground max-w-md mb-6">
						{description}
					</p>
					<ConnectWallet />
				</div>
			</main>
		</div>
	);
}
