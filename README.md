# 云烟成雨 · 博客

<p>
  <a href="https://chihomn.github.io">线上站点</a> ·
  <a href="https://github.com/ChihoMN/chihomn.github.io">发布仓库</a> ·
  维护文档（就是本文件）
</p>

用 Astro + ShokaX 主题搭的静态博客，源码就是这个仓库，推上去就自动发布。日常维护只需要两样东西：

- **本地的博客控制台** —— 改站点配置、写文章、构建、发布，都在一个页面里点
- **Git** —— 版本记录与备份

```bash
pnpm config-gui        # 打开控制台 → http://127.0.0.1:4399
pnpm dev               # 本地预览站点 → http://localhost:4321
```

> 旧的 Hexo 版站点已归档为 `/Users/cza/chihomn.github.io-site-archive.tar.gz`，不在本仓库里。

---

## 一、一分钟速查

| 想做什么                                            | 怎么做                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| 改站点配置（标题、导航、页脚、友链、统计、内容页…） | `pnpm config-gui` →「站点配置」→ 改完点 **保存并写入项目文件**                   |
| 写一篇新文章                                        | 控制台「文章与发布 → 新建文章」，或 `pnpm new-post "标题"`                       |
| 本地看效果                                          | 控制台点 **本地预览**，或 `pnpm dev`（http://localhost:4321 ）                   |
| 传到线上                                            | 控制台点 **提交并部署**（约 2 分钟）                                             |
| 只验证能不能构建                                    | 控制台点 **本地构建**，或 `pnpm build`                                           |
| 改错了想回退                                        | `git revert <提交>`，再点一次「提交并部署」                                      |
| 备份一份完整快照                                    | `tar -czf ~/blog-backup-$(date +%F).tar.gz -C /Users/cza blog`（备份放在仓库外） |
| 想用作者自带的图形界面                              | 文档里是 `hyc serve` + 官方网页控制台，当前版本还起不来 —— 见下面 2.3 那节       |

---

## 二、博客控制台 `http://127.0.0.1:4399`

`pnpm config-gui` 启动，只监听本机（127.0.0.1），不参与站点构建。两个页签：

### 1）站点配置

界面分 13 组：站点、联系方式、页面内容、字体、品牌与信息、侧边栏、页脚、标签云、小部件、首页、布局、导航与页面、插件（友链在「导航与页面」里，公告/关于页在「页面内容」里）。

- 字段下方小字是它在配置文件里的位置，比如 `footer.since` 指 `src/theme.config.ts` 里的对应项
- 标着 **「默认值 xx」** 的字段＝当前没有覆盖主题默认值；把它改回默认值就会自动取消覆盖
- **保存并写入项目文件** 会重新生成 `src/theme.config.ts`、`hyacine.plugin.ts`，并改写 `astro.config.mjs` 的 site 与 `hyacine.yml` 的字体/头像
- 公告正文、关于页正文、关于页的对话问答也能在这里改（不用手写 MDX）

### 2）文章与发布

**发布面板**

| 按钮       | 作用                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 本地预览   | 4321 端口已有 dev server 就直接给链接，否则起一个（可用「停止任务」结束）                                       |
| 本地构建   | 跑 `pnpm build`（Astro 构建 + Pagefind 搜索索引），产物在 `dist/`，**不动线上**                                 |
| 提交并部署 | `git add -A` → `commit` → `push` → 自动盯 GitHub Actions 到出结果，成功后给「查看 Actions」「打开线上站点」链接 |
| 停止任务   | 中断正在跑的任务                                                                                                |

面板上方是「当前改动」（等价于 `git status`）和提交说明输入框（按改动的文章自动给建议，如 `post: 文章标题`），下方是完整任务日志。

**文章列表**

列出 `src/posts` 下全部文章，带 **草稿 / 置顶 / 未提交** 标记，支持按标题/分类/标签过滤。每篇四个按钮：

