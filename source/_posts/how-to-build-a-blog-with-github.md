---
title: 从零开始：用 GitHub 搭建并自动发布个人博客
date: 2026-10-14 10:30:00
tags: [GitHub, Hexo, 教程]
categories: [教程]
sticky: 1
---

这篇文章会带你**从零开始**，用 GitHub 免费搭建一个属于自己的博客，并且做到：

> **你只负责写 Markdown 文档，GitHub 自动帮你编译、自动帮你发布成网页。**

不需要服务器、不需要买主机、不需要备案，全过程免费。跟着做完大约 30 分钟。

本站（你现在看到的这个网站）就是用下面这套方案搭起来的，可以对照参考：<https://github.com/cadywang/cadywang.github.io>

---

## 一、先搞懂原理（30 秒）

静态博客的本质是：**把 Markdown 文件「编译」成 HTML 网页，再托管起来。**

| 角色 | 用什么 | 干什么 |
| --- | --- | --- |
| 生成器 | [Hexo](https://hexo.io/) | 把 Markdown 编译成静态网页 |
| 主题 | [Butterfly](https://butterfly.js.org/) | 决定页面长什么样 |
| 编译工人 | [GitHub Actions](https://docs.github.com/actions) | 你提交代码后，自动跑编译 |
| 托管 | [GitHub Pages](https://pages.github.com/) | 免费托管控好的网页 |

整体流程：

```
你提交 Markdown
      │
      ▼
GitHub Actions 自动执行：安装依赖 → hexo generate → 上传产物
      │
      ▼
GitHub Pages 发布 → https://你的用户名.github.io
```

所以你以后唯一要做的事，就是**往 `source/_posts/` 目录里丢 Markdown 文件**。

---

## 二、准备工作

- 一个 **GitHub 账号**（没有就先去 <https://github.com/signup> 注册）
- 想本地预览再装：**Node.js 18+** 和 **Git**（不装也完全能做完，纯网页操作即可）

---

## 三、第一步：创建仓库

1. 打开 <https://github.com/new>
2. **Repository name** 填 **`<你的用户名>.github.io`**

   > 例如用户名是 `cadywang`，就填 `cadywang.github.io`。
   > ⚠️ 名字必须严格是「你的用户名.github.io」，这样网址才是 `https://你的用户名.github.io`，否则地址会变成 `https://你的用户名.github.io/仓库名/`，还得额外配一个 `root` 参数。

3. 可见性选择 **Public**
   > 免费账号只能给「公开仓库」开启 Pages，所以这里必须选 Public（代码是公开的，介意的话可以只放博客，不放敏感内容）。
4. **不要**勾选 `Add a README file`、`.gitignore`、`license`，保持一个空仓库。
5. 点 **Create repository**。

---

## 四、第二步：创建 5 个文件（纯网页操作）

创建好后你会看到一个空仓库页面。接下来依次创建下面 5 个文件：

> 小技巧：在文件名输入框里**直接输入带斜杠的完整路径**（如 `.github/workflows/deploy.yml`），GitHub 会自动帮你创建目录。
> 新建文件：仓库页 → **Add file → Create new file**；写完拉到底 → **Commit changes**。

### 4.1 `package.json`

告诉 GitHub 编译时需要装哪些依赖。

```json
{
  "name": "my-blog",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "hexo generate",
    "clean": "hexo clean",
    "server": "hexo server",
    "new": "hexo new"
  },
  "dependencies": {
    "hexo": "^7.3.0",
    "hexo-generator-archive": "^2.0.0",
    "hexo-generator-category": "^2.0.0",
    "hexo-generator-index": "^4.0.0",
    "hexo-generator-tag": "^2.0.0",
    "hexo-generator-feed": "^3.0.0",
    "hexo-generator-sitemap": "^3.0.1",
    "hexo-renderer-ejs": "^2.0.0",
    "hexo-renderer-marked": "^7.0.1",
    "hexo-renderer-pug": "^3.0.0",
    "hexo-renderer-stylus": "^3.0.1",
    "hexo-server": "^3.0.0",
    "hexo-theme-butterfly": "^5.7.0",
    "hexo-wordcount": "^6.0.1"
  }
}
```

### 4.2 `_config.yml`

站点配置。**注意把 `url` 改成你自己的地址！**

```yaml
# ===== 站点信息 =====
title: 我的博客
subtitle: '记录与分享'
description: '个人技术笔记与生活记录'
keywords: 博客,笔记
author: 你的名字
language: zh-CN
timezone: 'Asia/Shanghai'

# ===== 网址（★ 必须改：换成你的用户名）=====
url: https://你的GitHub用户名.github.io
permalink: :year/:month/:day/:title/
pretty_urls:
  trailing_index: false
  trailing_html: false

# ===== 写作 =====
default_layout: post
new_post_name: :title.md
post_asset_folder: false
syntax_highlighter: highlight.js
highlight:
  line_number: true
  auto_detect: false
  wrap: true

# ===== 首页 =====
index_generator:
  path: ''
  per_page: 10
  order_by: -date

# ===== 订阅与站点地图 =====
feed:
  type: atom
  path: atom.xml
  limit: 20
sitemap:
  path: sitemap.xml

# ===== 主题 =====
theme: butterfly

# ===== 部署：由 GitHub Actions 完成，这里留空 =====
deploy:
  type: ''
```

### 4.3 `.gitignore`

避免把依赖和编译产物提交上去。

```text
.DS_Store
Thumbs.db
db.json
*.log
node_modules/
public/
.deploy*/
```

### 4.4 `.github/workflows/deploy.yml` ⭐ 最关键

这是「自动编译 + 自动发布」的流水线，文件名和路径都不能错。

```yaml
name: Deploy Blog

on:
  push:
    branches: [main]      # 推送到 main 分支时触发
  workflow_dispatch:      # 也支持在 Actions 页面手动点一下重新发布

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: 检出代码
        uses: actions/checkout@v4

      - name: 安装 Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: 安装依赖
        run: npm install

      - name: 编译生成静态网页
        run: npx hexo generate

      - name: 配置 Pages
        uses: actions/configure-pages@v5

      - name: 上传编译产物
        uses: actions/upload-pages-artifact@v3
        with:
          path: public

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: 发布到 GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

> 注意：这里用的是 `npm install`（不依赖 lock 文件）。
> 如果你以后提交了 `package-lock.json`，可以改成 `npm ci` 并把上面的 `setup-node` 加上 `cache: npm`，速度更快、版本更固定。

### 4.5 `source/_posts/hello-world.md`

你的第一篇文章，顺便验证流水线是否正常。

```markdown
---
title: 你好，世界
date: 2026-10-14 09:00:00
tags: [随笔]
categories: [生活]
---

这是我的第一篇文章，博客搭建成功 🎉

以后只要在 `source/_posts/` 目录下新增 Markdown 文件，网站就会自动更新。
```

创建完成后，你的仓库结构应该是这样：

```
.
├── .github/
│   └── workflows/
│       └── deploy.yml      ← 自动构建发布流水线
├── source/
│   └── _posts/
│       └── hello-world.md  ← 你的文章
├── .gitignore
├── _config.yml             ← 站点配置
└── package.json            ← 依赖清单
```

---

## 五、第三步：开启 GitHub Pages

1. 进入仓库的 **Settings**（顶部菜单）
2. 左侧找到 **Pages**
3. 在 **Build and deployment → Source** 的下拉框里选择 **GitHub Actions**

> 这一步很关键：不选它，流水线最后一步会报错 `Get Pages site failed`。

---

## 六、第四步：等待自动构建并访问

1. 回到仓库，点顶部 **Actions** 标签
2. 你会看到一条名为 **Deploy Blog** 的任务，状态先是 🟡 进行中，大约 1～2 分钟后变成 ✅ 绿色
3. 点进去可以看到每一步的日志；点开 `deploy` 那一步会显示最终网址
4. 浏览器打开 **`https://你的用户名.github.io`** —— 你的博客上线了！

### 如果失败了怎么办

| 报错 / 现象 | 原因与解决办法 |
| --- | --- |
| `Get Pages site failed` | 第五步没做，去 Settings → Pages 把 Source 选成 GitHub Actions，然后在 Actions 页面点 **Re-run all jobs** |
| `npm install` 报错 | 检查 `package.json` 内容是否完整（JSON 不能有多余逗号） |
| 流水线根本没跑 | 确认存储库默认分支是 `main`（Settings → General → Default branch）；如果你的是 `master`，把 `deploy.yml` 里的 `main` 改成 `master` |
| 页面打开是 404 | 等 1～2 分钟再刷新；或确认 Actions 是 ✅ 不是 ❌ |
| 页面样式全丢 | 检查 `_config.yml` 的 `url` 是否写对（必须是 `https://用户名.github.io`，结尾不要加斜杠） |

---

## 七、第五步：以后怎么发文章（日常操作）

这是你以后 99% 时间用到的部分，非常简单：

1. 打开 `source/_posts/` 目录 → **Add file → Create new file**
2. 文件名写 `my-post.md`（**建议用英文或拼音**，它会成为文章网址的一部分）
3. 内容照抄这个模板：

   ```markdown
   ---
   title: 文章标题
   date: 2026-10-14 10:00:00
   tags: [标签A, 标签B]
   categories: [分类名]
   ---

   正文，正常写 Markdown 就行。
   ```

4. 拉到底部点 **Commit changes**
5. 等 1～2 分钟，刷新网站就能看到新文章

### front-matter（两行 `---` 之间的部分）说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | ✅ | 文章标题 |
| `date` | ✅ | 发布时间，决定排序，越新越靠前 |
| `tags` | ❌ | 标签，可写多个：`tags: [GitHub, 教程]` |
| `categories` | ❌ | 分类，建议只写一个 |
| `sticky` | ❌ | 写 `sticky: 1` 会把文章置顶 |
| `top_img` | ❌ | 文章顶部大图，写 `false` 表示不要 |

- **修改文章**：点开文件 → 右上角铅笔图标 → 改完提交
- **删除文章**：点开文件 → 右上角垃圾桶图标 → 提交

---

## 八、进阶一：本地预览（可选）

如果希望在提交前先看看效果，可以装 **Node.js 18+** 和 **Git**，然后：

```bash
git clone https://github.com/你的用户名/你的用户名.github.io.git
cd 你的用户名.github.io
npm install        # 首次执行，安装依赖（大约 1 分钟）
npm run server     # 启动本地预览
```

浏览器打开 <http://localhost:4000> 即可，按 `Ctrl + C` 停止。

其他常用命令：

```bash
npm run new -- "我的新文章"   # 按模板新建文章（自动带上 front-matter）
npm run build                 # 本地编译到 public/ 目录
npm run clean                 # 清理缓存，构建异常时可以试试
```

> ⚠️ 版本提示：**Hexo 8 要求 Node.js ≥ 20.19**。所以本教程固定使用 Hexo 7.x，Node 18 也能正常编译；如果你的 Node 是 20+，也可以把 `package.json` 里的 `hexo` 升到 `^8.0.0`。

---

## 九、进阶二：定制主题

主题自带的默认样式就能用，想改外观时，把主题的默认配置复制一份放到仓库根目录，命名为 `_config.butterfly.yml`：

- 本地方式：`cp node_modules/hexo-theme-butterfly/_config.yml _config.butterfly.yml`
- 网页方式：从 [主题仓库](https://github.com/jerryc127/hexo-theme-butterfly/blob/master/_config.yml) 复制内容，新建文件 `_config.butterfly.yml` 粘贴

然后按需修改（下面是最常用的一段，可以只写这部分，其余用默认值）：

```yaml
# 导航菜单
menu:
  首页: / || fas fa-home
  归档: /archives/ || fas fa-archive
  标签: /tags/ || fas fa-tags
  分类: /categories/ || fas fa-folder-open
  关于: /about/ || fas fa-heart

# 头像（图片放到 source/img/ 目录下）
avatar:
  img: /img/avatar.png
  effect: false

# 社交链接
social:
  fab fa-github: https://github.com/你的用户名 || Github || '#24292e'

# 首页副标题打字机效果
subtitle:
  enable: true
  effect: true
  sub:
    - 记录学习与实践
    - 慢慢来，比较快

# 本地搜索（需要先 npm install hexo-generator-searchdb）
search:
  use: local_search
  placeholder: 搜索文章

# 页脚
footer:
  owner:
    enable: true
    since: 2026
```

用本地搜索还需要在 `_config.yml` 末尾加：

```yaml
search:
  path: search.xml
  field: post
  content: true
```

并在 `package.json` 的 `dependencies` 里加上 `"hexo-generator-searchdb": "^1.5.0",`。

### 加一个「关于」页面

新建 `source/about/index.md`：

```markdown
---
title: 关于
date: 2026-10-14 09:00:00
comments: false
---

你好，我是 XXX，这里记录我的学习笔记。
```

### 开启评论（giscus）

> 完整步骤（包含两个 ID 的获取方式和 giscus App 的安装）见《[给 Hexo 博客接入 giscus 评论系统](/2026/10/14/add-giscus-comments-to-hexo-blog/)》。

1. 到 <https://giscus.app/zh-CN> 按提示配置（它会引导你给仓库开启 Discussions，并生成 `repo_id`、`category_id`）
2. 在 `_config.butterfly.yml` 里加：

```yaml
comments:
  use: giscus
giscus:
  repo: 你的用户名/你的用户名.github.io
  repo_id: 上面生成的 repo_id
  category_id: 上面生成的 category_id
  lang: zh-CN
```

---

## 十、进阶三：绑定自己的域名

1. 在域名服务商处购买域名（阿里云、腾讯云、Namecheap 等都可以）
2. 到域名商后台添加一条 **CNAME 记录**：
   - 主机记录：`blog`（代表 `blog.你的域名.com`）
   - 记录值：`你的用户名.github.io`
3. 回到 GitHub 仓库 → **Settings → Pages → Custom domain**，填入 `blog.你的域名.com`，点 **Save**
4. 等 DNS 生效（几分钟到几小时），再回到这个页面勾选 **Enforce HTTPS**，GitHub 会自动签发免费证书

> 设置自定义域名后，访问原来的 `你的用户名.github.io` 也会自动跳转到新域名。

---

## 十一、常见问题

**Q1：GitHub Pages 在中国大陆访问很慢 / 时好时坏？**
这是常见现象。可以：① 绑定自己的域名（通常更稳）；② 使用 Cloudflare 做代理加速；③ 或者把同样的代码部署到 Cloudflare Pages / Vercel，它们也支持直接连接 GitHub 仓库自动构建。

**Q2：如何让构建更快、版本更稳定？**
在本地跑一次 `npm install`，会生成 `package-lock.json`，把它提交到仓库，然后把工作流里的 `npm install` 改成 `npm ci`，并在 `setup-node` 下加 `cache: npm`。

**Q3：文章网址里的中文变成了一串 `%E4%BD%A0...`？**
把 Markdown 文件名改成英文或拼音即可，标题可以照旧用中文。

**Q4：想换主题？**
`npm install hexo-theme-xxx`，把 `_config.yml` 的 `theme` 改成对应主题名；主题配置放在 `_config.主题名.yml`。

**Q5：仓库可以设成私有吗？**
免费账号的 GitHub Pages 只支持公开仓库；想让源码私有，需要升级到 GitHub Pro。

**Q6：提交后网站一直没变？**
去 **Actions** 标签看流水线状态：黄色=正在跑，红色=失败（点进去看日志），绿色=成功。成功但仍看不到变化时，浏览器按 `Ctrl + F5` 强制刷新。

---

## 十二、总结

回顾一下，整套方案只有几个关键点：

1. 仓库名必须是 `<用户名>.github.io`，且为 Public；
2. 5 个文件：`package.json`、`_config.yml`、`.gitignore`、`.github/workflows/deploy.yml`、至少一篇文章；
3. Settings → Pages → Source 选 **GitHub Actions**；
4. 以后只需要往 `source/_posts/` 里放 Markdown，其余交给 GitHub。

现在，去写你的第一篇正式文章吧 🚀
