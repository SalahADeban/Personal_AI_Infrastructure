# IchimokuRadar Server
# Ichimoku signal intelligence on port 5181

FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY src/ ./src/
COPY public/ ./public/
COPY config/default.json ./data/config.json

# Production image
FROM oven/bun:1-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget tzdata

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data
COPY --from=builder /app/package.json ./

# Create data directories for persistence
RUN mkdir -p /app/data/ohlcv /app/data/history

# Environment
ENV TZ=America/Los_Angeles
ENV NODE_ENV=production

# Expose port
EXPOSE 5181

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5181/api/health || exit 1

# Run server
CMD ["bun", "run", "src/server.ts"]