- **用 Typora 打开** —— 直接编辑正文
- **改信息** —— 就地修改标题、日期、分类、标签、摘要、草稿、置顶（只重写这几个字段，其它 frontmatter 与正文一字不动）
- **转为草稿 / 转为发布**
- **删除** —— 会连同同名的 `xxx.assets/` 图片目录一起删（删除会在下次部署时同步到线上）

**新建文章**：填标题、文件名、子目录、分类（可从现有分类挑）、标签、是否草稿 → 创建并自动用 Typora 打开。

### 3）作者自带的 HyC 控制台（另一个图形界面，目前起不来）

主题作者另有一套图形化配置界面 + 本地轻量 CMS：网页端是他托管的官方控制台，本地跑一个服务用「认证码」对接（默认 3789 端口）。上游 README 与官方文档给的启动方式是：

```bash
pnpm add -g @hyacine/cli     # 或在项目里 pnpm add -D @hyacine/cli 后用 pnpm hyc
hyc serve                    # 起本地服务，会打印端口和 16 位认证码
# 然后浏览器打开 https://hyc.kaitaku.xyz/ ，输入那串认证码即可在网页里改主题配置
```

同一份文档里还提到 `hyc sync`（同步数据库与内容集合）、`hyc new "标题"`、`hyc publish "标题"`、`hyc sort category`。仓库里的 `src/theme.config.template.txt` 就是留给它的配置模板。

**现状：这个界面现在起不来**，原因都在上游包里（我在本机实测过）：

