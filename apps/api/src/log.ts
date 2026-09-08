import { createLogger } from "@lemon/core";

/**
 * The API's logger.
 *
 * In its own module rather than in `app.ts` so the services can write through
 * it without importing the app they are mounted into — that import would run
 * the other way round and close a cycle.
 *
 * `LOG_LEVEL=debug` adds a line as each request arrives, the per-request detail
 * the services choose to emit, and the 4xx explanations that are otherwise only
 * visible to the caller. Default is one line per completed request.
 */
export const logger = createLogger("api");
