# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# DevDrops API image.
#
# Single stage is enough here: there is no build step (plain CommonJS, no
# bundler) — `npm ci --omit=dev` is the only thing that needs to happen before
# the image is runnable. A multi-stage build would only add complexity for a
# TypeScript/webpack step this project does not have.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base

# tini reaps zombie processes and forwards signals correctly, which matters for
# a clean `docker stop` and for the SIGTERM handler in src/server.js to fire.
RUN apk add --no-cache tini

WORKDIR /app

# Dependencies first, so this layer stays cached across code-only changes.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

# Run as a non-root user — the image ships with one out of the box.
USER node

ENV NODE_ENV=production
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 5000) + '/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
