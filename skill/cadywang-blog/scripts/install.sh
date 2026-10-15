#!/usr/bin/env bash
# 把本 skill 同步到 Codex 的 skills 目录（幂等，可重复执行）
#
#   bash install.sh
#
# 本 skill 随博客仓库分发（仓库里的 skill/cadywang-blog/）。在仓库副本里执行，
# 就是把它装到 $CODEX_HOME/skills/cadywang-blog；在已安装副本里执行则原地刷新。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_ROOT="${CODEX_HOME:-$HOME/.codex}/skills"
target="$SKILLS_ROOT/$(basename "$DIR")"

case "$target" in
  */skills/*) : ;;
  *) echo "拒绝执行：目标路径看起来不像 skills 目录（$target）" >&2; exit 1 ;;
esac

if [ "$(cd "$target" 2>/dev/null && pwd || true)" = "$DIR" ]; then
  echo "已经在目标位置，无需同步：$DIR"
  exit 0
fi

mkdir -p "$SKILLS_ROOT"
rm -rf "$target"
cp -R "$DIR" "$target"
echo "已安装：$target"
echo "（仓库副本更新后重跑本脚本即可同步）"