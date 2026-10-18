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
# version skew protection: next.config.ts uses the Railway deployment id (or commit SHA) as deploymentId
ARG RAILWAY_DEPLOYMENT_ID
ARG RAILWAY_GIT_COMMIT_SHA
ENV RAILWAY_DEPLOYMENT_ID=$RAILWAY_DEPLOYMENT_ID
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
# stable Server Actions key (base64, 32 bytes), embedded by `next build`; optional (Next generates a
# per-build key when unset), but keeping it fixed keeps action references valid across deploys
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
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
# .next must be writable by `node`: Next writes its runtime cache there (revalidatePath, ISR,
# .next/server/route-cache); root-owned it fails with EACCES
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.js ./scripts/migrate.js
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && exec node server.js"]
