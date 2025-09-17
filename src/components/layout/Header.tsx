"use client";

export function Header() {
	return (
		<header className="h-16 px-6 border-b border-slate-800">
			<div className="flex items-center justify-between h-full max-w-7xl mx-auto">
				{/* Logo */}
				<div className="flex items-center">
					<div className="text-teal-400 font-bold text-xl leading-none">
						contan
					</div>
				</div>

				{/* Navigation */}
				<nav className="flex items-center space-x-8">
					{/* Trading Section */}
					<div className="flex items-center space-x-6">
						<div className="relative">
							<button type="button" className="text-gray-400 hover:text-gray-300 font-bold text-sm transition-colors">
								Advanced
							</button>
							{/* New Badge */}
							<span className="absolute -top-2 -right-8 inline-flex items-center px-2 py-0.5 rounded-md text-xs font-light text-teal-500 bg-slate-900 border border-teal-600">
								New
							</span>
						</div>
						<button type="button" className="text-gray-500 hover:text-gray-400 font-bold text-sm transition-colors">
							Simplified
						</button>
					</div>

					{/* Main Navigation */}
					<div className="flex items-center space-x-6">
						<button type="button" className="text-gray-500 hover:text-gray-400 font-bold text-sm transition-colors">
							Staking
						</button>
						<button type="button" className="text-gray-500 hover:text-gray-400 font-bold text-sm transition-colors">
							oTango
						</button>
						<button type="button" className="text-gray-500 hover:text-gray-400 font-bold text-sm transition-colors">
							Profile
						</button>
						<button type="button" className="text-gray-500 hover:text-gray-400 font-bold text-sm transition-colors">
							Airdrop
						</button>
					</div>
				</nav>

				{/* Right Section */}
				<div className="flex items-center space-x-6">
					{/* Resources */}
					<button type="button" className="text-gray-600 hover:text-gray-500 font-bold text-sm transition-colors">
						Resources
					</button>

					{/* Fee Profile */}
					<div className="text-right">
						<div className="text-gray-400 text-xs font-medium">Fee Profile</div>
						<div className="text-gray-400 text-xs">25 bps/5 bps</div>
					</div>

					{/* Connect Wallet Button */}
					<button type="button" className="flex items-center px-4 py-2 bg-slate-900 border border-slate-700 rounded-md text-gray-300 hover:text-white hover:border-slate-600 font-bold text-sm transition-all">
						Connect Wallet
					</button>
				</div>
			</div>
		</header>
	);
}
