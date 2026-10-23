# 发布链路与排障（cadywang.github.io）

## 三道闸门

| 闸门 | 位置 | 拦什么 |
| --- | --- | --- |
| ① 分支保护 | GitHub → Settings → Rules（Ruleset `protect-main` + 经典分支保护） | 直推 `main`（`enforce_admins: true`，GH006 拒绝，管理员也不行）、强推、删分支 |
| ② 必需检查 | `.github/workflows/review-gate.yml` | `validate-posts`、`pr-checklist`、`build-check` 任一红就不能合并 |
| ③ 人工发布 | `.github/workflows/deploy.yml` | 没有人工触发（`workflow_dispatch` 或 `publish-*` 标签）就不会上线 |

## 日常命令

```bash
bash scripts/check.sh                    # npm run check:posts + hexo generate
cd "$BLOG_REPO" && npm run server        # 本地预览 http://localhost:4000

bash scripts/publish.sh my-slug          # 建分支 + 提交 + 推送，打印 PR 链接
gh pr checks --watch                     # 等四个必需检查全绿
gh pr merge --rebase                     # 合并（0 approvals，可以自己合；只允许 rebase）

bash scripts/publish.sh --tag            # 推 publish-<日期>-<slug> 标签 → 触发发布
```

发布完成后核对线上：

```bash
curl -sI "https://cadywang.github.io/$(date +%Y/%m/%d)/my-slug/" | head -1   # 期望 200
curl -s https://cadywang.github.io/ | grep -c my-slug                        # 首页应出现链接
```

## 常见失败

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `GH006 ... Changes must be made through a pull request` | 直推 `main`（分支保护，管理员也一样） | 开分支 → PR |
| `3 of 3 required status checks are expected` | 该提交不是在 PR 里跑的检查 | 走 PR，等检查全绿 |
| `front-matter 缺少必填字段：tags` | front-matter 不全 | 补 `title` / `date` / `tags` |
| `文件名不规范` | 文件名不是全小写 slug | 重命名为 `my-post.md` |
| `引用的本地资源不存在` | 图片没提交或路径写错 | 图片放进 `source/` 并修正相对路径 |
| PR 落后 main 无法合并 | 必需检查是 `strict` | `git rebase origin/main` 重推，或网页点 Update branch |
| `pr-checklist` 红 | PR 描述里「发布审查清单」没勾全 | 逐条勾选（模板 `.github/pull_request_template.md`） |
| 发布运行被 Cancel | 人工取消了运行 | 线上不变，重新触发即可 |
| 发布成功但页面还是旧的 | Pages 缓存 | 等 1~2 分钟；或确认 `deploy` 真的成功 |

## 发布时能看到什么

手动触发后，`verify` 任务会往这次运行的 **Summary** 写一份「本次发布内容」：
目标提交、审核备注、以及与上次发布（最新的 `publish-*` 标签）相比包含哪些提交、
哪些文章（列标题）、还有多少其他文件改动。确认无误再让它跑完；有问题直接 Cancel，线上不会变。