- npm 上 `@hyacine/cli` 最新就是 **0.1.1**，这一版里**没有 `serve`**（`--help` 里没有这个命令，包内也没有任何 HTTP 服务端代码），同样没有 `publish` / `sort` —— 文档描述的是更新的版本
- 该版本的 `bin` 指向 `dist/index.js`，而实际文件叫 `dist/index.mjs`，所以 `pnpm hyc` / `hyc` 都是 `command not found`；直接 `node node_modules/@hyacine/cli/dist/index.mjs` 跑，除 `--help` / `-V` 外一律报 `unknown command`
- 这一版里注册的命令有 `new` / `list` / `edit` / `rename` / `move` / `build` / `preview` / `deploy` / `backup` / `status` / `theme:config` / `collections` 等，功能上我们的控制台都已覆盖
- 作者的工具源码在 [github.com/zkz098/hyacine](https://github.com/zkz098/hyacine)（`packages/cli` 是命令行、`apps/console` 是网页端）；翻了下 main 分支，`packages/cli` 里同样还没有 `serve` 的实现，`apps/console` 是配合云端服务的控制台面板 —— 也就是说这套「本地服务 + 认证码」还没接起来，只能等作者发版

等作者发布带 `serve` 的版本再试。真用起来时注意两点：那个网页在**作者的域名**上，16 位认证码相当于对你本地项目的**写权限**，别外传；不启动 `hyc serve` 就完全不会连出去。

---

## 三、写一篇文章

文章就是纯 Markdown，放在 `src/posts/`（可以再用子目录归档）。文件开头的 frontmatter 只有 `title` 和 `date` 是必填：

```yaml
---
title: 文章标题
date: 2026-09-16T15:42:57+08:00
tags: [折腾, 记录]
categories: [折腾]
---
```

用命令建文件时这些字段会自动写好：

```bash
pnpm new-post "文章标题" --tags 折腾,记录 --categories 折腾
pnpm new-post "带子目录的" --folder 技术 --draft
```

### 图片路径怎么填

| 写在哪             | 怎么写                                                                                                    | 结果                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 正文插图（推荐）   | 相对这篇文章的路径：`![](./文章标题.assets/pic.png)`（Typora 默认存法）或 `![](../assets/images/pic.png)` | Astro 自动优化：转成 `_astro/*.webp`、生成 srcset、懒加载 |
| 正文插图（public） | 图片放 `public/images/`，写 `![](/images/pic.png)`                                                        | 原样输出，不经过优化                                      |
| 正文插图（远程）   | `![](https://…/pic.png)`                                                                                  | 原样输出                                                  |

Typora 设置：偏好设置 → 图像 → 选「复制图片到 `./${filename}.assets` 文件夹」+ 勾「优先使用相对路径」。这样插图会自动落在文章同目录的 `文章标题.assets/` 里，引用也是相对路径，最省事。

### 自定义文章封面

在 frontmatter 里加一行 `cover`：

```yaml
---
title: 文章标题
date: 2026-09-16T15:42:57+08:00
cover: ../assets/images/cover-2.avif # 相对这篇文章的路径
---
```

- **相对路径**（`../assets/images/xxx.avif`、`./文章标题.assets/cover.png`）：走 Astro 图片管线，转 webp + srcset；**文件必须真实存在**，写错会让构建失败
- **远程 URL**（`cover: https://…/b.jpg`）：原样使用
- **不写**：用主题默认封面（当前是固定封面 `cover-4`，可在控制台「站点配置 → 导航与页面」里改固定封面 / 轮播 / 渐变）
- ⚠️ **不要写 `/images/xxx.jpg` 这种 public 路径**：主题把 `cover` 交给 Astro 的图片校验，public 路径会让构建直接报 `ImageNotFound`

**在控制台里改封面**：文章列表 → 该篇的「改信息」→「封面」一行，直接填路径或 URL 都行，也可以点「从图库选」从 `src/assets/` 里挑一张（会自动按文章所在层级补好 `../` 前缀）；点「清空（用默认）」恢复默认封面。填了不存在的文件或 public 路径时，控制台会当场拦下并说明原因，不会让你把一个坏封面推上线。

**草稿**：`draft: true` 的文章**连本地预览都不会出现**（页面根本不生成）。所以写不完的就别标草稿，或者标了草稿但知道本地看不到它。

**其它可用字段**：`description`（摘要）、`cover`（封面）、`sticky`（置顶）、`license`（版权协议）、`encrypted` + `password`（构建时加密）。

**公式只写在 `.md` 里**：主题的公式渲染（remarkMath + KaTeX）对 `.md` 生效，在 `.mdx` 里写 `$…$` 或 `$$…$$` 会让构建直接失败（报错信息是含糊的 `Vite module runner has been closed`）。`.mdx` 里要放公式，就用预渲染好的 KaTeX HTML（`node -e` 调 `katex.renderToString(...)` 生成后贴进正文即可）；反过来，MDX 组件（`<Note>` / `<Quiz>` / `<Spoiler>` / `<Tabs>` 等）只有 `.mdx` 能用。另外正文里裸写 `$state` 这种成对的 `$` 也会被当成公式，套上反引号写成 `` `$state` `` 即可。

---

## 四、发布到线上

线上是 GitHub Pages，仓库 `ChihoMN/chihomn.github.io`，由 `.github/workflows/deploy.yml` 负责构建发布。

**推荐路径**：控制台「文章与发布」→ 填/确认提交说明 → **提交并部署**。它会完成 `git add -A` → `commit` → `push`，然后自动轮询 Actions 状态，显示 ✓ 已发布 并给出线上链接。

**等价的手工命令**：

```bash
git add -A
git commit -m "post: 文章标题"
git push site main          # site = https://github.com/ChihoMN/chihomn.github.io.git
```

推送后 Actions 会自动跑：安装依赖（应用 `patches/` 补丁）→ `pnpm build` → 上传产物 → 发布到 Pages，一般 2 分钟左右。进度在 <https://github.com/ChihoMN/chihomn.github.io/actions> 看。

**远端说明**：`origin` 指向主题上游（只作参考，不推），`site` 指向自己的发布仓库。

**首次/换机时需要的一次性设置**：仓库 → Settings → Pages → Source 选 **GitHub Actions**（工作流里的 `configure-pages` 带了 `enablement: true`，通常会自动开启）。推送用的凭据存在 macOS 钥匙串里，classic token 需要 `repo` + `workflow` 两个 scope —— 因为仓库里有 `.github/workflows/`，缺 `workflow` scope 会被拒。

---

## 五、本地开发与检查

| 命令                        | 作用                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                  | 开发服务器，http://localhost:4321 ，改文件热更新              |
| `pnpm build`                | 生产构建：`astro build` + Pagefind 索引，产物在 `dist/`       |
| `pnpm check`                | Astro/TypeScript 类型检查（目前 0 错误）                      |
| `pnpm config-gui`           | 启动控制台（4399）                                            |
| `pnpm config-gui:test`      | 控制台冒烟测试（69 项断言，用 jsdom 真跑一遍界面）            |
| `pnpm config-gui:check`     | 检查配置文件与 `state.json` 是否一致（期望 7 项都「无变化」） |
| `pnpm new-post "标题"`      | 新建文章                                                      |
| `pnpm test`                 | 主题自带的 Vitest 单元测试（`src/**/*.test.ts`）              |
| `pnpm lint` / `pnpm format` | Oxlint / Oxfmt                                                |

**改动这些文件后需要重启 `pnpm dev`**：`hyacine.plugin.ts`、`astro.config.mjs`、`hyacine.yml`（控制台保存时会提示）。

**改控制台本身之后**：`pnpm config-gui:test` 过一遍，再重启控制台进程即可（界面是每次请求现读 `ui.html`，刷新浏览器就行；只有 `server.mjs` 需要重启）。

**换一台机器时**：

```bash
git clone https://github.com/ChihoMN/chihomn.github.io.git blog && cd blog
pnpm install --frozen-lockfile     # 会自动应用 patches/ 里的补丁
pnpm config-gui                    # 需要 Node 24（package.json 里写的是 >=22.12，但 pnpm 11 要求 ≥22.13）
```

---

## 六、目录结构

```
src/posts/            文章（Markdown / MDX），子目录可用来归档
src/assets/           字体与图片（fonts/、images/、storage/ 旧站图片）
src/content/          关于页、公告、友链规则等页面内容
src/theme.config.ts   站点配置（由控制台生成，勿手改）
hyacine.plugin.ts     插件配置（由控制台生成，勿手改）
astro.config.mjs      构建配置（控制台只改其中的 site）
tools/config-gui/     控制台：server.mjs（本地服务）、ui.html（界面）、posts.mjs（文章读写）、generate.mjs（写回配置文件）
tools/new-post.mjs    新建文章命令
tools/hyacine-plugin-visits/  本地插件：页脚访问量显示
patches/              依赖补丁（Waline、Umami）
public/               favicon、.nojekyll、_headers
.github/workflows/    构建发布流程
notes/                主题官方文档摘录（自定义教程、插件系统等，仅本机，未纳入版本控制）
docs/                 上游主题的原始 README
```

---

## 七、本站与主题默认值的差异

主题作者的源码与默认值尽量不动；以下是明确调整过的部分：

- **基础**：站点名「云烟成雨」、副标题、作者 Edward Chen、建站年份 2022、ICP 关闭、社交只留 GitHub
- **字体**：正文 LXGW WenKai、代码 JetBrains Mono（`fontDisplay` 改为 `swap`，避免首屏回到系统字体）；`src/assets/fonts` 里的 MapleMono 保留未用
- **头像**：`src/assets/images/avatar/avatar.jpg`（裁剪版）
- **favicon**：沿用旧站的图标，`public/favicon.svg` + `public/favicon.ico`
- **页脚访问量**：主题的 vercount 插件只注入统计脚本、没有显示位，所以加了本地插件 `tools/hyacine-plugin-visits`（沿用它约定的元素 id）
- **随机文章条数**：`widgets.randomPostsLimit`，本站设为 3（默认值也改成 3）
- **插件**：开启运行时间、鼠标烟花、文章时效提醒、vercount、访问量显示、Umami 统计、Waline 评论、标题切换提醒、音乐播放器、文章统计；AI 摘要关闭
- **依赖补丁**（`patches/`，`pnpm install` 时自动应用）：Waline 初始化参数名错误（`serverURL` → `serverUrl`，否则评论区永远挂载不出来）、Umami 增加 `data-domains`
- **CI**：Node 24（`.nvmrc` 写的 22.12 低于 pnpm 11 要求的 22.13）、`include-hidden-files: true`（否则 `dist/.nojekyll` 会被过滤掉，Jekyll 会吃掉 `_astro/`）

维护约定：主题源码/默认值非必要不改；站点产物里不出现工具与流程的字眼（这类说明只写在源码注释和本文件里）；提交身份用 `ChihoMN <ChihoMN@users.noreply.github.com>`；**个人邮箱在 `state.json` 里只存 ROT13 密文**（这个仓库是公开的），界面上照常填明文、保存时自动编码。

---

## 八、统计与评论

- **页脚访问量（vercount）**：`站点访问量` 是 PV，**每次加载都 +1，自己刷新也算**；`访客数` 是 UV，同一浏览器靠一年期的 cookie 只算一次。所以数字看着「刷一下就涨」是正常现象。
  - 本地 `pnpm dev` 下这个数字**没有意义**：vercount 按域名聚合，`localhost` 是全世界所有用 vercount 的人共用的池子。
  - 旧站用的是 busuanzi，数据不通用，现在的计数从零开始。
- **Umami**：`hyacine.plugin.ts` 里配了 websiteId（`0c6e42de-6c98-4259-b82d-99096d2c1772`）与 `domains: chihomn.github.io`，只有该域名下的访问才计入。去 Umami 后台用这个 id 对应的站点看数据；想在浏览器里排除自己：控制台执行 `localStorage.setItem('umami.disabled', 1)`。
- **Waline 评论**：服务端在 <https://waline-chihomn.vercel.app>（免费实例会休眠，第一次打开评论可能要等几秒），管理员账号是你注册的那个。评论区的挂载依赖上面提到的 Waline 补丁。

---

## 九、备份与体积

- 旧站归档：`/Users/cza/chihomn.github.io-site-archive.tar.gz`
- 全站备份：`/Users/cza/blog-backup-2026-09-15.tar.gz`
- 仓库 `.git` 约 95 MB，主要来自 `src/assets/fonts`（约 42 MB）与 `src/assets/storage`（旧站图片，约 55 MB）

---

## 十、常见问题

**页脚、侧栏某一整块不显示** —— 大多是开发服务器跑太久、模块图陈旧（浏览器控制台能看到动态导入 404）。重启 `pnpm dev` 即可，与配置无关。

**改了配置但页面没变** —— 动了 `hyacine.plugin.ts` / `astro.config.mjs` / `hyacine.yml` 需要重启 dev server；字体相关改动可能需要重启才会纳入新的字符子集。

**文章没出现在列表里** —— 检查 `draft: true`（草稿不生成页面），或 frontmatter 缺少 `title` / `date`。

**推送失败 403** —— 钥匙串里的 token 过期或权限不足（需要 `repo` + `workflow`）。可以先在控制台看日志确认失败原因。

**Actions 挂在 Setup Node.js** —— `.nvmrc` 与 pnpm 版本不匹配，CI 已固定用 Node 24，若报错说明有人改回了 `.nvmrc`。

**评论区空白** —— 确认 `hyacine.plugin.ts` 里 Waline 的 `serverURL` 正确、`patches/` 补丁已应用（`pnpm install --frozen-lockfile` 会应用），以及 Vercel 上的服务是醒着的。

---

## 十一、还没做的事

- `src/posts` 里目前是主题自带的演示文章（15 篇）：清掉，还是留几篇当排版参考，待定
- 旧站文章尚未迁移过来
- 旧站的 `atom.xml` / `feed.json`（现在只有 `rss.xml`）、打赏、旧永久链接与分类 slug 方案

上游主题的原始文档见 `docs/theme-readme.md`（英文）与 `docs/theme-readme.zh-cn.md`（中文），主题的详细配置说明与插件文档在 `notes/`。
