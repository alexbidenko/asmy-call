FROM node:22-alpine AS base

RUN npm i --global --no-update-notifier --no-fund pnpm

FROM base AS build-client

WORKDIR /app

COPY client/package.json client/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY client .
RUN pnpm run generate

FROM base AS build-server

WORKDIR /app

COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY server .
RUN pnpm run build

FROM base AS dependencies

WORKDIR /app

COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --production

FROM base

RUN apk add --no-cache tzdata
ENV TZ=Europe/Moscow

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node server/package.json server/pnpm-lock.yaml ./
COPY --from=build-client --chown=node:node /app/.output/public ./client
COPY --from=build-server --chown=node:node /app/dist ./dist
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

USER node

CMD ["pnpm", "start:prod"]
