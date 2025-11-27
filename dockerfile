# Multi-stage build for optimized image size and faster builds

# Stage 1: Dependencies
FROM oven/bun:latest AS deps
WORKDIR /app

# Copy only dependency files for better caching
COPY package.json bun.lock* ./

# Install all dependencies (devDependencies needed for build)
RUN bun install --frozen-lockfile

# Stage 2: Builder
FROM oven/bun:latest AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY . .

# Build the Vite app
ENV NODE_ENV=production
RUN bun run build

# Stage 3: Runner (Production)
FROM nginx:alpine AS runner

# Copy built app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config for SPA routing
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
