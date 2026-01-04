FROM oven/bun:1.3.5 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN apt-get update && apt-get install -y python3 make g++ python-is-python3
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN --mount=type=cache,target=/root/.bun/install/cache cd /temp/dev && bun install --frozen-lockfile

FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

FROM base AS release
ENV NODE_ENV=production
COPY --from=install /temp/dev/node_modules node_modules
COPY --from=prerelease /usr/src/app/package.json .
COPY --from=prerelease /usr/src/app/vite.config.ts .
COPY --from=prerelease /usr/src/app/app app
COPY --from=prerelease /usr/src/app/public public

# run the app
USER bun
EXPOSE 3002/tcp
ENTRYPOINT [ "bun", "run", "app/server.ts" ]
