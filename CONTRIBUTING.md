# 贡献指南（Contributing Guide）

这是 cadywang 的个人博客（Hexo + Butterfly + GitHub Pages）。`main` 有保护：
任何改动都必须走 PR、CI 全绿后用 **Rebase and merge** 合入；**合并 ≠ 上线**——
发布还要手动触发一次（见 [README.md](README.md) 与 [REVIEW_POLICY.md](REVIEW_POLICY.md)）。

## 1. 开发环境

| 组件 | 要求 |
| --- | --- |
| Node | 20+（CI 用 20） |
| Python | 3.8+（提交规范门禁，只用标准库） |

```bash
git clone git@github.com:cadywang/cadywang.github.io.git
cd cadywang.github.io
npm ci
bash tools/dev-setup.sh     # 开启 format.signOff + 安装 commit-msg 钩子
```

## 2. 提交前必须本地通过

```bash
npm run check:posts
npm run build
python3 tests/test_check_commits.py
node tests/test_check_pr.mjs
```

## 3. 提交规范（Linux 内核风格 + DCO）

* 格式 `<subsystem>: <祈使句摘要>`，不超过 72 列，结尾不加句号；
* subsystem 例如 `post:`、`docs:`、`ci:`、`skill:`、`repo:`；
* 正文说明 what/why，72~75 列折行；不要用 `feat:` / `fix:` 这类 conventional-commit 标签；
* 每个提交带 `Signed-off-by:`（`git commit -s`，`tools/dev-setup.sh` 之后自动加）。

> 仓库只允许 **Rebase and merge**：PR 里的提交会原样落到 `main`，所以提交信息必须一开始就写对。

## 4. 内容与文件风格

* 文档中文、代码与注释英文；文件为 UTF-8（无 BOM）+ LF（`.gitattributes` 已钉住）；
* 不提交密钥、口令、内网地址；示例路径用占位符；
* 文章 front-matter 与本地资源的规则见 README 与 `tools/check-posts.mjs`。

## 5. PR 流程

1. 从 `main` 切分支（`post/<slug>`、`docs/<what>`）；
2. 开 PR：标题用内核规范，按模板勾选「发布审查清单」（`pr-checklist` 强制）；
3. 等 4 个必需检查全绿：`Hygiene` / `validate-posts` / `pr-checklist` / `build-check`；
4. **Rebase and merge**（合并后分支自动删除）；
5. 需要上线时再手动触发发布（`workflow_dispatch` 或 `publish-*` 标签）。
