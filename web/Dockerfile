# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci --workspace web --include-workspace-root

COPY web ./web
COPY docs ./docs
COPY scripts/schema-referenz.mjs scripts/schema-referenz.d.mts ./scripts/

ENV VITE_API_URL=/graphql

ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_RELEASE=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE

ARG VITE_PUBLIC_ORIGIN=""
ENV VITE_PUBLIC_ORIGIN=$VITE_PUBLIC_ORIGIN

ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION

RUN npm --workspace web run build

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime

COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/security-headers.conf /etc/nginx/conf.d/security-headers.conf
COPY web/security-headers-einbettbar.conf /etc/nginx/security-headers-einbettbar.conf

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
