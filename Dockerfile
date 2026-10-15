FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.1.3

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/game-core/package.json packages/game-core/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY apps/socket/package.json apps/socket/package.json
RUN pnpm install --filter socket... --prod --frozen-lockfile

COPY packages/game-core packages/game-core
COPY packages/schema packages/schema
COPY apps/socket/src apps/socket/src
COPY apps/socket/index.ts apps/socket/tsconfig.json apps/socket/

ENV NODE_ENV=production
WORKDIR /app/apps/socket
EXPOSE 4000
CMD ["node", "--import", "tsx", "index.ts"]
