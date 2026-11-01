#!/usr/bin/env bash
# Stop: 応答を終える前にプロジェクト全体の型チェックを実行する。
# 型エラーがあれば、終了コード 2 で応答の終了を止め、エラー内容を Claude に返して直させる。
# /tdd は Red の状態で応答を終えないので、ここで型エラーが出るのは直すべき状態だけになる。
#
# 次の場合は終了を止めず、警告 (systemMessage) だけを出す。止め続けて応答を終えられなくなるのを防ぐため。
# - stop_hook_active が true: すでにこの hook で 1 回止めて直させた後の終了。次の応答の終了時にまた確かめる
# - 型チェックの前提 (node_modules, .sst/platform) がない: コードを直しても解決しないため
set -uo pipefail

warn() {
  jq -n --arg m "$1" '{systemMessage: $m}'
  exit 0
}

input=$(cat)
cd "$CLAUDE_PROJECT_DIR" || exit 0

[ -d node_modules ] || warn "型チェックを省きました: node_modules がありません。pnpm install を実行してください。"
[ -d .sst/platform ] || warn "型チェックを省きました: .sst/platform がありません。SST のコマンド (例: pnpm sst deploy --stage dev) を一度実行してください。"

if ! out=$(pnpm typecheck 2>&1); then
  if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then
    warn "型チェックに失敗したままです (Stop hook で一度止めた後のため、終了は止めません)。pnpm typecheck で確認してください。"
  fi
  printf '型チェックに失敗しました。型エラーを直してから応答を終えてください。\n\n%s\n' "$out" >&2
  exit 2
fi
