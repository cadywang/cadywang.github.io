# cadywang 的博客

基于 **Hexo + Butterfly 主题** 的个人博客，由 **GitHub Actions** 自动编译并发布到 **GitHub Pages**。

- 线上地址：<https://cadywang.github.io>
- 仓库地址：<https://github.com/cadywang/cadywang.github.io>
- 发布规则：[REVIEW_POLICY.md](REVIEW_POLICY.md)——**源码先提交，本人审核通过后手动触发才编译发布**
- 工作流：[.github/workflows/deploy.yml](.github/workflows/deploy.yml)

---

## 一、日常使用：写文章 → 审核 → 发布

你不需要懂前端，也不需要本地装任何东西，**只要往 `source/_posts/` 目录上传 Markdown 文件**，提交后自己审核一遍，再在 Actions 里点一次发布就能上线（规则见 [REVIEW_POLICY.md](REVIEW_POLICY.md)）。

### 发一篇新文章（源码先提交，审核后再发布）

> 本站是**单人模式**：源码提交到 `main` **不会**立刻上线。
> 你自己审核通过后，在 Actions 里手动触发一次发布，才会编译并上线。
> 完整规则见 [REVIEW_POLICY.md](REVIEW_POLICY.md)。

**第一步：提交文章源码**

1. 打开 <https://github.com/cadywang/cadywang.github.io/tree/main/source/_posts>
2. 点右上角 **Add file → Create new file**
3. 文件名填 `my-new-post.md`（建议用英文/拼音，它会出现文章网址里）
4. 内容格式：

   ```markdown
   ---
   title: 我的新文章
   date: 2026-10-14 09:00:00
   tags: [随笔]
   categories: [生活]
   ---

   正文，正常写 Markdown 即可。
   ```

5. 页面底部选 **Commit directly to the main branch**，点 **Commit changes**

**第二步：等自动校验，然后自己审核**

6. 仓库 **Actions** 里 `Review Gate` 会跑 `validate-posts`（文章格式）和 `build-check`（能否构建），全绿说明没问题
7. 审核方式随你挑：看这次提交的 diff、在 GitHub 上读一遍源码，或本地 `npm run server` 预览效果

**第三步：审核通过 → 手动触发发布**

8. 打开 <https://github.com/cadywang/cadywang.github.io/actions/workflows/deploy.yml>
9. 点 **Run workflow** → 分支选 `main` →（可选）填一句审核备注 → 点 **Run workflow**
10. 看这次运行的 **Summary** 里「本次发布内容」，确认要发的东西没错，再等 `build` / `deploy` 变绿
11. 约 1～2 分钟刷新 <https://cadywang.github.io> 即可看到

> 命令行等价操作：`gh workflow run deploy.yml`；或者打标签 `git tag publish-2026-10-15 && git push origin publish-2026-10-15`。
> 两种方式都只会发布 `main` 上已有的提交，未进 main 的东西发布不出去。
>
> 修改已有文章同理：改完提交 → 校验变绿 → 手动发布一次。
> 还没打算发的稿子：在 front-matter 加 `draft: true`，它不会被生成。

### front-matter 各项含义

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 文章标题 |
| `date` | 是 | 发布时间，决定排序，越新越靠前 |
| `tags` | 否 | 标签，可写多个：`tags: [A, B]` |
| `categories` | 否 | 分类，建议只写一个 |
| `top_img` | 否 | 文章顶部大图，写 `false` 表示不要 |

---

## 二、本地预览（可选）

如果希望在提交前先看效果，需要本机有 **Node.js 18+** 和 Git：

```bash
npm install          # 首次执行，安装依赖
npm run server       # 启动本地预览
```

浏览器打开 <http://localhost:4000> 即可。按 `Ctrl + C` 停止。

其他命令：

```bash
npm run build        # 生成静态文件到 public/
npm run clean        # 清理缓存
npm run new -- "标题"  # 按模板新建一篇文章
```

> 说明：本仓库固定使用 Hexo 7 + Node 18 兼容版本，因此本机 Node 18 也能正常构建；CI 环境使用 Node 20。

---

## 三、目录结构

```
.
├── .github/workflows/deploy.yml   # 自动构建 + 发布的流水线（核心）
├── source/
│   ├── _posts/                    # ★ 你的文章都放这里
│   ├── about/index.md             # 「关于」页面
│   └── img/                       # 图片资源（可放头像、横幅等）
├── scaffolds/                     # 新建文章的模板
├── _config.yml                    # 站点配置：标题、URL、语言、分页等
├── _config.butterfly.yml          # 主题配置：菜单、头像、搜索、统计等
└── package.json                   # 依赖清单
```

---

## 四、常见自定义

全部在 `_config.yml` 和 `_config.butterfly.yml` 两个文件里改，改完提交即生效。

