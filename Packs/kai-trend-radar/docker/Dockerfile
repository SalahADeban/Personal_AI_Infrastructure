FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files first for better caching
COPY kai-trend-radar/package.json kai-trend-radar/bun.lock* ./

# Install production dependencies
RUN bun install --production

# Copy QuantCore dependency (for quantitative analysis)
COPY QuantCore/ ./QuantCore/

# Copy source and public assets
COPY kai-trend-radar/src/ ./src/
COPY kai-trend-radar/public/ ./public/

# Data directory for persistence
ENV DATA_DIR=/data
RUN mkdir -p /data

EXPOSE 5180

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:5180/api/health || exit 1

CMD ["bun", "run", "src/server.ts"]
