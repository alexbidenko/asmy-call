FROM oven/bun:1 AS build-client

WORKDIR /app

COPY client/package.json client/bun.lock ./
RUN bun install --frozen-lockfile

COPY client .
RUN bun run generate

FROM oven/bun:1-alpine AS build-server

WORKDIR /app

COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile

COPY server .
RUN bun run build

FROM oven/bun:1-alpine AS dependencies

WORKDIR /app

COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine

RUN apk add --no-cache tzdata
ENV TZ=Europe/Moscow

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=bun:bun server/package.json server/bun.lock ./
COPY --from=build-client --chown=bun:bun /app/.output/public ./client
COPY --from=build-server --chown=bun:bun /app/dist ./dist
COPY --from=dependencies --chown=bun:bun /app/node_modules ./node_modules

USER bun

CMD ["bun", "run", "start:prod"]
