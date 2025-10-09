import { Lock, Sparkles, TrendingUp, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function StakingPage() {
	return (
		<div className="min-h-screen">
			<main className="container mx-auto px-6 py-8 max-w-[1600px]">
				{/*<div className="mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Lock className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">
                                Staking
                            </h1>
                            <p className="text-muted-foreground text-sm">
                                Stake your tokens to earn rewards
                            </p>
                        </div>
                    </div>
                </div>*/}

				<div className="max-w-4xl mx-auto space-y-6">
					{/* Main Coming Soon Card */}
					<Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
						<CardContent className="p-12 text-center">
							<div className="mb-8">
								<div className="relative inline-block mb-6">
									<Lock className="w-20 h-20 text-primary mx-auto" />
									<div className="absolute -top-2 -right-2">
										<Sparkles className="w-8 h-8 text-primary animate-pulse" />
									</div>
								</div>
								<Badge className="mb-4 bg-primary/20 text-primary hover:bg-primary/30">
									Coming Soon
								</Badge>
								<h2 className="text-3xl font-bold text-foreground mb-4">Staking is on the Way</h2>
								<p className="text-muted-foreground text-lg max-w-lg mx-auto">
									We're building a powerful staking platform to help you earn passive income on your
									tokens
								</p>
							</div>
						</CardContent>
					</Card>

					{/* Feature Preview Cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<Card className="bg-card border-gray-100/10">
							<CardContent className="p-6 text-center">
								<div className="mb-4">
									<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
										<TrendingUp className="w-6 h-6 text-primary" />
									</div>
								</div>
								<h3 className="text-lg font-semibold text-foreground mb-2">Competitive APY</h3>
								<p className="text-sm text-muted-foreground">
									Earn attractive returns on your staked tokens
								</p>
							</CardContent>
						</Card>

						<Card className="bg-card border-gray-100/10">
							<CardContent className="p-6 text-center">
								<div className="mb-4">
									<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
										<Shield className="w-6 h-6 text-primary" />
									</div>
								</div>
								<h3 className="text-lg font-semibold text-foreground mb-2">Secure & Audited</h3>
								<p className="text-sm text-muted-foreground">
									Your funds protected by smart contract security
								</p>
							</CardContent>
						</Card>

						<Card className="bg-card border-gray-100/10">
							<CardContent className="p-6 text-center">
								<div className="mb-4">
									<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
										<Sparkles className="w-6 h-6 text-primary" />
									</div>
								</div>
								<h3 className="text-lg font-semibold text-foreground mb-2">Flexible Terms</h3>
								<p className="text-sm text-muted-foreground">
									Choose staking periods that fit your strategy
								</p>
							</CardContent>
						</Card>
					</div>

					{/* Contact Info Card */}
					<Card className="bg-gradient-to-br from-green-800/60 via-green-800/40 to-green-950/60 border-white/10 backdrop-blur-sm">
						<CardContent className="p-6">
							<div className="text-center">
								<h3 className="text-lg font-semibold text-white mb-3">
									Interested in Early Access?
								</h3>
								<p className="text-sm text-white/80 mb-2">
									Contact the development team to learn more about staking opportunities
								</p>
								<p className="text-xs text-white/60">
									Stay tuned for updates on our staking launch
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
