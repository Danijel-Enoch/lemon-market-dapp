import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AirdropPage() {
	return (
		<div className="min-h-screen bg-slate-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8 text-center">
					<h1 className="text-4xl font-bold text-white mb-4">Airdrop Campaign</h1>
					<p className="text-gray-400 text-lg">
						Participate in our ecosystem and earn TANGO tokens
					</p>
				</div>

				{/* Current Campaign Status */}
				<Card className="bg-slate-900 border-slate-800 mb-8">
					<CardHeader>
						<CardTitle className="text-white text-center text-xl">Season 1 Airdrop</CardTitle>
					</CardHeader>
					<CardContent className="text-center space-y-6">
						<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
							<div>
								<div className="text-2xl font-bold text-teal-400 mb-1">1,000,000</div>
								<div className="text-gray-400 text-sm">Total TANGO Tokens</div>
							</div>
							<div>
								<div className="text-2xl font-bold text-white mb-1">45 days</div>
								<div className="text-gray-400 text-sm">Time Remaining</div>
							</div>
							<div>
								<div className="text-2xl font-bold text-white mb-1">12,543</div>
								<div className="text-gray-400 text-sm">Participants</div>
							</div>
							<div>
								<div className="text-2xl font-bold text-green-400 mb-1">Live</div>
								<div className="text-gray-400 text-sm">Campaign Status</div>
							</div>
						</div>
						<Button className="bg-teal-500 hover:bg-teal-600 text-lg px-8 py-3">
							Check Eligibility
						</Button>
					</CardContent>
				</Card>

				{/* How to Participate */}
				<div className="mb-8">
					<h2 className="text-2xl font-bold text-white mb-6 text-center">How to Participate</h2>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<div className="flex items-center justify-center w-12 h-12 bg-teal-500/20 rounded-full mx-auto mb-4">
									<span className="text-teal-400 font-bold text-xl">1</span>
								</div>
								<CardTitle className="text-white text-center">Trade on Platform</CardTitle>
							</CardHeader>
							<CardContent className="text-center">
								<p className="text-gray-400 mb-4">
									Execute trades on our platform to earn points. Higher volume = more points.
								</p>
								<div className="text-teal-400 font-semibold">Up to 1000 points/trade</div>
							</CardContent>
						</Card>

						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<div className="flex items-center justify-center w-12 h-12 bg-teal-500/20 rounded-full mx-auto mb-4">
									<span className="text-teal-400 font-bold text-xl">2</span>
								</div>
								<CardTitle className="text-white text-center">Stake Tokens</CardTitle>
							</CardHeader>
							<CardContent className="text-center">
								<p className="text-gray-400 mb-4">
									Stake your tokens in our pools to earn additional airdrop points.
								</p>
								<div className="text-teal-400 font-semibold">50 points/day staked</div>
							</CardContent>
						</Card>

						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<div className="flex items-center justify-center w-12 h-12 bg-teal-500/20 rounded-full mx-auto mb-4">
									<span className="text-teal-400 font-bold text-xl">3</span>
								</div>
								<CardTitle className="text-white text-center">Refer Friends</CardTitle>
							</CardHeader>
							<CardContent className="text-center">
								<p className="text-gray-400 mb-4">
									Invite friends to join and earn bonus points for each successful referral.
								</p>
								<div className="text-teal-400 font-semibold">500 points/referral</div>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Your Progress */}
				<Card className="bg-slate-900 border-slate-800 mb-8">
					<CardHeader>
						<CardTitle className="text-white">Your Airdrop Progress</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
							<div>
								<div className="flex items-center justify-between mb-2">
									<span className="text-gray-400">Total Points</span>
									<span className="text-white font-bold">0</span>
								</div>
								<div className="w-full bg-slate-800 rounded-full h-3 mb-6">
									<div className="bg-teal-500 h-3 rounded-full" style={{ width: "0%" }}></div>
								</div>

								<div className="space-y-3">
									<div className="flex items-center justify-between">
										<span className="text-gray-400">Trading Points</span>
										<span className="text-white">0</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-gray-400">Staking Points</span>
										<span className="text-white">0</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-gray-400">Referral Points</span>
										<span className="text-white">0</span>
									</div>
								</div>
							</div>

							<div>
								<div className="text-center">
									<div className="text-gray-400 text-sm mb-2">Estimated TANGO Tokens</div>
									<div className="text-3xl font-bold text-teal-400 mb-4">0</div>
									<div className="text-gray-500 text-sm mb-6">
										Connect wallet to view your progress
									</div>
									<Button className="w-full bg-teal-500 hover:bg-teal-600">Connect Wallet</Button>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Leaderboard */}
				<Card className="bg-slate-900 border-slate-800">
					<CardHeader>
						<CardTitle className="text-white">Top Participants</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{[
								{ rank: 1, address: "0x1234...5678", points: 125000, badge: "🥇" },
								{ rank: 2, address: "0x8765...4321", points: 98500, badge: "🥈" },
								{ rank: 3, address: "0x9876...1234", points: 87200, badge: "🥉" },
								{ rank: 4, address: "0x5432...8765", points: 76800, badge: "" },
								{ rank: 5, address: "0x6789...2345", points: 65400, badge: "" },
							].map((participant) => (
								<div
									key={participant.rank}
									className="flex items-center justify-between p-3 bg-slate-800 rounded-lg"
								>
									<div className="flex items-center space-x-4">
										<div className="text-gray-400 font-semibold w-8">
											{participant.badge || `#${participant.rank}`}
										</div>
										<div className="text-white font-mono">{participant.address}</div>
									</div>
									<div className="text-teal-400 font-semibold">
										{participant.points.toLocaleString()} pts
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
