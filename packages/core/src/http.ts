/**
 * Small typed fetch wrapper shared by the Avantis, KyberSwap and Relay clients.
 *
 * Upstreams here signal "expected, actionable" conditions with HTTP 200 bodies
 * (KyberSwap returns `code: 4008 route not found`), so callers need the parsed
 * body on failure too — not just a thrown status. `UpstreamError` therefore
 * carries the payload.
 */

export class UpstreamError extends Error {
	constructor(
		readonly service: string,
		readonly status: number,
		message: string,
		readonly body?: unknown,
	) {
		super(message);
		this.name = "UpstreamError";
	}
}

export interface RequestOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE";
	query?: Record<string, string | number | boolean | undefined | null>;
	body?: unknown;
	headers?: Record<string, string>;
	timeoutMs?: number;
	signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export function buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]): string {
	const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
	for (const [key, value] of Object.entries(query ?? {})) {
		if (value === undefined || value === null || value === "") continue;
		url.searchParams.set(key, String(value));
	}
	return url.toString();
}

export async function requestJson<T>(
	service: string,
	baseUrl: string,
	path: string,
	options: RequestOptions = {},
): Promise<T> {
	const { method = "GET", query, body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
	const url = buildUrl(baseUrl, path, query);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	if (options.signal) {
		options.signal.addEventListener("abort", () => controller.abort(), { once: true });
	}

	let response: Response;
	try {
		response = await fetch(url, {
			method,
			headers: {
				accept: "application/json",
				...(body !== undefined ? { "content-type": "application/json" } : {}),
				...headers,
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: controller.signal,
		});
	} catch (error) {
		clearTimeout(timer);
		const reason = controller.signal.aborted
			? `timed out after ${timeoutMs}ms`
			: error instanceof Error
				? error.message
				: "network error";
		throw new UpstreamError(service, 0, `${service}: ${reason}`, undefined);
	}
	clearTimeout(timer);

	const text = await response.text();
	let parsed: unknown;
	try {
		parsed = text ? JSON.parse(text) : undefined;
	} catch {
		parsed = text;
	}

	if (!response.ok) {
		throw new UpstreamError(
			service,
			response.status,
			`${service}: HTTP ${response.status}`,
			parsed,
		);
	}

	return parsed as T;
}
