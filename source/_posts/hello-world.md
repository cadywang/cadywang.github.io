---
title: 欢迎来到我的博客
date: 2026-10-14 09:00:00
tags: [公告]
categories: [随笔]
---

欢迎访问！这是本博客的第一篇文章，也顺便当作使用说明。

## 博客是怎么运行的

整个流程完全自动化，你（以及我）只需要关心一件事：**往 `source/_posts/` 目录里放 Markdown 文件**。

```
写 Markdown  →  提交到 GitHub  →  GitHub Actions 自动编译  →  自动发布到 Pages
```

## 怎么发一篇新文章

1. 打开仓库，进入 `source/_posts/` 目录；
2. 点右上角 **Add file → Create new file**，文件名写成 `my-post.md`；
3. 开头必须有下面这段「front-matter」，然后用 Markdown 写正文：

```markdown
---
title: 文章标题
date: 2026-10-14 09:00:00
tags: [标签A, 标签B]
categories: [分类名]
---

正文写在这里，支持标准 Markdown 语法。
```

4. 点 **Commit changes** 提交到 `main` 分支；
5. 等待 1～2 分钟，刷新 <https://cadywang.github.io> 就能看到新文章了。

## 几点小建议

- 文件名建议用英文或拼音，文章的网址会用到文件名；
- `date` 决定文章排序，新文章日期越新排越前；
- `categories` 建议只写一个分类，`tags` 可以写多个，方便归档。

就这么多，开始写吧 🙂
