# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# getAppUrl() throws at build time (NODE_ENV=production) without APP_URL.
# Railway passes service variables as build args, so setting APP_URL on the service is enough.
ARG APP_URL
ENV APP_URL=$APP_URL
# the db client reads DATABASE_URL at import time during page-data collection; postgres.js connects
# lazily, so a placeholder is enough (build stage only, never reaches the runtime image)
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
# self-contained migration runner: the runtime image has no dev dependencies
RUN pnpm exec esbuild scripts/migrate.ts --bundle --platform=node --format=cjs --outfile=scripts/migrate.js

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.js ./scripts/migrate.js
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]
