FROM oven/bun:1.4.0-alpine

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY migrations ./migrations
CMD ["bun", "run", "src/index.ts"]
