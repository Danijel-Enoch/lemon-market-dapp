import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ResourcesPage() {
	return (
		<div className="min-h-screen bg-slate-950">
			<Header />
			<main className="container mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">Resources</h1>
					<p className="text-gray-400">Documentation, guides, and tools to help you get started</p>
				</div>

				{/* Quick Links */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
					<Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors cursor-pointer">
						<CardHeader>
							<CardTitle className="text-white text-lg">📚 Documentation</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-gray-400 mb-4">
								Complete guides on how to use our platform and trading features.
							</p>
							<Button variant="outline" className="border-slate-700 text-gray-400">
								Read Docs
							</Button>
						</CardContent>
					</Card>

					<Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors cursor-pointer">
						<CardHeader>
							<CardTitle className="text-white text-lg">🎓 Academy</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-gray-400 mb-4">
								Learn about DeFi, trading strategies, and risk management.
							</p>
							<Button variant="outline" className="border-slate-700 text-gray-400">
								Start Learning
							</Button>
						</CardContent>
					</Card>

					<Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors cursor-pointer">
						<CardHeader>
							<CardTitle className="text-white text-lg">🛠 API Reference</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-gray-400 mb-4">
								Technical documentation for developers and API integration.
							</p>
							<Button variant="outline" className="border-slate-700 text-gray-400">
								View API
							</Button>
						</CardContent>
					</Card>
				</div>

				{/* Getting Started */}
				<Card className="bg-slate-900 border-slate-800 mb-8">
					<CardHeader>
						<CardTitle className="text-white">Getting Started</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="space-y-4">
								<h3 className="text-white font-semibold text-lg">For Beginners</h3>
								<div className="space-y-3">
									<div className="flex items-center space-x-3">
										<div className="w-2 h-2 bg-teal-400 rounded-full"></div>
										<a href="#" className="text-gray-400 hover:text-white transition-colors">
											What is Contango?
										</a>
									</div>
									<div className="flex items-center space-x-3">
										<div className="w-2 h-2 bg-teal-400 rounded-full"></div>
										<a href="#" className="text-gray-400 hover:text-white transition-colors">
											How to connect your wallet
										</a>
									</div>
									<div className="flex items-center space-x-3">
										<div className="w-2 h-2 bg-teal-400 rounded-full"></div>
										<a href="#" className="text-gray-400 hover:text-white transition-colors">
											Making your first trade
										</a>
									</div>
									<div className="flex items-center space-x-3">
										<div className="w-2 h-2 bg-teal-400 rounded-full"></div>
										<a href="#" className="text-gray-400 hover:text-white transition-colors">
											Understanding leverage and margin
										</a>
									</div>
								</div>
							</div>
							<div className="space-y-4">
								<h3 className="text-white font-semibold text-lg">Advanced Features</h3>
								<div className="space-y-3">
									<div className="flex items-center space-x-3">
										<div className="w-2 h-2 bg-teal-400 rounded-full"></div>
										<a href="#" className="text-gray-400 hover:text-white transition-colors">
											Advanced trading strategies
										</a>
									</div>
									<div className="flex items-center space-x-3">
										<div className="w-2 h-2 bg-teal-400 rounded-full"></div>
										<a href="#" className="text-gray-400 hover:text-white transition-colors">
											Using oTokens for options trading
										</a>
									</div>
									<div className="flex items-center space-x-3">
										<div className="w-2 h-2 bg-teal-400 rounded-full"></div>
										<a href="#" className="text-gray-400 hover:text-white transition-colors">
											Staking and yield farming
										</a>
									</div>
									<div className="flex items-center space-x-3">
										<div className="w-2 h-2 bg-teal-400 rounded-full"></div>
										<a href="#" className="text-gray-400 hover:text-white transition-colors">
											Risk management best practices
										</a>
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Community & Support */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<CardTitle className="text-white">Community</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-3">
									<span className="text-2xl">💬</span>
									<span className="text-gray-400">Discord</span>
								</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Join
								</Button>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-3">
									<span className="text-2xl">🐦</span>
									<span className="text-gray-400">Twitter</span>
								</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Follow
								</Button>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-3">
									<span className="text-2xl">📱</span>
									<span className="text-gray-400">Telegram</span>
								</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Join
								</Button>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-3">
									<span className="text-2xl">🌐</span>
									<span className="text-gray-400">Blog</span>
								</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Read
								</Button>
							</div>
						</CardContent>
					</Card>

					<Card className="bg-slate-900 border-slate-800">
						<CardHeader>
							<CardTitle className="text-white">Support</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-3">
									<span className="text-2xl">❓</span>
									<span className="text-gray-400">FAQ</span>
								</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									View
								</Button>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-3">
									<span className="text-2xl">🎫</span>
									<span className="text-gray-400">Submit Ticket</span>
								</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Create
								</Button>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-3">
									<span className="text-2xl">📧</span>
									<span className="text-gray-400">Email Support</span>
								</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Contact
								</Button>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-3">
									<span className="text-2xl">🔍</span>
									<span className="text-gray-400">Bug Report</span>
								</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Report
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Tools & Calculators */}
				<Card className="bg-slate-900 border-slate-800">
					<CardHeader>
						<CardTitle className="text-white">Tools & Calculators</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div className="bg-slate-800 rounded-lg p-4 text-center">
								<div className="text-2xl mb-2">🧮</div>
								<div className="text-white font-semibold mb-1">P&L Calculator</div>
								<div className="text-gray-400 text-sm mb-3">
									Calculate potential profits and losses
								</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Use Tool
								</Button>
							</div>
							<div className="bg-slate-800 rounded-lg p-4 text-center">
								<div className="text-2xl mb-2">📊</div>
								<div className="text-white font-semibold mb-1">Risk Calculator</div>
								<div className="text-gray-400 text-sm mb-3">Assess your position risk</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Use Tool
								</Button>
							</div>
							<div className="bg-slate-800 rounded-lg p-4 text-center">
								<div className="text-2xl mb-2">💰</div>
								<div className="text-white font-semibold mb-1">Fee Calculator</div>
								<div className="text-gray-400 text-sm mb-3">Estimate trading fees</div>
								<Button variant="outline" size="sm" className="border-slate-700 text-gray-400">
									Use Tool
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
