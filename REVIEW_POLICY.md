# 发布规则（REVIEW_POLICY）

> 一句话：**源码提交 ≠ 上线。** 文章源码先提交到 `main`（自动校验但**不发布**），
> 由你本人审核通过后，在 Actions 里手动触发一次发布，CI 才会编译并上线。
> 没有你这一下人工触发，任何提交都不会发到线上。

---

## 一、两条流水线

| 流水线 | 触发方式 | 做什么 | 会不会上线 |
| --- | --- | --- | --- |
| **Review Gate**<br>[.github/workflows/review-gate.yml](.github/workflows/review-gate.yml) | 提交/推送到 `main`、开 PR | `validate-posts`（文章格式校验）<br>`pr-checklist`（走 PR 时的清单校验）<br>`build-check`（npm ci + hexo generate 试构建） | **不会** |
| **Publish Blog**<br>[.github/workflows/deploy.yml](.github/workflows/deploy.yml) | **你手动触发**：Actions → Publish Blog → Run workflow<br>或推一个 `publish-*` 标签 | `verify`（确认目标提交已在 main 上）<br>全量校验 `check-posts --all`<br>构建 → `deploy-pages` 发布 | **会** |

## 二、日常发布三步

```bash
# 1) 写文章并提交（网页提交、或本地提交后 push 到 main 都可以）
vim source/_posts/my-new-article.md
npm run check:posts      # 可选：本地先自查
git add source/_posts/my-new-article.md
git commit -m "post: add my new article"
git push origin main

# 2) 等 Review Gate 变绿，然后自己审核：看 diff、或本地预览
npm run server           # http://localhost:4000

# 3) 审核通过 → 手动触发发布（这就是「我审核通过了」这个动作）
gh workflow run deploy.yml                 # 或者去 Actions 页面点 Run workflow
                                           # 也可以：git tag publish-2026-10-15 && git push origin publish-2026-10-15
```

网页操作版：仓库 **Actions** → 左侧 **Publish Blog** → 右侧 **Run workflow** → 分支选 `main` →
（可选）填一句审核备注 → 点绿色 **Run workflow**。

## 三、发布前会给你一份「发布清单」

手动触发后，`verify` 任务会在这次运行的 **Summary** 页写出「本次发布内容」：

- 目标提交的 SHA、提交说明、作者、时间；
- 你填的审核备注、触发方式与触发人；
- 与**上一次发布**（`publish-*` 标签）相比：包含哪些提交、哪些文章（列出**文章标题**）、还有多少其他文件改动；
- 没有 `publish-*` 标签时，按「首次发布」列出全部文章。

确认清单没问题就让它跑完；发现问题直接 **Cancel workflow**，线上不会有任何变化。

## 四、什么时候会被拒绝发布

| 情况 | 结果 |
| --- | --- |
| 要发布的提交不在 `main` 上（例如从别的分支手动指定了 ref） | `verify` 失败，拒绝发布 |
| 任何一篇文章校验不通过（缺 front-matter、文件名不规范、引用的图片不存在…） | 全量校验失败，拒绝发布 |
| 站点构建失败（`npm ci` / `hexo generate` 报错） | `build` 失败，不发布 |

也就是说：**发布这一步永远发生在「校验 + 构建」都通过之后**，坏内容上不了线。

## 五、自动校验查什么

`validate-posts`（[tools/check-posts.mjs](tools/check-posts.mjs)）：

- front-matter 必须存在，`title` / `date` / `tags` 必填且格式正确；
- 文件名必须是全小写 slug（`my-post.md` 或 `2026-10-15-my-post.md`）；
- 正文里 `![](...)` / `<img src>` 引用的**本地图片必须真实存在**；
- 告警项：`draft: true`、`published: false`、未来日期、正文里的 TODO/占位字样。

`pr-checklist`（[tools/check-pr.mjs](tools/check-pr.mjs)，只有走 PR 时才跑）：

- PR 描述里 [.github/pull_request_template.md](.github/pull_request_template.md) 的「发布审查清单」必须逐条勾选。

## 六、可选加固（想要更严时再加）

现在这套是**单人模式**：靠「发布必须人工触发」来卡住上线。想更严可以叠加：

1. **分支保护 / 规则集**：Settings → Rules → Rulesets → 限制 `main`（禁止强推与删除、Bypass list 留空），
   这样连往 `main` 直接推都受限；如果同时要求 PR + 状态检查，就变成「必须走 PR」。
2. **环境审批**：Settings → Environments → `github-pages` → 勾选 Required reviewers（填你自己）。
   这样发布任务会停在「Waiting for approval」，要再点一次 **Approve** 才执行。
   注意：GitHub 的环境审批**允许触发者本人自批**（官方没有禁止自批），所以它适合做「发布前再确认一次」，
   不适合用来防越权。
3. **想做到「必须别人审」**：需要第二个协作者账号，然后在规则集里要求
   `Required approvals = 1` + `Require review from Code Owners`（[.github/CODEOWNERS](.github/CODEOWNERS) 已写好）。
   GitHub 不允许自己批准自己的 PR，单人账号用不了这条。
4. **只允许特定人发布**：仓库只给可信的人写权限；或改成只认 `publish-*` 标签触发，并给标签加保护规则。

## 七、本地自查

```bash
npm run check:posts                       # 校验全部文章（等价于发布前的全量校验）
node tools/check-posts.mjs --base=origin/main   # 只校验本次改动
node tools/publish-summary.mjs HEAD       # 本地预演「发布清单」
```

## 八、改动规则时的注意事项

- 工作流里的 **job 名称**（`validate-posts`、`pr-checklist`、`build-check`）如果要写进规则集的必需检查，
  改名必须同步更新本文档与仓库 Ruleset 配置。
- 发布触发靠 **`publish-*` 标签前缀**（`deploy.yml` 的 `on.push.tags`）与手动 `workflow_dispatch`，
  改这两处等于改发布入口，务必同步更新本文档和 README。
- 「发布清单」里与上次发布的比较基准是**最新的 `publish-*` 标签**；如果用 `workflow_dispatch` 发布，
  建议发布成功后打个标签留档，例如：`git tag publish-2026-10-15 && git push origin publish-2026-10-15`。