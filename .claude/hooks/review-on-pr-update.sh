#!/usr/bin/env bash
# PostToolUse（Bash）: PR を作ったとき、または PR のあるブランチに push したときに、/my-code-review <PR番号> を実行するよう Claude に指示する。
# hook からスキルは直接起動できないため、additionalContext で Claude に実行を促す。
# ドラフトかどうかは状況によるため問わない。

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

if printf '%s' "$cmd" | grep -Eq 'gh[[:space:]]+pr[[:space:]]+create'; then
  # gh pr create は成功すると作成した PR の URL を標準出力に出す。URL がなければ PR は作られていないので何もしない
  output=$(printf '%s' "$input" | jq -r '.tool_response.stdout // empty')
  number=$(printf '%s' "$output" | grep -Eo '/pull/[0-9]+' | tail -1 | grep -Eo '[0-9]+')
  event="作成しました"
elif printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push'; then
  cd "$CLAUDE_PROJECT_DIR" || exit 0
  head=$(git rev-parse HEAD 2>/dev/null) || exit 0
  # push に失敗した場合は、リモートの追跡ブランチが HEAD と一致しない
  [ "$(git rev-parse '@{u}' 2>/dev/null)" = "$head" ] || exit 0
  number=$(gh pr view --json number,state -q 'select(.state == "OPEN") | .number' 2>/dev/null)
  [ -n "$number" ] || exit 0
  # この HEAD をすでにレビューしていれば、重ねて促さない
  reviewed=$(gh api "repos/{owner}/{repo}/pulls/$number/reviews" --jq "[.[] | select(.commit_id == \"$head\")] | length" 2>/dev/null)
  [ "${reviewed:-0}" -eq 0 ] || exit 0
  event="更新しました（HEAD ${head:0:7}）"
else
  exit 0
fi
[ -n "$number" ] || exit 0

jq -n --arg n "$number" --arg e "$event" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("PR #" + $n + " を" + $e + "。/my-code-review " + $n + " を実行し、レビュー結果を PR にコメントしてください（同じ HEAD のレビューをすでに実行する予定なら、重ねて実行しない）。指摘はユーザーに報告し、最後に /address-review " + $n + " で指摘に対応できることを案内してください。")
  }
}'