FROM node:22-alpine AS base

RUN npm i --global --no-update-notifier --no-fund pnpm

FROM base AS dependencies

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

FROM base AS build

WORKDIR /app

COPY . .
COPY --from=dependencies /app/node_modules ./node_modules

RUN pnpm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=build --chown=node:node /app/.output .

USER node

CMD  ["node", "server/index.mjs"]
