---
name: cadywang-blog
description: 把一次工作、排查或实验整理成中文技术博客文章，本地校验后走 PR 合并并触发发布到 cadywang.github.io。用于「把这件事写成博客 / 输出成 blog / 发到我的博客」这类请求；不用于改主题、站点配置或校验规则。
metadata:
  short-description: 把工作整理成博客并发布
---

# cadywang 的博客：写作与发布

产出物是一篇**能通过校验、能上线**的文章，而不是一段草稿：
文件落在博客仓库的 `source/_posts/<slug>.md`，然后走 PR → 合并 → 人工触发发布。

## 目标仓库

- 远端：`https://github.com/cadywang/cadywang.github.io`（Hexo + Butterfly + GitHub Pages）
- 本地：`$BLOG_REPO`，默认按 `$HOME/cadywang.github.io` 等常见路径探测（Windows 常见 `D:/OA/CODE/cadywang.github.io`）
- 文章目录：`source/_posts/`；站点配置：`_config.yml`、`_config.butterfly.yml`

## 三条硬规则

1. **只写能被验证的事实。** 数字、版本号、命令输出、耗时必须来自本次会话的实测，或仓库里可查的代码/文档；
   拿不准就别写，或明确写出处。技术博客的可信度来自"这些数字我真跑过"。
2. **文章必须过校验。** `npm run check:posts` 与 `npx hexo generate` 都要通过：
   front-matter 必填 `title`/`date`/`tags`，文件名必须是全小写 slug，正文引用的本地图片必须真实存在。
3. **发布链路不能绕过。** `main` 有分支保护（`enforce_admins: true`，直推会被 GH006 拒绝）：
   必须开分支 → PR → 三个必需检查全绿 → 合并；合并之后还要**人工触发一次发布**才会真正上线。

## 流程

1. **取材**：先把要讲的事梳理成事实清单——遇到什么问题、方案怎么设计的、关键取舍、实测数据（命令 + 输出 + 数字）、
   部署/使用步骤、踩过的坑。素材来自当前会话、仓库文件、`git log`、真实命令输出。
2. **定标题与标签**：标题用「主标题：副标题（范围）」，`tags` 3~5 个、`categories` 一个。
3. **写文章**：按 [references/style-guide.md](references/style-guide.md) 的结构与文风写；
   用 `bash <skill>/scripts/new-post.sh <slug> "<标题>"` 渲染 `assets/post-template.md` 生成骨架再填正文（`<skill>` 为安装目录，通常 `~/.codex/skills/cadywang-blog`）。
4. **本地校验**：`bash <skill>/scripts/check.sh`（`npm run check:posts` + `hexo generate`；需要时再 `npm run server` 预览）。
5. **提 PR**：`bash <skill>/scripts/publish.sh <slug>` 建分支、提交、推送并打印 PR 链接；
   把本地验证结果贴在 PR 描述里，勾完「发布审查清单」。
6. **发布**：用户合并后，`bash <skill>/scripts/publish.sh --tag <标签名>` 推一个 `publish-<日期>-<slug>` 标签触发发布
   （或让用户在 Actions → **Publish Blog** → Run workflow 点一次）；发布完成后确认线上 URL 返回 200。

详细的闸门、必需检查、失败排查见 [references/publish-flow.md](references/publish-flow.md)。

## 目录说明

| 路径 | 用途 |
| --- | --- |
| `references/style-guide.md` | 文风、章节骨架、front-matter 规范、反面清单 |
| `references/publish-flow.md` | 三道闸门、必需检查、失败排查 |
| `assets/post-template.md` | 文章骨架模板（`new-post.sh` 用它渲染；要随文章产出的素材也放这里） |
| `scripts/new-post.sh` | 生成文章骨架 |
| `scripts/check.sh` | 本地校验（= CI 的 `validate-posts` + `build-check`） |
| `scripts/publish.sh` | 提 PR / 推 `publish-*` 标签触发发布（支持 `--dry-run`） |
| `scripts/install.sh` | 把本 skill 同步到 `$CODEX_HOME/skills/`（幂等） |

本 skill 随博客仓库分发（仓库内 `skill/cadywang-blog/`）：在仓库副本里更新后，
执行 `bash skill/cadywang-blog/scripts/install.sh` 即可同步到本地 skills 目录。

## 边界

- **合并 PR、触发发布是对外可见的动作**：动手前先得到用户明确同意，尤其是发布上线那一步。
- 改主题、站点配置、工作流、校验规则不属于本 skill 的范围——照常改动 + 走 PR 即可。
- 不编造数据，不写"待补充/TODO"式占位，不把凭据、token、真实内网敏感信息写进文章（用示例地址即可）。
- 文章是给工程师看的：讲清取舍与踩坑，比堆功能列表更有价值。