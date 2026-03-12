# Stage 1: Build Vue client
FROM node:20-alpine AS client-build

WORKDIR /build/client
COPY src/observability/apps/client/package.json src/observability/apps/client/package-lock.json* ./
RUN npm install

COPY src/observability/apps/client/ ./
RUN npm run build

# Stage 2: Bun server with built client assets
FROM oven/bun:1-alpine

WORKDIR /app

# Copy server source and install deps
COPY src/observability/apps/server/package.json src/observability/apps/server/bun.lockb* ./
RUN bun install --production

COPY src/observability/apps/server/src/ ./src/

# Copy built Vue client into public/ for static serving
COPY --from=client-build /build/client/dist ./public/

ENV PAI_DIR=/data
ENV STATIC_DIR=/app/public

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["bun", "src/index.ts"]
