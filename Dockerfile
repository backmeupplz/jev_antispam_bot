# Production image (Easypanel builds this file). Every FROM must use the Bun
# version that CI pins (BUN_VERSION in .github/workflows/ci.yml); CI fails
# when they differ.

# Deploy gate: typecheck and test these sources on the Bun that will run them.
# The runtime stage copies a marker from this stage so BuildKit cannot skip it.
FROM oven/bun:1.4.0-slim AS check
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN bun run check && touch /checked

FROM oven/bun:1.4.0-slim
WORKDIR /app
COPY --from=check /checked /checked
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY migrations ./migrations
CMD ["bun", "run", "src/index.ts"]
