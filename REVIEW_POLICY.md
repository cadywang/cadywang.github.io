# 发布规则（REVIEW_POLICY）

> 一句话：**改动必须开 PR、CI 全绿才能进 `main`（谁都不能直推，包括你自己）；
> 进了 `main` 也不等于上线——还要你本人手动触发一次发布。**
> 没有人能绕过这两道闸门。

---

## 一、三道闸门

| 闸门 | 位置 | 拦什么 | 能不能绕过 |
| --- | --- | --- | --- |
| ① 分支保护 | GitHub → Settings → Rules（Ruleset `protect-main` + 经典分支保护） | 直推 `main`、强推、删分支、CI 没绿就合并 | **不能**：经典保护开着 `enforce_admins: true`，Ruleset 的 Bypass list 留空——管理员也一样 |
| ② 自动校验 | [.github/workflows/review-gate.yml](.github/workflows/review-gate.yml) | 文章格式、PR 清单、能否构建 | **不能**：改校验脚本自己也要走同一个 PR 流程 |
| ③ 人工发布闸门 | [.github/workflows/deploy.yml](.github/workflows/deploy.yml) | 未经人工触发的合并结果上线 | **不能**：只有 `workflow_dispatch` 或 `publish-*` 标签才会部署 |

串起来就是：**开 PR → CI 全绿 → 合并 → 你手动点一次发布 → 才上线。**

## 二、必需状态检查（PR 必须全绿才能合并）

| 检查 | 来自 | 查什么 |
| --- | --- | --- |
| `validate-posts` | review-gate.yml | front-matter 必填项、文件名 slug、正文引用的本地图片是否存在 |
| `pr-checklist` | review-gate.yml | PR 描述里的「发布审查清单」是否逐条勾选 |
| `build-check` | review-gate.yml | `npm ci` + `hexo generate` 能否成功 |

配置是 `strict: true`：PR 还必须追上最新 `main` 才能合并。

## 三、日常发布四步

```bash
# 1) 开分支写文章（main 已禁止直推）
git switch -c post/my-new-article
vim source/_posts/my-new-article.md
npm run check:posts && npm run build      # 本地自查（可选，但推荐）
git add -A && git commit -m "post: add my new article"
git push -u origin post/my-new-article    # 推送后终端会打印开 PR 的链接

# 2) 开 PR → 等三个必需检查全绿 → 自己把 diff 看一遍
gh pr checks --watch
npm run server                            # 也可以本地预览 http://localhost:4000

# 3) 合并 PR（这一步之后仍然没有上线）
gh pr merge --squash

# 4) 审核通过 → 手动触发发布（这一步才真正上线）
gh workflow run deploy.yml
# 或者：git tag publish-2026-10-15 && git push origin publish-2026-10-15
```

网页操作版见 [README.md](README.md) 第一节的逐步说明（第一步就要选
`Create a new branch for this commit and start a pull request`）。

## 四、为什么是「0 个批准」而不是 1 个

GitHub **不允许作者批准自己的 PR**。本站只有你一个账号，所以：

* `required_approving_review_count = 0`：PR 必须开、CI 必须绿，但**不要求别人批准**——
  这样你自己的 PR 也能合并，不会把自己锁死；
* 「审查」落在两处：**CI 的三个必需检查** + **你合并前自己看一遍 diff**；
* 如果以后加了协作者，把批准数提到 1（并打开 `require_code_owner_reviews`）即可，
  [.github/CODEOWNERS](.github/CODEOWNERS) 已经写好。

## 五、发布前会给你一份「发布清单」

手动触发后，`verify` 任务会在这次运行的 **Summary** 页写出「本次发布内容」：

- 目标提交的 SHA、提交说明、作者、时间；
- 你填的审核备注、触发方式与触发人；
- 与**上一次发布**（`publish-*` 标签）相比：包含哪些提交、哪些文章（列出**文章标题**）、还有多少其他文件改动；
- 没有 `publish-*` 标签时，按「首次发布」列出全部文章。

确认清单没问题就让它跑完；发现问题直接 **Cancel workflow**，线上不会有任何变化。

## 六、什么时候会被拒绝

| 情况 | 结果 |
| --- | --- |
| 直接 `git push` 到 `main` | **被分支保护拒绝**（`enforce_admins: true`，没人是例外） |
| PR 里 `validate-posts` / `pr-checklist` / `build-check` 任一红 | 不能合并 |
| PR 落后于最新 `main` | 不能合并（`strict`），先 rebase / update branch |
| 要发布的提交不在 `main` 上（手动指定了别的 ref） | `verify` 失败，拒绝发布 |
| 任何一篇文章校验不通过 | 发布前的全量校验失败，拒绝发布 |
| 站点构建失败 | `build` 失败，不发布 |

## 七、本地自查

```bash
npm run check:posts                             # 校验全部文章（等价于发布前的全量校验）
node tools/check-posts.mjs --base=origin/main   # 只校验本次改动
node tools/publish-summary.mjs HEAD             # 本地预演「发布清单」
npm run server                                  # 本地预览 http://localhost:4000
```

## 八、可选加固（想更严时再加）

1. **环境审批**：Settings → Environments → `github-pages` → 勾选 Required reviewers（填你自己）。
   这样发布任务会停在「Waiting for approval」，要再点一次 **Approve** 才执行。
   注意：GitHub 的环境审批**允许触发者本人自批**（官方没禁止），所以它适合做「发布前再确认一次」，
   不适合用来防越权。
2. **要求他人批准**：加协作者后把 `required_approving_review_count` 调到 1，并打开 Code Owner 审查。
3. **只允许特定人发布**：仓库只给可信的人写权限；或改成只认 `publish-*` 标签触发。

## 九、改动规则时的注意事项

- 分支保护的实际配置在 GitHub 的 Ruleset 与经典分支保护里（**不在本仓库文件里**），
  改完请同步更新本文档第一节的表格。
- 工作流里的 **job 名称**（`validate-posts`、`pr-checklist`、`build-check`）就是必需检查的名字，
  改名会让规则失配，必须同步更新本文档与 GitHub 的必需检查配置。
- 发布入口是 **`publish-*` 标签前缀**（`deploy.yml` 的 `on.push.tags`）与手动 `workflow_dispatch`，
  改这两处等于改发布入口，务必同步更新本文档和 README。
- 「发布清单」与上次发布的比较基准是**最新的 `publish-*` 标签**；用 `workflow_dispatch` 发布时
  建议成功后打个标签留档，例如：`git tag publish-2026-10-15 && git push origin publish-2026-10-15`。