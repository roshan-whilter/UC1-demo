# Only the server is deployed — client/ is a local dev tool and is not built here.
FROM node:20-alpine

WORKDIR /app

# Manifests first, so the dependency layer is cached until they actually change.
# client/package.json is copied because the root lockfile describes it as a
# workspace; its dependencies are never installed.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN npm ci --omit=dev --workspace server --include-workspace-root

COPY server ./server

ENV NODE_ENV=production
EXPOSE 4000

# Seeding is an idempotent upsert (it does not touch tickets), so running it on
# every boot is safe and removes the "API is up but every lookup 404s" trap.
CMD ["sh", "-c", "npm run seed && npm start"]
