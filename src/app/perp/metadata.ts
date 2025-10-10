import type { Metadata } from "next";

const miniAppEmbed = {
	version: "1",
	imageUrl: "https://demo.lemonmarkets.xyz/image/trading-icon.svg",
	button: {
		title: "Trade Perpetuals",
		action: {
			type: "launch_miniapp",
			name: "Lemon Markets - Perpetuals",
			url: "https://demo.lemonmarkets.xyz/perp",
			splashImageUrl: "https://demo.lemonmarkets.xyz/image/logo.png",
			splashBackgroundColor: "#000000"
		}
	}
};

export const metadata: Metadata = {
	title: "Perpetuals Trading - Lemon Markets",
	description: "Trade perpetual futures with leverage on Lemon Markets",
	other: {
		"fc:miniapp": JSON.stringify(miniAppEmbed),
		"fc:frame": JSON.stringify(miniAppEmbed)
	},
	openGraph: {
		title: "Perpetuals Trading - Lemon Markets",
		description: "Trade perpetual futures with leverage",
		images: ["https://demo.lemonmarkets.xyz/image/trading-icon.svg"]
	}
};
