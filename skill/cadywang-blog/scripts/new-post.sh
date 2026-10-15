#!/usr/bin/env bash
# 渲染 assets/post-template.md 生成一篇新文章的骨架：source/_posts/<slug>.md
#
# 用法: bash new-post.sh <slug> ["标题"] ["标签1,标签2"] ["分类"]
# 例:   bash new-post.sh serial-debug-bridge-guide "串口调试桥：从架构到上手" "串口,嵌入式" "教程"
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/_common.sh"

REPO="$(blog_repo)"
slug="${1:?用法: new-post.sh <slug> [标题] [标签] [分类]}"
slug_ok "$slug" || { echo "slug 只能用小写字母/数字/._-，且不能以符号开头：$slug" >&2; exit 1; }

title="${2:-$slug}"
tags="${3:-技术}"
cate="${4:-教程}"
file="$REPO/source/_posts/$slug.md"
tmpl_file="$DIR/../assets/post-template.md"

[ -f "$tmpl_file" ] || { echo "找不到模板：$tmpl_file" >&2; exit 1; }
[ -e "$file" ] && { echo "已存在：$file" >&2; exit 1; }

tags_yaml="$(printf '%s' "$tags" | sed 's/, */, /g')"
now="$(date '+%Y-%m-%d %H:%M:%S')"

tmpl="$(cat "$tmpl_file")"
tmpl="${tmpl//'{{TITLE}}'/$title}"
tmpl="${tmpl//'{{DATE}}'/$now}"
tmpl="${tmpl//'{{TAGS}}'/$tags_yaml}"
tmpl="${tmpl//'{{CATEGORIES}}'/$cate}"

printf '%s\n' "$tmpl" > "$file"

echo "已创建：$file"
echo "下一步：填内容 → bash \"$DIR/check.sh\" → bash \"$DIR/publish.sh\" $slug"