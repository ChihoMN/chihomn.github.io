// 配置 GUI 的生成器：把 state.json 写回项目文件。
//
// 托管六个文件：
//   src/theme.config.ts        —— 主题配置（只写你覆盖的字段，其余走主题默认）
//   hyacine.plugin.ts          —— 插件开关与选项
//   astro.config.mjs           —— 只改 site（站点网址）
//   hyacine.yml                —— 只改 fonts（字体角色）与 images 的第一项（头像）
//   src/content/announcement.md—— 首屏公告卡片
//   src/content/about.mdx      —— 关于页（正文、对话文案、联系方式段）
//
// 用法：
//   node tools/config-gui/generate.mjs          写入
//   node tools/config-gui/generate.mjs --check  只报告会改什么，不写

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const statePath = path.join(here, "state.json");
const CHECK = process.argv.includes("--check");

const GENERATED_BY =
  "此文件由配置 GUI 生成（tools/config-gui）—— 请用 `pnpm config-gui` 修改，勿手工编辑";

/** 读取状态 */
function readState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

/** 资产路径归一化：给裸文件名补上 src/assets/ 前缀 */
function assetPath(p) {
  if (!p) return p;
  return p.startsWith("src/") ? p : `src/assets/${p}`;
}

/** 生成 src/theme.config.ts —— JSON 字面量本身是合法的 TS 表达式 */
function genThemeConfig(state) {
  const body = JSON.stringify(state.theme ?? {}, null, 2);
  return `// ${GENERATED_BY}
// cannot use path alias here because unocss can not resolve it
import { defineConfig } from "./toolkit/themeConfig";

export default defineConfig(${body});
`;
}

