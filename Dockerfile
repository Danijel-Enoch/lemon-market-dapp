FROM oven/bun:1.3.14 AS base
WORKDIR /usr/src/app

# --- dependencies ----------------------------------------------------------
# Only the manifests are copied first so the install layer is reused whenever
# source changes but dependencies do not.
FROM base AS install
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
COPY packages/kyber/package.json ./packages/kyber/
COPY packages/relay/package.json ./packages/relay/
COPY packages/registry/package.json ./packages/registry/
COPY packages/pacifica/package.json ./packages/pacifica/
COPY packages/near-mpc/package.json ./packages/near-mpc/
COPY packages/db/package.json ./packages/db/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --optional --ignore-scripts

# --- build -----------------------------------------------------------------
FROM base AS build
COPY --from=install /usr/src/app/node_modules node_modules
COPY . .
ENV NODE_ENV=production
# The Prisma client is generated code and must exist before the app is bundled.
RUN bunx prisma generate --schema packages/db/prisma/schema.prisma
RUN cd apps/web && bunx --bun react-router build

# --- runtime ---------------------------------------------------------------
FROM base AS release
ENV NODE_ENV=production

# From `build`, not `install`: the Prisma client is generated into
# node_modules/.prisma during the build stage, and copying from `install`
# would leave the runtime without it.
COPY --from=build --chown=bun:bun /usr/src/app/node_modules node_modules
COPY --from=build --chown=bun:bun /usr/src/app/package.json ./
COPY --from=build --chown=bun:bun /usr/src/app/tsconfig.base.json ./
COPY --from=build --chown=bun:bun /usr/src/app/apps ./apps
COPY --from=build --chown=bun:bun /usr/src/app/packages ./packages

# react-router writes generated route types here at runtime.
RUN mkdir -p apps/web/.react-router && chown -R bun:bun apps/web/.react-router

USER bun
WORKDIR /usr/src/app/apps/web
EXPOSE 3002/tcp

# Serves the app and mounts the API in-process. Declared as CMD rather than
# ENTRYPOINT so `docker-compose.yml` can replace it outright for the migrate
# and standalone-API services.
CMD ["bun", "run", "./app/server.ts"]
