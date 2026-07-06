# syntax=docker/dockerfile:1
# Next.js standalone output (next.config output: 'standalone').
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --filter web... --filter @lms/shared
COPY packages/shared packages/shared
COPY apps/web apps/web
# prebuild copies self-hosted Monaco into public/monaco (no CDN — P5 gate fix).
RUN pnpm --filter @lms/shared build && pnpm --filter web build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Standalone bundles a minimal node_modules; static + public ride alongside it.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
