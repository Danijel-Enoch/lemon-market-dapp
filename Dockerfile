FROM oven/bun:1.3.14 AS base
WORKDIR /usr/src/app

# --- manifests -------------------------------------------------------------
# Every workspace's package.json, and nothing else.
#
# These used to be copied one `COPY` line per workspace, which meant adding a
# package to the monorepo silently broke the image: bun could not resolve the
# new workspace, `--frozen-lockfile` failed, and the failure named the package
# rather than the missing line. Collecting them with `find` cannot go stale.
#
# The point of separating them at all is layer caching — `bun install` is the
# expensive step and should only re-run when a manifest or the lockfile changes,
# not on every source edit. That still holds: this stage is a copy and a find,
# and the install layer below keys on its output.
FROM base AS manifests
COPY . .
RUN find . -name package.json -not -path './node_modules/*' \
      -exec install -D {} /manifests/{} \; \
    && install -D bun.lock /manifests/bun.lock

# --- dependencies ----------------------------------------------------------
FROM base AS install
COPY --from=manifests /manifests/ ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --optional --ignore-scripts

# --- build -----------------------------------------------------------------
FROM base AS build
COPY --from=install /usr/src/app/node_modules node_modules
COPY . .
ENV NODE_ENV=production

# `VITE_` values are compiled into the browser bundle, so they are build inputs
# rather than runtime configuration. An image is therefore built for one chain:
# repointing a deployment between mainnet, a testnet and a fork means rebuilding,
# not restarting. Everything the server reads stays runtime environment.
ARG VITE_API_BASE_URL=/api
ARG VITE_WALLETCONNECT_PROJECT_ID=
ARG VITE_BASE_RPC_URL=
ARG VITE_CHAIN_ID=
ARG VITE_CHAIN_NAME=
ARG VITE_CHAIN_RPC_URL=
ARG VITE_CHAIN_EXPLORER_URL=
ARG VITE_VAULT_FACTORY_ADDRESS=
ARG VITE_PUBLIC_APP_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID \
    VITE_BASE_RPC_URL=$VITE_BASE_RPC_URL \
    VITE_CHAIN_ID=$VITE_CHAIN_ID \
    VITE_CHAIN_NAME=$VITE_CHAIN_NAME \
    VITE_CHAIN_RPC_URL=$VITE_CHAIN_RPC_URL \
    VITE_CHAIN_EXPLORER_URL=$VITE_CHAIN_EXPLORER_URL \
    VITE_VAULT_FACTORY_ADDRESS=$VITE_VAULT_FACTORY_ADDRESS \
    VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL

# The Prisma client is generated code and must exist before the app is bundled.
RUN bunx prisma generate --schema packages/db/prisma/schema.prisma
RUN cd apps/web && bunx --bun react-router build
# The operator console is a second app on its own origin, and it is not optional
# infrastructure — creating a vault happens nowhere else.
RUN cd apps/admin && bunx --bun react-router build

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
# Operational, not development tooling. `seed-venue-config.ts` writes the rows
# the admin create-vault flow would have written, and a deployment whose vaults
# have no venue configuration is one whose agent skips every vault — so this is
# a required step after any deploy that creates vaults, and it has to be in the
# image to be runnable against it.
COPY --from=build --chown=bun:bun /usr/src/app/scripts ./scripts

# react-router writes generated route types here at runtime.
RUN mkdir -p apps/web/.react-router && chown -R bun:bun apps/web/.react-router

USER bun
WORKDIR /usr/src/app/apps/web
EXPOSE 3002/tcp

# Serves the app and mounts the API in-process. Declared as CMD rather than
# ENTRYPOINT so `docker-compose.yml` can replace it outright for the migrate
# and standalone-API services.
CMD ["bun", "run", "./app/server.ts"]
