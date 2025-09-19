import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ProfilePage() {
	return (
		<div className="min-h-screen bg-slate-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">Profile</h1>
					<p className="text-gray-400">Manage your account and trading preferences</p>
				</div>

				<Tabs defaultValue="overview" className="space-y-6">
					<TabsList className="bg-slate-900 border border-slate-800">
						<TabsTrigger value="overview" className="text-gray-400 data-[state=active]:text-white">
							Overview
						</TabsTrigger>
						<TabsTrigger value="trading" className="text-gray-400 data-[state=active]:text-white">
							Trading History
						</TabsTrigger>
						<TabsTrigger
							value="preferences"
							className="text-gray-400 data-[state=active]:text-white"
						>
							Preferences
						</TabsTrigger>
						<TabsTrigger value="referrals" className="text-gray-400 data-[state=active]:text-white">
							Referrals
						</TabsTrigger>
					</TabsList>

					<TabsContent value="overview" className="space-y-6">
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							<Card className="bg-slate-900 border-slate-800">
								<CardHeader>
									<CardTitle className="text-white text-lg">Portfolio Value</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-bold text-white mb-2">$0.00</div>
									<div className="text-sm text-gray-400">Connect wallet to view</div>
								</CardContent>
							</Card>

							<Card className="bg-slate-900 border-slate-800">
								<CardHeader>
									<CardTitle className="text-white text-lg">Total P&L</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-bold text-white mb-2">$0.00</div>
									<div className="text-sm text-gray-400">All time</div>
								</CardContent>
							</Card>

							<Card className="bg-slate-900 border-slate-800">
								<CardHeader>
									<CardTitle className="text-white text-lg">Total Trades</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-bold text-white mb-2">0</div>
									<div className="text-sm text-gray-400">Lifetime trades</div>
								</CardContent>
							</Card>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<Card className="bg-slate-900 border-slate-800">
								<CardHeader>
									<CardTitle className="text-white">Account Status</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center justify-between">
										<span className="text-gray-400">Wallet Connected</span>
										<Badge variant="outline" className="text-gray-400 border-gray-600">
											Not Connected
										</Badge>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-gray-400">Fee Tier</span>
										<Badge variant="secondary" className="bg-teal-500/20 text-teal-400">
											Standard
										</Badge>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-gray-400">Referral Code</span>
										<span className="text-white font-mono">-</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-gray-400">Member Since</span>
										<span className="text-white">-</span>
									</div>
								</CardContent>
							</Card>

							<Card className="bg-slate-900 border-slate-800">
								<CardHeader>
									<CardTitle className="text-white">Quick Actions</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<Button className="w-full bg-teal-500 hover:bg-teal-600">Connect Wallet</Button>
									<Button variant="outline" className="w-full border-slate-700 text-gray-400">
										Export Trading History
									</Button>
									<Button variant="outline" className="w-full border-slate-700 text-gray-400">
										Generate Referral Code
									</Button>
								</CardContent>
							</Card>
						</div>
					</TabsContent>

					<TabsContent value="trading" className="space-y-6">
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">Trading History</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-center py-12">
									<div className="text-gray-400 mb-4">No trading history found</div>
									<div className="text-sm text-gray-500 mb-6">
										Connect your wallet and start trading to see your history here
									</div>
									<Button className="bg-teal-500 hover:bg-teal-600">Start Trading</Button>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="preferences" className="space-y-6">
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">Trading Preferences</CardTitle>
							</CardHeader>
							<CardContent className="space-y-6">
								<div>
									<label className="text-gray-400 text-sm mb-2 block">
										Default Slippage Tolerance
									</label>
									<select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
										<option>0.1%</option>
										<option>0.5%</option>
										<option>1.0%</option>
										<option>Custom</option>
									</select>
								</div>
								<div>
									<label className="text-gray-400 text-sm mb-2 block">Transaction Deadline</label>
									<select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
										<option>10 minutes</option>
										<option>20 minutes</option>
										<option>30 minutes</option>
										<option>Custom</option>
									</select>
								</div>
								<div>
									<label className="text-gray-400 text-sm mb-2 block">Interface Theme</label>
									<select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white">
										<option>Dark</option>
										<option>Light</option>
										<option>Auto</option>
									</select>
								</div>
								<Button className="w-full bg-teal-500 hover:bg-teal-600">Save Preferences</Button>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="referrals" className="space-y-6">
						<Card className="bg-slate-900 border-slate-800">
							<CardHeader>
								<CardTitle className="text-white">Referral Program</CardTitle>
							</CardHeader>
							<CardContent className="space-y-6">
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<div className="text-center">
										<div className="text-2xl font-bold text-white mb-1">0</div>
										<div className="text-gray-400 text-sm">Total Referrals</div>
									</div>
									<div className="text-center">
										<div className="text-2xl font-bold text-teal-400 mb-1">$0.00</div>
										<div className="text-gray-400 text-sm">Rewards Earned</div>
									</div>
									<div className="text-center">
										<div className="text-2xl font-bold text-white mb-1">0%</div>
										<div className="text-gray-400 text-sm">Commission Rate</div>
									</div>
								</div>
								<div className="bg-slate-800 rounded-lg p-4">
									<div className="text-gray-400 text-sm mb-2">Your Referral Link</div>
									<div className="flex items-center space-x-2">
										<input
											type="text"
											value="https://app.contango.xyz?ref=YOUR_CODE"
											readOnly
											className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
										/>
										<Button variant="outline" className="border-slate-600 text-gray-400">
											Copy
										</Button>
									</div>
								</div>
								<div className="text-center">
									<Button className="bg-teal-500 hover:bg-teal-600">Generate Referral Code</Button>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</main>
		</div>
	);
}
