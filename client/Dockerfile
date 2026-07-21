# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# DevDrops client image.
#
# Two stages: build the static bundle with Node, then serve it with nginx.
# The final image ships no Node runtime, no source, no node_modules — just the
# compiled assets and a tiny web server, which keeps it small and removes an
# entire class of "works in dev, breaks in prod" surprises.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# Baked in at build time (Vite inlines VITE_ vars into the bundle) — set via
# `docker build --build-arg VITE_API_URL=https://api.example.com`.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ---------------------------------------------------------------------------

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
