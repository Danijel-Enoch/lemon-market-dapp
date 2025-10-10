import type { Metadata } from "next";

const miniAppEmbed = {
	version: "1",
	imageUrl: "https://demo.lemonmarkets.xyz/image/wallet-icon.svg",
	button: {
		title: "View Positions",
		action: {
			type: "launch_miniapp",
			name: "Lemon Markets - Positions",
			url: "https://demo.lemonmarkets.xyz/positions",
			splashImageUrl: "https://demo.lemonmarkets.xyz/image/logo.png",
			splashBackgroundColor: "#000000"
		}
	}
};

export const metadata: Metadata = {
	title: "My Positions - Lemon Markets",
	description: "View and manage your trading positions",
	other: {
		"fc:miniapp": JSON.stringify(miniAppEmbed),
		"fc:frame": JSON.stringify(miniAppEmbed)
	},
	openGraph: {
		title: "My Positions - Lemon Markets",
		description: "View and manage your trading positions",
		images: ["https://demo.lemonmarkets.xyz/image/wallet-icon.svg"]
	}
};
