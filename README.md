# cadywang 的博客

基于 **Hexo + Butterfly 主题** 的个人博客，由 **GitHub Actions** 自动编译并发布到 **GitHub Pages**。

- 线上地址：<https://cadywang.github.io>
- 仓库地址：<https://github.com/cadywang/cadywang.github.io>
- 工作流：[.github/workflows/deploy.yml](.github/workflows/deploy.yml)

---

## 一、日常使用：只需要放文档

你不需要懂前端，也不需要本地装任何东西，**只要往 `source/_posts/` 目录上传 Markdown 文件**，博客就会自动更新。

### 在网页上发一篇新文章

1. 打开 <https://github.com/cadywang/cadywang.github.io/tree/main/source/_posts>
2. 点右上角 **Add file → Create new file**
3. 文件名填 `my-new-post.md`（**建议用英文/拼音**，它会出现在文章网址里）
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

5. 页面底部点 **Commit changes**
6. 大约 1～2 分钟后，刷新 <https://cadywang.github.io> 即可看到

> 修改已有文章：点开该文件 → 右上角铅笔图标 → 改完提交，同样会自动发布。

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

目前未开启评论。推荐用 **giscus**（基于 GitHub Discussions，免费、无广告）：

1. 到 <https://giscus.app/zh-CN> 按提示配置，得到 `repo_id` / `category_id`；
2. 把结果填到 `_config.butterfly.yml` 的 `comments` 和 `giscus` 段落中。

---

## 五、发布原理

```
提交 Markdown 到 main 分支
        │
        ▼
GitHub Actions（ubuntu-latest）
  1. checkout 代码
  2. 安装 Node 20 + npm 依赖
  3. npx hexo generate  →  生成 public/ 静态文件
  4. 上传产物并发布到 GitHub Pages
        │
        ▼
https://cadywang.github.io 自动更新
```

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
