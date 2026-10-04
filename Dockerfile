# syntax=docker/dockerfile:1
# Debian (glibc) base: the C2PA SDK used by the AI Content Detector ships a glibc native binary.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system preader && useradd --system --gid preader --no-create-home preader
COPY --from=build --chown=preader:preader /app/.next/standalone ./
COPY --from=build --chown=preader:preader /app/.next/static ./.next/static
COPY --from=build --chown=preader:preader /app/db ./db
COPY --from=build --chown=preader:preader /app/scripts ./scripts
USER preader
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
