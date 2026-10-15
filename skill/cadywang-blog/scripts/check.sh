#!/usr/bin/env bash
# 本地校验：口径与 CI 的三个必需检查一致
#   npm run check:posts  → validate-posts
#   hexo generate        → build-check
# 用法: bash check.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/_common.sh"

REPO="$(blog_repo)"
need_cmd node
cd "$REPO"
echo "== 仓库：$PWD"

echo
echo "== 1/2 文章校验（npm run check:posts）=="
npm run check:posts

echo
echo "== 2/2 站点构建（hexo clean + hexo generate）=="
npx hexo clean >/dev/null
npx hexo generate

echo
echo "全部通过。本地预览：cd \"$REPO\" && npm run server    # http://localhost:4000"