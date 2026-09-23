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
# and the install layer below keys on the *content* it produces, so a source
# edit re-runs the find and then hits the install cache anyway.
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
#
# `FROM install`, not `FROM base` with a copy. Copying node_modules between
# stages re-materialises 2.2 GB of files — 21s going in, 26s coming out, and a
# fresh layer of that size each time. Deriving from the stage that already has
# it costs nothing and reuses the layer. `COPY . .` cannot clobber it: the
# .dockerignore excludes node_modules from the context.
FROM install AS build
COPY . .
ENV NODE_ENV=production

# `VITE_` values are compiled into the browser bundle, so they are build inputs
# rather than runtime configuration: changing one means rebuilding, not
# restarting. Everything the server reads stays runtime environment.
ARG VITE_API_BASE_URL=/api
ARG VITE_WALLETCONNECT_PROJECT_ID=
ARG VITE_BASE_RPC_URL=
ARG VITE_CHAIN_RPC_URL=
ARG VITE_VAULT_FACTORY_ADDRESS=
ARG VITE_PUBLIC_APP_URL=
ARG VITE_VAULT_FACTORY_ADDRESS_BASE=
ARG VITE_VAULT_FACTORY_ADDRESS_ARBITRUM=
ARG VITE_VAULT_FACTORY_ADDRESS_XLAYER=
ARG VITE_RPC_URL_BASE=
ARG VITE_RPC_URL_ARBITRUM=
ARG VITE_RPC_URL_XLAYER=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID \
    VITE_BASE_RPC_URL=$VITE_BASE_RPC_URL \
    VITE_CHAIN_RPC_URL=$VITE_CHAIN_RPC_URL \
    VITE_VAULT_FACTORY_ADDRESS=$VITE_VAULT_FACTORY_ADDRESS \
    VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL \
    VITE_VAULT_FACTORY_ADDRESS_BASE=$VITE_VAULT_FACTORY_ADDRESS_BASE \
    VITE_VAULT_FACTORY_ADDRESS_ARBITRUM=$VITE_VAULT_FACTORY_ADDRESS_ARBITRUM \
    VITE_VAULT_FACTORY_ADDRESS_XLAYER=$VITE_VAULT_FACTORY_ADDRESS_XLAYER \
    VITE_RPC_URL_BASE=$VITE_RPC_URL_BASE \
    VITE_RPC_URL_ARBITRUM=$VITE_RPC_URL_ARBITRUM \
    VITE_RPC_URL_XLAYER=$VITE_RPC_URL_XLAYER

# The Prisma client is generated code and must exist before either app is
# bundled — and once here rather than once per bundle.
RUN bunx prisma generate --schema packages/db/prisma/schema.prisma

RUN cd apps/web && bunx --bun react-router build
# The operator console is a second app on its own origin, and it is not optional
# infrastructure — creating a vault happens nowhere else.
#
# Sequential, and measured rather than assumed. Splitting these into sibling
# stages so BuildKit could run them concurrently was tried: 78s and 70s
# contending for the same cores, against 49s and 25s in sequence. They are
# CPU-bound, so running them together buys nothing on one machine and would cost
# more on a two-core runner.
RUN cd apps/admin && bunx --bun react-router build

# --- runtime ---------------------------------------------------------------
#
# `FROM install` for the same reason as the build stage: node_modules is already
# there, in a layer every other stage shares, so the runtime needs no copy of it.
FROM install AS release
ENV NODE_ENV=production

# The generated Prisma client, and nothing else from node_modules.
#
# `prisma generate` writes into node_modules/.prisma during the build, so the
# runtime needs that directory — but only that directory. Copying all of
# node_modules to get it was the single most expensive thing in this file: 2.2 GB
# re-written with `--chown`, 26s, and a duplicate layer that the image then had
# to export.
#
# Dev dependencies stay in the image deliberately. `prisma` is one of them and
# the `migrate` service runs `bunx prisma db push` against this image at deploy
# time, so pruning them would trade size for a broken release step.
# Both halves, and owned by the user that runs them.
#
# `.prisma` is the generated client; `@prisma` holds the query engines. The
# engines are the half that is easy to miss: `bun install --ignore-scripts`
# does not fetch them, `prisma generate` does, and the CLI tries to write there
# at runtime if they are absent — which as a non-root user fails with
# "Can't write to /usr/src/app/node_modules/@prisma/engines", and takes the
# `migrate` service down with it. 129 MB, against the 2.2 GB this used to copy.
COPY --from=build --chown=bun:bun /usr/src/app/node_modules/.prisma node_modules/.prisma
COPY --from=build --chown=bun:bun /usr/src/app/node_modules/@prisma node_modules/@prisma
COPY --from=build --chown=bun:bun /usr/src/app/package.json ./
COPY --from=build --chown=bun:bun /usr/src/app/tsconfig.base.json ./
COPY --from=build --chown=bun:bun /usr/src/app/packages ./packages
COPY --from=build --chown=bun:bun /usr/src/app/apps ./apps
# Operational, not development tooling. `seed-venue-config.ts` writes the rows
# the admin create-vault flow would have written, and `db-migrate.ts` applies
# the schema change `prisma db push` will not make unattended — both have to be
# in the image to be runnable against it.
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
