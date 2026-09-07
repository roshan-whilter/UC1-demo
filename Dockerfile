# Stage 1 — build the React console into static files.
FROM node:20-alpine AS client-build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

# Vite and friends are devDependencies, so this stage installs them; none of it
# reaches the runtime image below.
RUN npm ci --workspace client --include-workspace-root

COPY client ./client
RUN npm run build --workspace client


# Stage 2 — runtime: the API server, which also serves the console it was handed.
FROM node:20-alpine

WORKDIR /app

# Manifests first, so the dependency layer is cached until they actually change.
# client/package.json is copied because the root lockfile describes it as a
# workspace; its dependencies are never installed here.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN npm ci --omit=dev --workspace server --include-workspace-root

COPY server ./server

# app.js serves this directory if it exists — same origin as the API, so the
# console needs no proxy and no CORS.
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production
EXPOSE 4000

# Seeding is an idempotent upsert (it does not touch tickets), so running it on
# every boot is safe and removes the "API is up but every lookup 404s" trap.
CMD ["sh", "-c", "npm run seed && npm start"]
