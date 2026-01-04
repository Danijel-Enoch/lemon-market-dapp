FROM oven/bun:1.3.5 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN --mount=type=cache,target=/root/.bun/install/cache cd /temp/dev && bun install --frozen-lockfile --optional --ignore-scripts

FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# build the app
ENV NODE_ENV=production
RUN bun run build

FROM base AS release
COPY --from=install --chown=bun:bun /temp/dev/node_modules node_modules
COPY --from=prerelease --chown=bun:bun /usr/src/app/package.json .
COPY --from=prerelease --chown=bun:bun /usr/src/app/vite.config.js .
COPY --from=prerelease --chown=bun:bun /usr/src/app/app app
COPY --from=prerelease --chown=bun:bun /usr/src/app/public public
COPY --from=prerelease --chown=bun:bun /usr/src/app/build build
COPY --from=prerelease --chown=bun:bun /usr/src/app/tsconfig.json .

# Fix permissions for runtime
RUN mkdir -p .react-router && chown -R bun:bun .react-router

# run the app
USER bun
EXPOSE 3002/tcp
ENTRYPOINT [ "bun", "run", "app/server.ts" ]
