# syntax=docker/dockerfile:1
# Multi-stage: node:22-slim (glibc — argon2's native addon needs it).
FROM node:22-slim AS build
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
# Lockfile-first install for layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --filter api... --filter @lms/shared
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @lms/shared build && pnpm --filter api build
# Prune to production deps in a self-contained dir. --legacy: pnpm 10 refuses
# a non-injected workspace deploy by default; @lms/shared is copied in as a
# real dep, which is exactly what we want for the runtime image.
RUN pnpm --filter api deploy --prod --legacy /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
EXPOSE 4000
# The worker is this same image, overridden to: node dist/worker.main.js
CMD ["node", "dist/main.js"]
