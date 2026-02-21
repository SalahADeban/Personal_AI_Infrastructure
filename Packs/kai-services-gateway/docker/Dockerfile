# PAI Services Gateway
# Optimized for Ubuntu/CasaOS deployment

FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY src/ ./src/
COPY config/ ./config/
COPY public/ ./public/

# Production image
FROM oven/bun:1-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget tzdata

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/config ./config
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./

# Create data directories
RUN mkdir -p /data/briefs /data/history/captures /data/history/raw-outputs

# Environment
ENV PAI_DIR=/data
ENV TZ=America/Los_Angeles
ENV NODE_ENV=production

# Expose port
EXPOSE 4001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4001/api/health || exit 1

# Run server
CMD ["bun", "run", "src/index.ts"]
