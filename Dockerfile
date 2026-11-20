# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci

COPY server ./server
COPY web ./web
COPY docs ./docs
COPY scripts/schema-referenz.mjs scripts/schema-referenz.d.mts ./scripts/

ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_RELEASE=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE
ENV VITE_API_URL=/graphql

RUN npm --workspace server run build \
 && npm --workspace web run build \
 && npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV WEB_ROOT=/app/web-dist

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/node_modules ./server/node_modules
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/server/package.json ./server/
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/web/dist ./web-dist

RUN mkdir -p /app/server/var/mail && chown -R node:node /app/server/var

USER node
WORKDIR /app/server

EXPOSE 10000

HEALTHCHECK --interval=20s --timeout=5s --start-period=120s --retries=5 \
  CMD node -e "const p=process.env.PORT||4000;require('http').get('http://127.0.0.1:'+p+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["sh", "-c", "node dist/database/migrate.js && node dist/main.js"]