| 想改什么 | 改哪里 |
| --- | --- |
| 站点标题 / 副标题 / 简介 | `_config.yml` → `title` / `subtitle` / `description` |
| 作者名、语言、时区 | `_config.yml` → `author` / `language` / `timezone` |
| 每页显示几篇 | `_config.yml` → `per_page` |
| 文章网址格式 | `_config.yml` → `permalink` |
| 导航菜单 | `_config.butterfly.yml` → `menu` |
| 头像 | 图片放 `source/img/`，再改 `_config.butterfly.yml` → `avatar.img` |
| 首页/文章大图 | `_config.butterfly.yml` → `index_img` / `default_top_img`，值填 `/img/xxx.jpg` |
| 社交链接（GitHub、邮箱） | `_config.butterfly.yml` → `social` |
| 主色调、暗色模式 | `_config.butterfly.yml` → `theme_color` / `display_mode` |

### 关于图片

- 图片统一放在 `source/img/` 下，文章中这样引用：`![说明](/img/图片名.png)`；
- 也可以直接引用网上的图片链接。

### 关于评论

已启用 **giscus**（基于 GitHub Discussions，免费、无广告、无需自建后端），评论数据保存在本仓库的 Discussions 中。

- 配置位置：`_config.butterfly.yml` 的 `comments` 与 `giscus` 两段
- 当前参数：`repo=cadywang/cadywang.github.io`、分类 `Announcements`、映射 `pathname`（一篇文章对应一个讨论帖）

> ⚠️ 首次启用需要**手动安装一次 giscus 应用**（代码无法代劳）：
> 打开 <https://github.com/apps/giscus/installations/new> → 选择 `cadywang.github.io` → 点 Install。
> 未安装时，文章页面评论区会提示 `giscus is not installed on this repository`。

常用调整：

| 想改什么 | 改哪里 |
| --- | --- |
| 文章顶部显示评论数 | `comments.count: true` |
| 评论区延迟加载 | `comments.lazyload: true`（开启后评论数会失效） |
| 更换讨论分类 | 改 `giscus.category_id` |
| 评论区语言 | `giscus.option.data-lang`（如 `en`、`zh-CN`） |
| 关闭某篇文章的评论 | 在该文章 front-matter 写 `comments: false` |

---

## 五、发布原理

提交文章源码到 main（直接提交或走 PR 都行）
         │
         ▼
Review Gate（自动校验，不发布）
  validate-posts   文章格式 / 文件名 / 本地资源
  pr-checklist     走 PR 时的审查清单
  build-check      站点能否构建成功
         │
         ▼
你本人审核（看 diff / 本地预览）
         │  审核通过
         ▼
Actions → Publish Blog → Run workflow（人工触发，或推 publish-* 标签）
  verify       确认要发布的提交已经在 main 上
  全量校验     check-posts --all
  构建         npm ci + hexo generate
  发布         deploy-pages → GitHub Pages
         │
         ▼
https://cadywang.github.io 更新

查看每次发布是否成功：仓库页 **Actions** 标签。

---

## 六、常见问题

**Q：提交后网站没变化？**
A：去 **Actions** 看流水线是否还在跑（约 1～2 分钟）或是否报错。若是第一次部署，确认仓库 **Settings → Pages → Source** 已选择 **GitHub Actions**。

**Q：本地 `npm run server` 报错？**
A：先确认 Node 版本 ≥ 18：`node -v`。

**Q：文章网址里的中文变成了一串编码？**
A：把文件名改成英文/拼音即可。

**Q：想换域名？**
A：在 **Settings → Pages → Custom domain** 填入你的域名，并按提示到域名服务商配置 CNAME 解析（例如 `blog.example.com` → `cadywang.github.io`）。HTTPS 证书 GitHub 会自动签发。

**Q：换主题怎么办？**
A：`npm install hexo-theme-xxx`，然后把 `_config.yml` 的 `theme` 改成对应主题名。

---

## 七、提交信息规范

本仓库的提交信息**统一使用英文**，并遵循 Linux 内核提交风格：

```
<subsystem>: <summary>        ← 主题行：不超过 50 字符，动词原形，结尾不加句号

为什么做这个改动（正文每行不超过 72 字符）

Signed-off-by: 姓名 <邮箱>
```

- 常用子系统前缀：`ci:`（流水线）、`docs:`（文章与文档）、`build:`（构建与依赖）、`theme:`（主题配置）
- 示例：

  ```
  ci: build pull requests without deploying

  Run the pipeline on pull requests too, but skip the deploy job for
  them, so a pull request only validates that the site still builds.

  Signed-off-by: cadywang <109458837+cadywang@users.noreply.github.com>
  ```

- 本地启用校验钩子（每个克隆只需执行一次），不符合规范的提交会被直接拒绝：

  ```bash
  git config core.hooksPath .githooks
  ```
