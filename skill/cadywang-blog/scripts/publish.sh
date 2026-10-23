#!/usr/bin/env bash
# 提 PR / 触发发布
#
#   bash publish.sh <slug> ["提交信息"]   同步 main → 建分支 → 提交 → 推送，打印 PR 链接
#   bash publish.sh --tag ["标签名"]      推一个 publish-* 标签 —— 这会真的触发线上发布
#   bash publish.sh --dry-run ...         只打印将执行的命令，不真的执行
#
# 注意：main 有分支保护（enforce_admins: true），不能直推；必须走 PR，
# 且合并前四个必需检查要全绿（只允许 rebase 合并）。触发发布前请先得到用户确认。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/_common.sh"

REPO="$(blog_repo)"
need_cmd git

dry=0
args=()
for a in "$@"; do
  if [ "$a" = "--dry-run" ]; then dry=1; else args+=("$a"); fi
done
set -- ${args[@]+"${args[@]}"}

run() {
  if [ "$dry" = 1 ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

if [ "${1:-}" = "--tag" ]; then
  name="${2:-publish-$(date +%Y-%m-%d)}"
  echo "== 触发线上发布：推送标签 $name =="
  echo "   这会跑 Publish Blog（全量校验 + 构建 + 部署到 GitHub Pages）"
  if git -C "$REPO" rev-parse -q --verify "refs/tags/$name" >/dev/null; then
    run git -C "$REPO" tag -d "$name"
  fi
  run git -C "$REPO" tag "$name"
  run git -C "$REPO" push origin "$name"
  echo
  echo "已触发。进度：https://github.com/cadywang/cadywang.github.io/actions/workflows/deploy.yml"
  echo "发布完成后核对线上：curl -sI https://cadywang.github.io/ | head -1"
  exit 0
fi

slug="${1:?用法: publish.sh <slug> [提交信息] | publish.sh --tag [标签名]}"
branch="post/$slug"
msg="${2:-post: add $slug}"

if [ ! -f "$REPO/source/_posts/$slug.md" ]; then
  echo "找不到文章：$REPO/source/_posts/$slug.md" >&2
  exit 1
fi

echo "== 1) 同步 main =="
run git -C "$REPO" fetch origin --prune
run git -C "$REPO" switch main
run git -C "$REPO" merge --ff-only origin/main

echo
echo "== 2) 建分支 $branch =="
if git -C "$REPO" rev-parse -q --verify "refs/heads/$branch" >/dev/null; then
  run git -C "$REPO" switch "$branch"
else
  run git -C "$REPO" switch -c "$branch"
fi

echo
echo "== 3) 提交 =="
run git -C "$REPO" add "source/_posts/$slug.md"
if [ -d "$REPO/source/_posts/$slug" ]; then
  run git -C "$REPO" add "source/_posts/$slug"
fi
run git -C "$REPO" commit -s -m "$msg"

echo
echo "== 4) 推送 =="
run git -C "$REPO" push -u origin "$branch"

echo
echo "打开 PR（记得把描述里的「发布审查清单」逐条勾选，并把本地校验输出贴上去）："
echo "  https://github.com/cadywang/cadywang.github.io/pull/new/$branch"
echo
echo "等检查： gh pr checks --watch     合并： gh pr merge --rebase"
echo "合并之后触发发布： bash \"$DIR/publish.sh\" --tag"
echo
echo "提交信息必须符合仓库规范（ASCII、'<subsystem>: <祈使句摘要>'）；"
echo "带图片的文章记得把图片也提交（通常是 source/img/... 或 source/_posts/$slug/）。"