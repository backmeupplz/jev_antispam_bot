# Production image (Easypanel builds this file). Every FROM must use the Bun
# version that CI pins (BUN_VERSION in .forgejo/workflows/ci.yml); CI fails
# when they differ.

# Deploy gate: typecheck and test these sources on the Bun that will run them.
# The runtime stage copies a marker from this stage so BuildKit cannot skip it.
FROM oven/bun:1.4.5-slim@sha256:b780593f3e10918cbdaec3d5a08d52224b9198069a65eb47812085c2ec007643 AS check
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN bun run check && touch /checked

FROM oven/bun:1.4.5-slim@sha256:b780593f3e10918cbdaec3d5a08d52224b9198069a65eb47812085c2ec007643
WORKDIR /app
COPY --from=check /checked /checked
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY migrations ./migrations
# Operator commands run inside this container, e.g. bun scripts/audit-report.ts check.
COPY scripts ./scripts
CMD ["bun", "run", "src/index.ts"]
