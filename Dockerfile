# Base image with Node.js
FROM node:slim AS base
WORKDIR /app
RUN corepack enable

# Builder stage - install dependencies and build
FROM base AS builder
WORKDIR /app

# Copy workspace configuration files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy only the packages needed for socket server
COPY packages/game-core/package.json packages/game-core/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY apps/socket/package.json apps/socket/package.json

# Fetch dependencies
RUN pnpm fetch

# Copy source code
COPY packages/game-core packages/game-core
COPY packages/schema packages/schema
COPY apps/socket apps/socket

# Install all dependencies
RUN pnpm install -r --offline --frozen-lockfile

# Runner stage - production
FROM base AS runner
WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy package.json files for production install
COPY packages/game-core/package.json packages/game-core/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY apps/socket/package.json apps/socket/package.json

# Fetch production dependencies
RUN pnpm fetch --prod

# Install production dependencies for each package
RUN pnpm install --filter "./packages/game-core..." --prod --offline --frozen-lockfile
RUN pnpm install --filter "./packages/schema..." --prod --offline --frozen-lockfile
RUN pnpm install --filter "./apps/socket..." --prod --offline --frozen-lockfile

# Copy built source code from builder
COPY --from=builder /app/packages/game-core packages/game-core
COPY --from=builder /app/packages/schema packages/schema
COPY --from=builder /app/apps/socket apps/socket

# Expose port
EXPOSE 4000

# Start the socket server
CMD ["pnpm", "--filter", "socket", "start"]