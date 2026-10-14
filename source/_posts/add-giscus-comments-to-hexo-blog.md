---
title: 给 Hexo 博客接入 giscus 评论系统（完整步骤）
date: 2026-10-14 14:30:00
tags: [giscus, 评论, Hexo, 教程]
categories: [教程]
---

静态博客没有后端，评论只能「借」第三方的服务。这篇文章记录我给本站接入 **giscus** 评论的完整过程——从开启 Discussions、拿两个 ID，到配置主题、安装 GitHub App、验证效果，一步步都能照着做。

最终效果：文章底部出现评论区，访客用 GitHub 账号登录即可回复，**所有评论数据都保存在你自己的仓库里**，免费、无广告、无需服务器。

---

## 一、为什么选 giscus

| 方案 | 评论数据在哪 | 是否需要后端 | 说明 |
| --- | --- | --- | --- |
| **giscus** | 你的 GitHub 仓库 Discussions | ❌ 不需要 | 免费、无广告、支持深色模式 ✅ |
| utterances | 你的 GitHub 仓库 Issues | ❌ 不需要 | 同样要装 App，功能比 giscus 少 |
| Waline / Twikoo | 自己的数据库 | ✅ 需要部署 | 功能强，但要额外维护一个服务 |
| Disqus | 第三方服务器 | ❌ 不需要 | 有广告、加载慢、国内不稳定 |

技术类博客的读者大多有 GitHub 账号，所以 **giscus 是性价比最高的选择**；评论内容存在自己仓库里，也不怕第三方服务跑路。

## 二、先看懂原理

giscus 的工作方式可以用一句话概括：**「一个页面 = 一个 GitHub 讨论帖」**。

```
访客打开文章
     │
     ▼
页面加载 giscus 脚本，带上三个关键信息：
   repo_id        —— 讨论帖存在哪个仓库
   category_id    —— 存到哪个分类
   data-mapping   —— 怎么把页面和讨论帖对应起来（本站用 pathname，即网址路径）
     │
     ▼
脚本去仓库里找「路径相同」的讨论帖：
   有 → 直接显示；没有 → 自动创建一个
     │
     ▼
评论内容保存在仓库的 Discussions 里（你可以随时在 GitHub 上查看、管理）
```

所以要准备三样东西：**① 仓库开启 Discussions；② 两个 ID；③ 安装 giscus GitHub App**。

## 三、前置条件

- 已经有一个用 Hexo + Butterfly 搭好的博客（见上一篇《从零开始：用 GitHub 搭建并自动发布个人博客》）
- 仓库是 **Public**
- 一个 GitHub 账号

---

## 四、步骤 1：开启 Discussions

进入仓库 → **Settings** → **General** → 拉到 **Features** → 勾选 **Discussions**。

> 新建仓库时如果已经勾选过，这里会显示为开启状态，可以跳过。
> 开启后，仓库顶部菜单会多出一个 **Discussions** 标签页，这就是以后存放评论的地方。

## 五、步骤 2：拿到两个 ID

### 5.1 `repo_id`（仓库 ID）

公开仓库不需要登录就能查，直接在终端执行（把用户名和仓库名换成你自己的）：

```bash
curl -s https://api.github.com/repos/cadywang/cadywang.github.io | grep -o '"node_id": *"[^"]*"'
```

输出类似：

```
"node_id": "R_kgDOVIiFPA"
```

记下 `R_kgDOVIiFPA` 这段，就是 `repo_id`。

### 5.2 `category_id`（讨论分类 ID）

分类 ID 需要用 GraphQL 查询，所以要带一个 GitHub Token（在 <https://github.com/settings/tokens> 生成，勾选 `repo` 权限即可，或者直接用 giscus 官网帮你查）：

```bash
curl -s -X POST \
  -H "Authorization: Bearer 你的Token" \
  https://api.github.com/graphql \
  -d '{"query":"{repository(owner:\"cadywang\",name:\"cadywang.github.io\"){discussionCategories(first:20){nodes{id name}}}}"}'
```

输出会列出所有分类，例如站点仓库的真实结果：

```
Announcements   DIC_kwDOVIiFPM4DIXQA
General         DIC_kwDOVIiFPM4DIXQB
Ideas           DIC_kwDOVIiFPM4DIXQD
Polls           DIC_kwDOVIiFPM4DIXQF
Q&A             DIC_kwDOVIiFPM4DIXQC
Show and tell   DIC_kwDOVIiFPM4DIXQE
```

**选 `Announcements`** 的原因：这个分类只有仓库维护者能新建讨论帖，访客只能回复，可以避免有人在你的仓库里乱建讨论。

> 偷懒办法：打开 <https://giscus.app/zh-CN>，输入仓库名后它会自动帮你查出这两个 ID，也可以顺便生成配置。

## 六、步骤 3：修改主题配置

