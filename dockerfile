# Multi-stage build for optimized image size and faster builds

# Stage 1: Dependencies
FROM oven/bun:latest AS deps
WORKDIR /app

# Copy only dependency files for better caching
COPY package.json bun.lockb* ./

# Install all dependencies (devDependencies needed for build)
RUN bun install --frozen-lockfile

# Stage 2: Builder
FROM oven/bun:latest AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy necessary files only (not entire directory)
COPY package.json bun.lockb* next.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
COPY components.json postcss.config.mjs prisma.config.ts ./

# Build Next.js with optimizations and increased memory
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN bun run build

# Stage 3: Runner (Production)
FROM oven/bun:latest AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use standalone server
CMD ["bun", "run", "server.js"]