/** 生成 hyacine.plugin.ts */
function genPluginConfig(state) {
  const p = state.plugins ?? {};
  const imports = [];
  const localImports = []; // 本地插件（不是 @hyacine/* 包）的 import 语句
  const calls = [];

  const on = (k) => p[k]?.enabled !== false;

  if (on("siteUptime")) {
    imports.push("siteUptime");
    const o = p.siteUptime ?? {};
    calls.push(
      `    siteUptime({\n      siteCreatedAt: ${JSON.stringify(o.siteCreatedAt ?? "")},\n      prefixText: ${JSON.stringify(o.prefixText ?? "本站已运行")},\n    })`,
    );
  }
  if (on("mouseFirework")) {
    imports.push("mouseFirework");
    const o = p.mouseFirework ?? {};
    calls.push(
      `    mouseFirework({\n      count: ${Number(o.count ?? 16)},\n      radius: ${Number(o.radius ?? 80)},\n    })`,
    );
  }
  if (on("articleAgeWarning")) {
    imports.push("articleAgeWarning");
    const o = p.articleAgeWarning ?? {};
    calls.push(
      `    articleAgeWarning({\n      maxAgeDays: ${Number(o.maxAgeDays ?? 180)},\n    })`,
    );
  }
  if (on("vercount")) {
    imports.push("vercount");
    calls.push("    vercount()");
    // 作者的 vercount 只注入统计脚本、没有显示界面（全历史都没有占位元素），
    // 这里用本地插件补上页脚/文章页的数字，不改作者源码
    localImports.push('import visits from "./tools/hyacine-plugin-visits";');
    calls.push("    visits()");
  }
  if (on("analytics")) {
    imports.push("analytics");
    const o = p.analytics ?? {};
    calls.push(
      `    analytics({\n      googleAnalytics: {\n        measurementId: ${JSON.stringify(o.googleAnalytics?.measurementId ?? "")},\n      },\n      umami: {\n        websiteId: ${JSON.stringify(o.umami?.websiteId ?? "")},\n        scriptUrl: ${JSON.stringify(o.umami?.scriptUrl ?? "")},\n        domains: ${JSON.stringify(umamiDomains(state))},\n      },\n    })`,
    );
  }
  if (on("walineComments")) {
    imports.push("walineComments");
    const o = p.walineComments ?? {};
    calls.push(
      `    walineComments({\n      serverURL: ${JSON.stringify(o.serverURL ?? "")},\n      lang: ${JSON.stringify(o.lang ?? "zh-CN")},\n    })`,
    );
  }
  if (p.aiContent !== undefined) {
    imports.push("aiContent");
    calls.push(`    aiContent({\n      enable: ${p.aiContent?.enabled === true},\n    })`);
  }
  if (p.visibilityTitle !== undefined) {
    imports.push("visibilityTitle");
    const o = p.visibilityTitle ?? {};
    calls.push(
      `    visibilityTitle({\n      enable: ${o.enabled !== false},\n      leaveTitle: ${JSON.stringify(o.leaveTitle ?? "")},\n      returnTitle: ${JSON.stringify(o.returnTitle ?? "")},\n      restoreDelay: ${Number(o.restoreDelay ?? 3000)},\n    })`,
    );
  }
  if (p.nyxPlayer !== undefined) {
    imports.push("nyxPlayer");
    const o = p.nyxPlayer ?? {};
    const urls = JSON.stringify(o.urls ?? [], null, 2)
      .split("\n")
      .map((line, i) => (i === 0 ? line : "      " + line))
      .join("\n");
    calls.push(
      `    nyxPlayer({\n      enable: ${o.enabled !== false},\n      urls: ${urls},\n      preset: ${JSON.stringify(o.preset ?? "shokax")},\n      darkModeTarget: ":root[data-theme=dark]",\n      metingBaseURL: "https://meting.api.zkz098.cn/",\n      metingUrlSource: "outer",\n    })`,
    );
  }
  if (on("articleStatistics")) {
    imports.push("articleStatistics");
    calls.push("    articleStatistics()");
  }

  const importLines = [
    ...localImports,
    ...imports.map(
      (name) =>
        `import ${name} from "@hyacine/plugin-${name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}";`,
    ),
  ].join("\n");

  return `// ${GENERATED_BY}
import { defineConfig } from "@hyacine/plugin-core";
${importLines}

export default defineConfig({
  injectPoints: {
    "footer-status": {
      selector: "#footer .status",
      position: "append",
    },
    "post-header": {
      selector: "article.post header",
      position: "after",
    },
    "post-footer": {
      selector: "article.post .body",
      position: "after",
    },
  },
  plugins: [
${calls.join(",\n")},
  ],
});
`;
}

/** 改写 astro.config.mjs 里的 site */
function patchAstroConfig(src, url) {
  return src.replace(
    /^(\s*)site:\s*(?:"[^"]*"|'[^']*'|`[^`]*`)/m,
    `$1site: ${JSON.stringify(url)}`,
  );
}

/** 改写 hyacine.yml 里的 fonts 与 images 第一项 */
function patchHyacineYml(src, state) {
  const std = state.fonts?.standard;
  const mono = state.fonts?.monospace;
  const fontLines = [
    "fonts:",
    std ? `  - path: ${assetPath(std)}\n    type: standard` : null,
    mono ? `  - path: ${assetPath(mono)}\n    type: monospace` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let out = src.replace(/^fonts:\s*\n(?:[ \t]+.*\n)+/m, fontLines + "\n");

  // images 整块重建：头像放第一项，其余沿用原有条目并去重
  const avatarRel = assetPath(state.avatar);
  const imgMatch = out.match(/^images:\s*\n((?:[ \t]+.*\n)*)/m);
  if (imgMatch) {
    const existing = imgMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- path:"))
      .map((l) => l.slice("- path:".length).trim());
    const rest = existing.filter((p) => p && p !== avatarRel);
    const block = `images:\n${[avatarRel, ...rest].map((p) => `  - path: ${p}`).join("\n")}\n`;
    out = out.replace(/^images:\s*\n((?:[ \t]+.*\n)*)/m, block);
  }
  return out;
}

/** 改写 Images.astro 里的头像导入 —— 这才是真正决定头像显示的地方 */
function patchImagesAstro(src, state) {
  const re = /^import avatarImg from "@\/assets\/[^"]+";/m;
  if (!re.test(src)) {
    throw new Error("src/components/Images.astro 里没找到头像导入行，无法应用头像设置");
  }
  return src.replace(re, `import avatarImg from "@/assets/${state.avatar}";`);
}

