import { useMiniApp } from "@app/components/providers/MiniAppProvider";
import { useAsyncCallback } from "@app/hooks/useAsyncCallback";

export function useMiniAppActions() {
	const { isMiniApp } = useMiniApp();

	const [, composeCast] = useAsyncCallback(
		async (options: { text?: string; embeds?: [] | [string] | [string, string] }) => {
			if (!isMiniApp) {
				return null;
			}

			const { sdk } = await import("@farcaster/miniapp-sdk");
			const result = await sdk.actions.composeCast(options);
			return result;
		},
		[isMiniApp],
	);

	const [, addMiniApp] = useAsyncCallback(async () => {
		if (!isMiniApp) {
			return;
		}

		const { sdk } = await import("@farcaster/miniapp-sdk");
		await sdk.actions.addMiniApp();
	}, [isMiniApp]);

	const [, openUrl] = useAsyncCallback(
		async (url: string) => {
			if (!isMiniApp) {
				// Fallback to regular navigation for web
				window.open(url, "_blank");
				return;
			}

			const { sdk } = await import("@farcaster/miniapp-sdk");
			await sdk.actions.openUrl(url);
		},
		[isMiniApp],
	);

	return {
		composeCast,
		addMiniApp,
		openUrl,
		isMiniApp,
	};
}
