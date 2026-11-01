#!/usr/bin/env bash
# Stop: 応答を終える前にプロジェクト全体の型チェックを実行する。
# 型エラーがあれば、終了コード 2 で応答の終了を止め、エラー内容を Claude に返して直させる。
# /tdd は Red の状態で応答を終えないので、ここで型エラーが出るのは直すべき状態だけになる。
set -uo pipefail

cd "$CLAUDE_PROJECT_DIR" || exit 0

if ! out=$(pnpm typecheck 2>&1); then
  printf '型チェックに失敗しました。型エラーを直してから応答を終えてください。\n\n%s\n' "$out" >&2
  exit 2
fi