打开仓库根目录的 `_config.butterfly.yml`，加上下面两段（**如果文件里已有同名的 `comments:` 或 `giscus:` 段落，直接替换掉**）：

```yaml
# ===== 评论模块：giscus =====
comments:
  use: Giscus          # 注意：首字母必须大写
  text: true           # 标签页上显示“评论”文字
  lazyload: false      # true = 滚到评论区再加载（开启后评论数会失效）
  count: false         # 是否在文章顶部显示评论数
  card_post_count: false

giscus:
  repo: cadywang/cadywang.github.io
  repo_id: R_kgDOVIiFPA
  category_id: DIC_kwDOVIiFPM4DIXQA     # Discussions 分类: Announcements
  light_theme: light                    # 浅色模式下的评论框主题
  dark_theme: dark                      # 深色模式下的评论框主题
  js:                                   # 留空则使用官方 https://giscus.app/client.js
  option:
    data-lang: zh-CN                    # 评论框语言
    data-mapping: pathname              # 用页面路径匹配讨论帖
    data-strict: '0'                    # 0=标题略有差异也复用同一个帖子
    data-reactions-enabled: '1'         # 允许表情反应
    data-emit-metadata: '0'
    data-input-position: top            # 输入框放在评论列表上方
    data-loading: lazy
```

两个容易踩的坑：

1. `use:` 的值是 **`Giscus`**，首字母大写（主题内部是大小写敏感的）；
2. `option:` 里的键名必须是**完整的 `data-` 属性名**——主题模板会把这些键原样铺到 `<script>` 标签上，写成 `mapping` 之类的短名字不会生效。

## 七、步骤 4：安装 giscus 应用（最容易漏的一步）

**代码改对了不等于能用**：giscus 需要你授权它的 GitHub App 访问仓库，否则评论区会显示 `giscus is not installed on this repository`。

1. 打开 <https://github.com/apps/giscus/installations/new>
2. 选择你的账号 → **Only select repositories** → 勾选博客仓库（如 `cadywang.github.io`）
3. 点 **Install**（如果提示授权，点 **Authorize** 即可）

## 八、步骤 5：提交并等待自动发布

```bash
git add _config.butterfly.yml
git commit -m "theme: enable giscus comments on posts"
git push
```

推送后到仓库 **Actions** 标签页看流水线，大约 1～2 分钟后变绿，网站就更新了。

## 九、步骤 6：验证

1. 打开任意一篇文章，拉到页面底部，应该能看到 giscus 评论区；
2. 用 GitHub 账号登录，发一条测试评论；
3. 回到仓库的 **Discussions** 标签页 → **Announcements**，就能看到自动创建的讨论帖（标题默认是文章标题）。

至此评论功能就通了，以后访客的每条评论都会出现在这里，你可以在 GitHub 上直接回复、删除或关闭讨论。

---

## 十、常见问题

| 现象 | 原因与解决办法 |
| --- | --- |
| `giscus is not installed on this repository` | 第七步没做，或安装 App 时没勾选当前仓库 |
| 评论区空白、控制台报错 | 检查 `repo_id`、`category_id` 是否复制完整；确认仓库已开启 Discussions |
| 某篇文章不想要评论 | 在该文章 front-matter 里加 `comments: false` |
| 评论框是英文 | `giscus.option.data-lang: zh-CN` |
| 改了文章网址后评论「丢了」 | 因为 `data-mapping: pathname` 是按路径匹配的。可以用文章 front-matter 里的 `permalink` 固定网址，或改成按标题匹配 |
| 评论数不显示 | 先设 `comments.count: true`；注意 `lazyload: true` 时评论数会失效 |
| 换讨论分类 | 用第五步的方法查新分类的 ID，替换 `giscus.category_id` |
| 评论会不会丢 | 数据就在你仓库的 Discussions 里，仓库在评论就在；可以用 GraphQL API 备份导出 |

## 十一、可以继续调的地方

- **深色模式配色**：`light_theme` / `dark_theme` 可填 `light`、`dark`、`dark_dimmed`、`preferred_color_scheme` 等；
- **严格匹配**：`data-strict: '1'` 时，只有标题完全一致才会复用讨论帖；
- **输入框位置**：`data-input-position: bottom` 放在评论列表下方；
- **表情反应**：不需要可以设 `data-reactions-enabled: '0'`；
- **评论计数**：`comments.count: true` 后，文章顶部会显示评论条数。

## 十二、小结

接入 giscus 其实只有三步关键动作：

1. **开启 Discussions**（Settings → Features）；
2. **拿到 `repo_id` 和 `category_id`**（curl 或 giscus.app 都能查）；
3. **安装 giscus App**，然后在 `_config.butterfly.yml` 里填好配置。

本站就是按这套流程配置的，配置值也是真实可对照的。装好之后，你的博客就从「只能看」变成「可以聊」了 🎉
