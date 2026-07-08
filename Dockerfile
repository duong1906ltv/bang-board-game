# syntax=docker/dockerfile:1.7
# Bang — Next.js custom server (Socket.IO) chạy bằng tsx.

# ---- builder: install deps + next build ----
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runner: production image ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN groupadd -r app && useradd -r -g app app

# Custom server (server.ts) is executed by tsx and reads .next at runtime,
# so we ship node_modules + the build output + the source it imports.
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/.next ./.next
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/app ./app
COPY --from=builder --chown=app:app /app/lib ./lib
COPY --from=builder --chown=app:app /app/server.ts ./server.ts
COPY --from=builder --chown=app:app /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=app:app /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app
EXPOSE 3000
CMD ["npm", "start"]
