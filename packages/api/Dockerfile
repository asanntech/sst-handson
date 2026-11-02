# ビルドコンテキストはリポジトリのルート (pnpm-lock.yaml を使うため)
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/api/package.json packages/api/
RUN pnpm install --filter @sst-handson/api --prod --frozen-lockfile
COPY packages/api/src packages/api/src
WORKDIR /app/packages/api
EXPOSE 3000
CMD ["node", "src/index.ts"]
