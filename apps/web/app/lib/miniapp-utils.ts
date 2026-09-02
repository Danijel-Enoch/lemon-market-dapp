/**
 * Generate Mini App embed metadata for a page
 * Use this to create shareable embeds dynamically
 */

interface EmbedOptions {
	title: string;
	url?: string;
	imageUrl?: string;
	description?: string;
}

export function generateMiniAppEmbed(options: EmbedOptions) {
	const baseUrl = import.meta.env.VITE_APP_URL || "https://lemon-loopa-ui.vercel.app";

	return {
		version: "1" as const,
		imageUrl: options.imageUrl || `${baseUrl}/image/features-image.png`,
		button: {
			title: options.title,
			action: {
				type: "launch_miniapp" as const,
				name: "Lemon Markets",
				url: options.url || baseUrl,
				splashImageUrl: `${baseUrl}/image/logo.png`,
				splashBackgroundColor: "#000000",
			},
		},
	};
}

export function generateMeta(options: EmbedOptions & { pageTitle?: string }) {
	const embed = generateMiniAppEmbed(options);

	return [
		{ title: options.pageTitle || options.title },
		{
			name: "description",
			content: options.description || "Trade perpetual futures on Lemon Markets",
		},
		{ name: "fc:miniapp", content: JSON.stringify(embed) },
		{ name: "fc:frame", content: JSON.stringify(embed) },
		{ property: "og:title", content: options.pageTitle || options.title },
		{
			property: "og:description",
			content: options.description || "Trade perpetual futures on Lemon Markets",
		},
		{ property: "og:image", content: embed.imageUrl },
	];
}

/**
 * Example usage:
 *
 * // In a page.tsx or layout.tsx:
 * import { generateMetadata } from '@/lib/miniapp-utils'
 *
 * export const metadata = generateMetadata({
 *   title: "Trade BTC",
 *   pageTitle: "Bitcoin Trading - Lemon Markets",
 *   url: "https://lemon-loopa-ui.vercel.app/perp?pair=BTC",
 *   description: "Trade Bitcoin perpetuals with leverage"
 * })
 */
