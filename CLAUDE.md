# CLAUDE.md

SST v4 で AWS インフラを構築する学習用ハンズオン。全体の計画と章立ては `docs/plan.md` を参照する。

## コマンド

```sh
# 事前準備 (セッションが切れたとき)
aws sso login --sso-session handson

# インフラテスト (sst shell --stage dev -- vitest run のエイリアス)
pnpm test:infra                              # 全件
pnpm test:infra tests/infra/<章>.test.ts     # 章ごと

# 型チェック (Stop hook でも自動実行される)
pnpm typecheck

# デプロイ / 削除 (使う日だけ deploy し、終わったら remove する)
pnpm sst deploy --stage dev
pnpm sst remove --stage dev
```

- `sst shell` は state がないと失敗する。新しい環境では一度 `pnpm sst deploy --stage dev` してからテストを実行する。
- `pnpm typecheck` は `.sst/platform` の型定義 (SST の初回実行で生成される) を参照する。新しい環境では先に SST コマンドを一度実行する。

## 前提

- AWS は SSO プロファイル `handson-dev` (ap-northeast-1) に固定している (`sst.config.ts`)。ステージは `dev` のみ。
- テストが使う値は `.env` に置く (gitignore 済み)。必要な変数は `.env.example` を参照する。
  - `EXPECTED_AWS_ACCOUNT_ID`: 接続先として想定する AWS アカウント ID

## テストの方針

- `/tdd` で、インフラに対して Red → Green を回す。deploy 後の振る舞いを Vitest + AWS SDK v3 + fetch で検証する。
- テストは `tests/infra/` に置く。リソースの URL や名前は `sst shell` 経由で `Resource.*` から取得する。
- Pulumi のモックを使った定義のユニットテストは作らない。

## 注意

- SST v4 は内部の Pulumi AWS provider が v7。`transform` や `aws.*` を直接書くときは Pulumi AWS v7 の変更点を確認する。
- AWS アカウント ID などの環境固有の値は、コードやドキュメントに直接書かない。
