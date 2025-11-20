"use server";

export type KickoffVerifyTaskResponse = {
	success: boolean;
	message?: string;
	data?: unknown;
};

const KICKOFF_API_BASE = "https://www.kickoff.fun/api/projects";
const DEFAULT_SLUG = "lemon-markets";

export async function verifyTask(
	walletAddress: string,
	taskType: string = "connect_wallet",
	slug: string = DEFAULT_SLUG,
	apiKey?: string,
): Promise<KickoffVerifyTaskResponse> {
	try {
		const key = apiKey ?? process.env.KICKOFF_API_KEY;

		if (!key) {
			throw new Error("Kickoff API key is missing. Set KICKOFF_API_KEY or pass apiKey param.");
		}

		const url = `${KICKOFF_API_BASE}/${encodeURIComponent(slug)}/verify-task`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": key,
			},
			body: JSON.stringify({ walletAddress, taskType }),
			cache: "no-store",
		});

		const json = await response.json();

		if (!response.ok) {
			console.error("Kickoff task verification failed:", { json, status: response.status });
			return { success: false, message: json?.message || json.error || "Verification failed" };
		}

		return {
			success: true,
			data: json,
			message: (json && (json.message || json.status)) ?? "Verification successful",
		};
	} catch (err: unknown) {
		// Safely extract message
		let message = "Unknown error";
		if (err instanceof Error) message = err.message;
		else {
			try {
				// @ts-expect-error
				message = "error" in err ? String(err.error) : JSON.stringify(err as object);
			} catch {
				message = String(err);
			}
		}
		console.error("Kickoff task verification failed:", { message });
		return { success: false, message };
	}
}
