# Production image (Easypanel builds this file). Every FROM must use the Bun
# version that CI pins (BUN_VERSION in .forgejo/workflows/ci.yml); CI fails
# when they differ.

# Deploy gate: typecheck and test these sources on the Bun that will run them.
# The runtime stage copies a marker from this stage so BuildKit cannot skip it.
FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS check
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN bun run check && touch /checked

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
WORKDIR /app
COPY --from=check /checked /checked
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY migrations ./migrations
# Operator commands run inside this container, e.g. bun scripts/audit-report.ts check.
COPY scripts ./scripts
CMD ["bun", "run", "src/index.ts"]
