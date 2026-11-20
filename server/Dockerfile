# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci --workspace server --include-workspace-root

COPY server ./server

RUN npm --workspace server run build \
 && npm prune --omit=dev --workspace server --include-workspace-root

FROM node:22-alpine AS runtime

WORKDIR /app

# escape starting from uid 0 is a different problem entirely.
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/node_modules ./server/node_modules
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/server/package.json ./server/
COPY --from=build --chown=node:node /app/package.json ./

RUN mkdir -p /app/server/var/mail && chown -R node:node /app/server/var

USER node
WORKDIR /app/server

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
