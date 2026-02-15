FROM oven/bun:1-alpine
WORKDIR /app
RUN apk add --no-cache wget
COPY package.json ./
RUN bun install
COPY src/ ./src/
ENV NODE_ENV=production
EXPOSE 5182
HEALTHCHECK --interval=60s --timeout=10s CMD wget -qO- http://localhost:5182/api/health || exit 1
CMD ["bun", "run", "src/server.ts"]