/** Umami 的 data-domains：优先用界面里填的，留空则自动取站点网址的域名（于是本地预览不计入） */
function umamiDomains(state) {
  const explicit = String(state.plugins?.analytics?.umami?.domains ?? "").trim();
  if (explicit) return explicit;
  try {
    return new URL(String(state.site?.url ?? "")).hostname;
  } catch {
    return "";
  }
}

/** ROT13（自反：编码与解码是同一个操作） */
function rot13(text) {
  return String(text ?? "").replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/** 生成关于页的「联系方式」段落：state 里存的就是 ROT13 密文，直接写进页面并附上解密说明 */
function genContactSection(cipherText) {
  const cipher = String(cipherText ?? "").trim();
  if (!cipher) return "{/* contact-email:start */}\n{/* contact-email:end */}";
  return `{/* contact-email:start */}
## 联系方式

我的邮箱是下面这串——**它被 ROT13 编码过**，照抄是发不出去的：

\`\`\`
${cipher}
\`\`\`

**怎么解**：把每个英文字母往后推 13 位（\`a\`→\`n\`、\`b\`→\`o\`、\`l\`→\`y\`……），\`@\` 和 \`.\` 原样不动。
不想手推的话，搜「ROT13 解码」，随便点一个在线工具把这串贴进去即可。

> 为什么这样写：博客上直接放明文邮箱，很快会被爬虫收走，随之而来的就是无穷无尽的垃圾邮件。
> 上面这串的字母全部移位过了，爬虫抓到的会是一个**发不出去的地址**。
{/* contact-email:end */}`;
}

/** 替换关于页里被标记的「联系方式」段落 */
function patchAboutMdx(src, state) {
  const re = /\{\/\* contact-email:start \*\/\}[\s\S]*?\{\/\* contact-email:end \*\/\}/;
  if (!re.test(src)) {
    throw new Error("src/content/about.mdx 里没找到 contact-email 标记，无法写入联系方式");
  }
  return src.replace(re, genContactSection(state.contact?.emailCipher));
}

// ── 页面内容：公告卡片与关于页 ────────────────────────────────
// 这两份以前只能手改文件。现在正文与对话文案都在 state.content 里，
// 由这里生成；想改文字去配置 GUI 的「页面内容」一区。

/** 关于页 frontmatter 的日期：由配置给，留空则用今天 */
function aboutDates(about) {
  const today = new Date().toISOString().slice(0, 10);
  const date = String(about.date ?? "").trim() || today;
  const updated = String(about.updated ?? "").trim() || date;
  return { date, updated };
}

/** 生成 src/content/announcement.md */
function genAnnouncement(state) {
  const a = state.content?.announcement;
  if (!a) throw new Error("state.json 里没有 content.announcement，拒绝写出空的公告文件");
  const title = a.title ?? "站点公告";
  return `---\ntitle: ${title}\n---\n\n${String(a.body ?? "").trim()}\n`;
}

/** 对话节点的分支结构是固定的，只有答复文字可改（在 GUI 里改） */
const DIALOG_BRANCHES = {
  intro: [
    { label: "你是谁？", reply: "先介绍一下你自己吧。", nextId: "identity" },
    { label: "这个博客在写什么？", reply: "这个站点主要会分享什么内容？", nextId: "blog" },
    { label: "技术栈是什么？", reply: "这个站点是怎么搭建的？", nextId: "stack" },
    { label: "怎么联系你？", reply: "如果我想联系你，应该怎么做？", nextId: "contact" },
  ],
  identity: [
    { label: "继续：你平时最关注什么？", reply: "你平时最关注哪些方向？", nextId: "focus" },
    { label: "返回话题菜单", reply: "换个话题。", nextId: "intro" },
  ],
  focus: [{ label: "返回话题菜单", reply: "明白了，回到主菜单。", nextId: "intro" }],
  blog: [{ label: "返回话题菜单", reply: "了解了，看看其他问题。", nextId: "intro" }],
  stack: [{ label: "返回话题菜单", reply: "技术栈很清晰，回到主菜单。", nextId: "intro" }],
  contact: [{ label: "返回话题菜单", reply: "收到，我再看看其他内容。", nextId: "intro" }],
};

/** 生成 src/content/about.mdx（整份文件） */
function genAboutMdx(state) {
  const about = state.content?.about;
  if (!about) throw new Error("state.json 里没有 content.about，拒绝写出空的关于页");
  const dialog = about.dialog ?? {};
  const nodes = dialog.nodes ?? {};
  const { date, updated } = aboutDates(about);

  const nodesSrc = Object.entries(DIALOG_BRANCHES)
    .map(([id, options]) => {
      const text = String(nodes[id] ?? "");
      const opts = options
        .map(
          (o) =>
            `      {\n        label: ${JSON.stringify(o.label)},\n        reply: ${JSON.stringify(o.reply)},\n        nextId: ${JSON.stringify(o.nextId)},\n      },`,
        )
        .join("\n");
      return `  {\n    id: ${JSON.stringify(id)},\n    text: ${JSON.stringify(text)},\n    options: [\n${opts}\n    ],\n  },`;
    })
    .join("\n");

  return `---
title: ${about.title ?? "关于"}
description: ${about.description ?? ""}
date: ${date}
updated: ${updated}
---

import AboutDialog from "@/components/AboutDialog";
import themeConfig from "@/theme.config";
import { avatar } from "@/components/Images.astro";

export const aboutAuthorName = themeConfig.sidebar?.author || "作者";
export const aboutAuthorAvatar = avatar.src;

export const aboutDialogNodes = [
${nodesSrc}
];

${String(about.body ?? "").trim()}

<AboutDialog
  client:load
  title=${JSON.stringify(dialog.title ?? "快速对话")}
  intro=${JSON.stringify(dialog.intro ?? "")}
  authorName={aboutAuthorName}
  authorAvatar={aboutAuthorAvatar}
  nodes={aboutDialogNodes}
/>

${genContactSection(state.contact?.emailCipher)}
`;
}

/** 主流程 */
function run() {
  const state = readState();
  const targets = [
    { file: "src/theme.config.ts", content: genThemeConfig(state) },
    { file: "hyacine.plugin.ts", content: genPluginConfig(state) },
    {
      file: "astro.config.mjs",
      content: patchAstroConfig(
        fs.readFileSync(path.join(root, "astro.config.mjs"), "utf8"),
        state.site?.url,
      ),
    },
    {
      file: "hyacine.yml",
      content: patchHyacineYml(fs.readFileSync(path.join(root, "hyacine.yml"), "utf8"), state),
    },
    {
      file: "src/content/about.mdx",
      content: genAboutMdx(state),
    },
    {
      file: "src/content/announcement.md",
      content: genAnnouncement(state),
    },
    {
      file: "src/components/Images.astro",
      content: patchImagesAstro(
        fs.readFileSync(path.join(root, "src/components/Images.astro"), "utf8"),
        state,
      ),
    },
  ];

  const changes = [];
  for (const t of targets) {
    const abs = path.join(root, t.file);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
    if (before === t.content) {
      changes.push(`  = ${t.file}（无变化）`);
      continue;
    }
    changes.push(`  ${CHECK ? "~" : "✎"} ${t.file}`);
    if (!CHECK) fs.writeFileSync(abs, t.content);
  }

  console.log(CHECK ? "检查模式（未写入）：" : "已写入：");
  console.log(changes.join("\n"));

  // 提示：plugin / site / yml 的改动不会热重载
  console.log(
    "\n注意：hyacine.plugin.ts、astro.config.mjs、hyacine.yml 的改动需要重启开发服务器才生效。",
  );
}

run();
