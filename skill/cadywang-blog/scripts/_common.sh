#!/usr/bin/env bash
# 共用工具（被同目录其它脚本 source）：定位博客仓库、检查依赖。

blog_repo() {
  if [ -n "${BLOG_REPO:-}" ] && [ -d "$BLOG_REPO/source/_posts" ]; then
    printf '%s\n' "$BLOG_REPO"; return 0
  fi
  local c
  for c in "$HOME/cadywang.github.io" "$HOME/code/cadywang.github.io" \
           "$HOME/repos/cadywang.github.io" "/d/OA/CODE/cadywang.github.io" \
           "D:/OA/CODE/cadywang.github.io" "$PWD"; do
    if [ -f "$c/_config.yml" ] && [ -d "$c/source/_posts" ]; then
      printf '%s\n' "$c"; return 0
    fi
  done
  echo "找不到博客仓库：请设置 BLOG_REPO=/path/to/cadywang.github.io" >&2
  return 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 && return 0
  echo "缺少命令：$1" >&2
  return 1
}

slug_ok() {
  printf '%s' "$1" | grep -Eq '^[a-z0-9][a-z0-9._-]*$'
}