import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma instance.
 *
 * Cached on globalThis so Bun's `--watch` reload does not open a new connection
 * pool on every file change and exhaust Postgres connections in development.
 *
 * Its own module rather than living in the package's index, so that the query
 * helpers beside it can import the client without importing the index that
 * re-exports them — a cycle that works today only because nothing touches
 * `prisma` at module scope, which is not a property worth depending on.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
	globalForPrisma.prisma ??
	new PrismaClient({
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	});

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

/** True when a DATABASE_URL is configured; features that need it degrade gracefully. */
export function isDatabaseConfigured(): boolean {
	return Boolean(process.env.DATABASE_URL);
}
