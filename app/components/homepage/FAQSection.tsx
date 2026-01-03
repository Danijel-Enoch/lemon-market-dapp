import { ChevronDown } from "lucide-react";
import { type FC, useState } from "react";
import { Button } from "@app/components/ui/button";

const items = [
	{
		q: "How does Lemon Markets enable synthetic asset trading?",
		a: "We use oracle-powered price feeds to create synthetic perpetual markets for crypto, forex, and commodities. All trades settle against a unified collateral pool, eliminating the need for fragmented DEX liquidity.",
	},
	{
		q: "Which assets can I trade on Lemon Markets?",
		a: "You can trade perpetual contracts for major cryptocurrencies (BTC, ETH, SOL), forex pairs (EUR/USD, GBP/USD), and commodities (Gold, Silver). We're continuously adding new markets based on community demand.",
	},
	{
		q: "How do I get started with Lemon Markets?",
		a: "Simply connect your Web3 wallet (e.g., MetaMask, Brave Wallet, WalletConnect, or Coinbase Wallet), deposit collateral, and start trading. No KYC required. Our intuitive interface makes it easy for both beginners and experienced traders.",
	},
	{
		q: "What leverage options are available?",
		a: "Lemon Markets offers flexible leverage up to 100x on select markets. You can adjust your leverage based on your risk tolerance and trading strategy. Lower leverage options are available for more conservative traders.",
	},
	{
		q: "Is Lemon Markets available globally?",
		a: "Yes! Lemon Markets is a decentralized protocol accessible from anywhere in the world. However, users should ensure they comply with local regulations regarding cryptocurrency trading in their jurisdiction.",
	},
	{
		q: "Does Lemon Markets offer customer support?",
		a: "Absolutely! We provide 24/7 support through our Discord community, Telegram channel, and email support. Our documentation also includes detailed guides and tutorials for all platform features.",
	},
];

export const FAQSection: FC = () => {
	const [open, setOpen] = useState<number>(0);

	return (
		<section className="flex flex-col lg:flex-row items-center gap-8 py-16 lg:py-20 px-5 max-w-7xl mx-auto">
			<div className="text-center lg:text-left">
				<div className="inline-flex items-center gap-8">
					<img
						src="/assets/homepage/section-features-divider.png"
						alt="Divider"
						width={72}
						height={10}
						className="opacity-90"
					/>
					<span className="text-[#9DEA29] font-medium text-sm leading-[19px]">FAQs</span>
					<img
						src="/assets/homepage/section-features-divider.png"
						alt="Divider"
						width={72}
						height={10}
						className="opacity-90 rotate-180"
					/>
				</div>
				<div className="mt-6">
					<h3 className="text-3xl md:text-4xl font-medium bg-linear-to-r from-white to-gray-300 bg-clip-text text-transparent">
						Frequently Asked Questions
					</h3>
					<p className="mt-3 text-white/70">
						Find answers to common questions about trading perpetuals on Lemon Markets. Still have
						questions? Join our community!
					</p>
				</div>
				<Button
					asChild
					variant="shine"
					size="lg"
					className="mt-6 md:mb-6 lg:mb-0 h-auto py-3 px-6 rounded-xl font-semibold text-sm"
				>
					<a href="https://docs.lemonmarkets.xyz">Read Full Documentation</a>
				</Button>
			</div>

			<div className="lg:w-2/3 flex flex-col gap-4">
				{items.map((it, i) => (
					<div
						key={`faq-${it.q.slice(0, 20).replace(/\s+/g, "-")}-${i}`}
						className={`rounded-xl border ${
							open === i
								? "border-lime-500 shadow-[0_0_20px_rgba(157,234,41,0.3)] bg-neutral-900/60"
								: "border-white/10 bg-neutral-900/40"
						} transition-all duration-200`}
					>
						<button
							type="button"
							onClick={() => setOpen(i)}
							className="w-full flex items-center justify-between px-4 md:px-6 py-4 text-left hover:bg-neutral-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400"
						>
							<span className="text-white/90">{it.q}</span>
							<ChevronDown
								className={`w-5 h-5 text-white/60 transition-transform ${
									open === i ? "rotate-180" : ""
								}`}
							/>
						</button>
						{open === i && <div className="px-4 md:px-6 pb-4 text-white/70">{it.a}</div>}
					</div>
				))}
			</div>
		</section>
	);
};
