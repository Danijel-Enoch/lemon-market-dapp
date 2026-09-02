import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/**
 * Single Prisma instance.
 *
 * Cached on globalThis so Bun's `--watch` reload does not open a new connection
 * pool on every file change and exhaust Postgres connections in development.
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
