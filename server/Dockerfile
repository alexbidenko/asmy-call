FROM node:22-alpine AS base

RUN npm i --global --no-update-notifier --no-fund pnpm

FROM base AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM base AS dependencies

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --production

FROM base

RUN apk add --no-cache tzdata
ENV TZ=Europe/Moscow

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

USER node

CMD ["pnpm", "start:prod"]
