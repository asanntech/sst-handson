# ビルドコンテキストはリポジトリのルート (pnpm-lock.yaml を使うため)
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/api/package.json packages/api/
COPY packages/core/package.json packages/core/
# "api..." で api が依存する workspace パッケージ (core) の依存もインストールする。
# --no-optional で、sst パッケージが optionalDependencies に持つ CLI のバイナリを入れない
RUN pnpm install --filter "@sst-handson/api..." --prod --frozen-lockfile --no-optional
COPY packages/core/src packages/core/src
COPY packages/api/src packages/api/src
WORKDIR /app/packages/api
EXPOSE 3000
USER node
CMD ["node", "src/index.ts"]
