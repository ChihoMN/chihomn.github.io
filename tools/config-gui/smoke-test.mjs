// 配置 GUI 的冒烟测试：用 jsdom 真跑一遍 ui.html，确认表单能渲染、显示的是你的真实配置、没有前端错误。
//
//   node tools/config-gui/smoke-test.mjs
//
// 为什么需要它：页面纯前端渲染，语法没错不代表运行时不出错。
// 已经抓到过两次这类问题：
//   1. const 的暂时性死区（SCHEMA 引用了后面才声明的常量）→ 整页空白，服务端日志毫无异常
//   2. 界面错把「主题默认值」当当前值显示 → 一保存就会清空你的配置

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "ui.html"), "utf8");
const state = JSON.parse(fs.readFileSync(path.join(here, "state.json"), "utf8"));

const assets = {
  fonts: [
    { name: "LXGWWenKai-Regular.ttf", rel: "fonts/LXGWWenKai-Regular.ttf" },
    { name: "JetBrainsMono-Regular.ttf", rel: "fonts/JetBrainsMono-Regular.ttf" },
    { name: "MapleMono-CN-Regular.ttf", rel: "fonts/MapleMono-CN-Regular.ttf" },
  ],
  images: [
    { name: "avatar-default.avif", rel: "avatar-default.avif" },
    { name: "avatar-old.png", rel: "avatar-old.png" },
    { name: "cover-1.avif", rel: "images/cover-1.avif" },
    { name: "avatar.jpg", rel: "images/avatar.jpg" },
  ],
};

// 文章模块用的假数据：两篇（一篇已发布带未提交改动、一篇草稿）
const stubPosts = {
  ok: true,
  posts: [
    {
      path: "hello-world.md",
      title: "Hello World!",
      date: "2025-12-06T04:00:00.000Z",
      dateRaw: "2025-12-06",
      description: "第一篇",
      tags: ["welcome", "astro"],
      categories: ["Getting Started"],
      draft: false,
      sticky: false,
      hasFrontmatter: true,
      gitStatus: "M",
      mtime: 1,
      bytes: 100,
    },
    {
      path: "Untitled.md",
      title: "测试文章",
      date: "2024-03-11T13:37:00.000Z",
      dateRaw: "2024-03-11T21:37:00+08:00",
      description: "",
      tags: [],
      categories: [],
      draft: true,
      sticky: false,
      hasFrontmatter: true,
      gitStatus: null,
      mtime: 2,
      bytes: 200,
    },
  ],
  categories: ["Getting Started", "测试"],
  git: {
    branch: "main",
    ahead: 1,
    changed: [{ status: "M", file: "src/posts/hello-world.md" }],
    lastCommit: { sha: "abc1234", subject: "post: Hello World!" },
    suggestion: "post: Hello World!",
    repo: "ChihoMN/chihomn.github.io",
  },
};

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  beforeParse(window) {
    window.confirm = () => false; // 弹窗在 jsdom 里没实现，测试时按「取消」处理
    // 注意：必须给页面一份深拷贝。页面里的 collect() 会就地修改 state，
    // 若共用同一对象，测试自己的期望值会被改写，导致断言莫名失败。
    window.fetch = async (url) => {
      const u = String(url);
      const body = u.includes("/api/state")
        ? {
            state: structuredClone(state),
            assets,
            categories: ["Tutorial", "Frontend", "公告", "测试", "开发", "指南"],
          }
        : u.includes("/api/posts")
          ? structuredClone(stubPosts)
          : u.includes("/api/job")
            ? { ok: true, job: null }
            : { ok: true, log: "stub" };
      return { json: async () => body };
    };
  },
});

await new Promise((r) => setTimeout(r, 300));

const doc = dom.window.document;
const ctrl = (p) => doc.querySelector(`.ctrl[data-path="${p}"]`);
const textOf = (p) => {
  const w = ctrl(p);
  if (!w) return null;
  const t = w.querySelector('input[type="text"]');
  if (t) return t.value;
  return w.querySelector('input[type="number"], textarea, select')?.value ?? null;
};
const boolOf = (p) => ctrl(p)?.querySelector('input[type="checkbox"]')?.checked ?? null;

const fields = doc.querySelectorAll(".field").length;
const sections = doc.querySelectorAll("section").length;
const overrides = doc.querySelectorAll(".override").length;
const log = doc.getElementById("log")?.textContent?.trim() ?? "";

const thumbs = doc.querySelectorAll(".thumb").length;
const fontPreviews = doc.querySelectorAll(".font-preview").length;
const checkedAvatar =
  doc.querySelector('.ctrl[data-path="avatar"] input[type="radio"]:checked')?.value ?? null;

console.log(
  `  区块数: ${sections}   字段数: ${fields}   「已覆盖」标记: ${overrides}` +
    `   图片卡片: ${thumbs}   字体预览: ${fontPreviews}`,
);
if (log) console.log(`  页面提示: ${log}`);

// 社媒字段：模拟填链接 → 调用 collect() → 检查生成的对象
const socialRows = doc.querySelectorAll(".social-row").length;
const socialIconSrc = doc.querySelector(".social-row .social-icon")?.getAttribute("src") ?? "";
const ghInput = doc.querySelector('.social-row input[data-key="github"]');
const mailInput = doc.querySelector('.social-row input[data-key="email"]');
let socialOut = null;
if (ghInput && mailInput) {
  ghInput.value = "https://github.com/ChihoMN";
  mailInput.value = "mailto:test@example.com";
  socialOut = dom.window.collect?.()?.theme?.sidebar?.social ?? null;
}
console.log(
  `  社媒平台行数: ${socialRows}   首个图标: ${socialIconSrc}   往返结果: ${JSON.stringify(socialOut)}`,
);

// 断言：界面显示的是 state.json 里的值，而不是主题默认值
// 颜色控件联动回归测试：在色板里挑颜色，文本框必须同步，且保存时以文本框为准
const colorWrap = doc.querySelector('.ctrl[data-path="tagCloud.startColor"]');
const colorPick = colorWrap?.querySelector('input[type="color"]');
const colorText = colorWrap?.querySelector('input[type="text"]');
const colorSel = colorWrap?.querySelector("select");
const colorOrig = colorText?.value ?? "";
let pickSynced = null;
let pickSaved = null;
if (colorPick && colorText) {
  colorPick.value = "#123456";
  colorPick.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  pickSynced = colorText.value;
  pickSaved = dom.window.collect?.()?.theme?.tagCloud?.startColor ?? null;
}
// 再测反向：下拉选 token → 文本框同步
let selSynced = null;
if (colorSel && colorText) {
  colorSel.value = "var(--color-pink)";
  colorSel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  selSynced = colorText.value;
}
// 测完还原，避免影响后面的取值检查
if (colorText) {
  colorText.value = colorOrig;
  colorText.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}
console.log(`  颜色联动: 色板→文本框 ${pickSynced}，保存值 ${pickSaved}；下拉→文本框 ${selSynced}`);

// ── 列表编辑器：以前要在文本框里手写结构化 JSON 的几处，现在逐项填 ──
const listOf = (p) => ctrl(p)?.querySelector(".list");
const rowsOf = (p) =>
  [...(listOf(p)?.querySelector(".list-body")?.children ?? [])].filter((el) =>
    el.hasAttribute("data-row"),
  );
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
const setInput = (el, v) => {
  el.value = v;
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
};
const addBtn = (p) =>
  [...(listOf(p)?.querySelectorAll(".list-tools button") ?? [])].find(
    (b) => b.dataset.listAdd !== undefined,
  );
const field = (row, key) => row.querySelector(`.list-fields [data-key="${key}"]`);
const themeOf = () => dom.window.collect?.()?.theme ?? {};

const jsonBoxes = doc.querySelectorAll('.ctrl[data-type="json"]').length;
// 列表里的「描述」是多行框，属正常；要确认的是"没有多出来的、需要手写 JSON 的多行框"
// 多行框现在不止副标题（公告正文、关于页正文、对话答复都是），改判"没有游离在字段外的多行框"
const strayTextareas = [...doc.querySelectorAll("#form textarea")].filter(
  (t) => !t.dataset.key && !t.closest(".field"),
).length;
const catRows = rowsOf("home.selectedCategories").length;
const navRows = rowsOf("nav").length;
const navSubRows = listOf("nav")?.querySelectorAll(".list.nested [data-row]").length ?? 0;
// 友链条数跟着 state.json 走：配置里有覆盖就用覆盖的条数，没有就是主题默认 4 条
const friendBase = state.theme?.friends?.links?.length ?? 4;
const friendRows = rowsOf("friends.links").length;
const playlistRows = rowsOf("nyxPlayer.urls").length;
const orderRows = rowsOf("layout.rightSidebar.order").length;
const iconPreviews = doc.querySelectorAll(".icon-prev").length;
// 子菜单每行的标题应显示自己的文字（而不是"未填"）
const navSubTitles = [...(listOf("nav")?.querySelectorAll(".list.nested .list-title") ?? [])]
  .map((e) => e.textContent.trim())
  .join("/");

// ── 页面内容：公告与关于页（以前只能手改文件，现在在界面上编辑）──
const sectionByTitle = (t) =>
  [...doc.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent.trim() === t);
const contentFields = sectionByTitle("页面内容")?.querySelectorAll(".field").length ?? 0;
const annTitle = textOf("content.announcement.title") ?? "";
const annBody = textOf("content.announcement.body") ?? "";
const aboutBody = textOf("content.about.body") ?? "";
const stackAnswer = textOf("content.about.dialog.nodes.stack") ?? "";
let aboutBodySaved = null;
{
  const box = ctrl("content.about.body")?.querySelector("textarea");
  if (box) {
    const orig = box.value;
    setInput(box, orig + "\n\n（测试追加一行）");
    aboutBodySaved = String(dom.window.collect?.()?.content?.about?.body ?? "").includes(
      "测试追加一行",
    );
    setInput(box, orig);
  }
}

// 分类名对不上文章里的分类时要标黄
let missFlagged = false;
const catFirst = rowsOf("home.selectedCategories")[0];
if (catFirst) {
  const inp = field(catFirst, "name");
  const orig = inp.value;
  setInput(inp, "这个分类不存在");
  missFlagged = catFirst.classList.contains("miss");
  setInput(inp, orig);
}

// 友链：加一行 → 填值 → 保存结果里应多一条；删掉后回到原来的条数
let friendAfterAdd = null,
  friendAddedTitle = null,
  friendAfterDel = null;
if (addBtn("friends.links")) {
  click(addBtn("friends.links"));
  const row = rowsOf("friends.links").at(-1);
  setInput(field(row, "title"), "小明的小站");
  setInput(field(row, "url"), "https://xiaoming.example/");
  const out = themeOf().friends?.links ?? null;
  friendAfterAdd = out?.length ?? null;
  friendAddedTitle = out?.at(-1)?.title ?? null;
  click(row.querySelector("[data-list-del]"));
  friendAfterDel = themeOf().friends?.links?.length;
}

// 导航：把第二项（关于）上移，顺序要跟着变
let navAfterMove = null;
{
  const rows = rowsOf("nav");
  click(rows[1].querySelector("[data-list-up]"));
  navAfterMove = themeOf().nav?.[0]?.text ?? null;
  click(rowsOf("nav")[0].querySelector("[data-list-down]")); // 上移后它在 0 位，挪回来要按新位置
}

// 把带下拉子菜单的那一项（文章）挪一下：父项的文字/链接/图标必须还是它自己的，
// 不能被子菜单的值顶掉（这里曾经出过 bug：父项被最后一个子项覆盖成"归档"）
let navMovedText = null,
  navMovedSubs = null,
  navMovedFirstSub = null,
  navUntouched = null;
{
  const rows = rowsOf("nav");
  const i = rows.findIndex((r) => r.querySelector(".list.nested [data-row]"));
  if (i > 0) {
    click(rows[i].querySelector("[data-list-up]"));
    const out = themeOf().nav ?? [];
    navMovedText = out[i - 1]?.text ?? null;
    navMovedSubs = out[i - 1]?.dropbox?.items?.length ?? null;
    navMovedFirstSub = out[i - 1]?.dropbox?.items?.[0]?.text ?? null;
    click(rowsOf("nav")[i - 1].querySelector("[data-list-down]")); // 上移后该项在 i-1，挪回来要按它的新位置
  }
  // 挪回原位后应与主题默认完全一致 → 不该留下任何覆盖
  navUntouched = themeOf().nav === undefined ? "无覆盖" : "有覆盖";
}

// 右栏顺序：搜索上移一位
let orderAfterMove = null;
{
  const rows = rowsOf("layout.rightSidebar.order");
  const i = rows.findIndex((r) => r.dataset.orderId === "search");
  click(rows[i].querySelector("[data-list-up]"));
  orderAfterMove = themeOf().layout?.rightSidebar?.order?.[0] ?? null;
}

// 封面列表（字符串数组）与歌单
let coverOut = null,
  playlistAfterAdd = null;
if (addBtn("cover.coverUrls")) {
  click(addBtn("cover.coverUrls"));
  const row = rowsOf("cover.coverUrls").at(-1);
  setInput(field(row, "__v"), "images/cover-1.avif");
  coverOut = themeOf().cover?.coverUrls?.[0] ?? null;
}
if (addBtn("nyxPlayer.urls")) {
  click(addBtn("nyxPlayer.urls"));
  const row = rowsOf("nyxPlayer.urls").at(-1);
  setInput(field(row, "name"), "第二个歌单");
  setInput(field(row, "url"), "https://music.163.com/#/playlist?id=1");
  playlistAfterAdd = dom.window.collect?.()?.plugins?.nyxPlayer?.urls?.length ?? null;
}

// 社媒自定义项：加一行 → 应合并进 sidebar.social
let socialExtraOut = null;
{
  const list = doc.querySelector('.ctrl[data-path="sidebar.social"] .social-extra .list');
  const add = [...(list?.querySelectorAll(".list-tools button") ?? [])].find(
    (b) => b.dataset.listAdd !== undefined,
  );
  if (add) {
    click(add);
    const row = [...list.querySelector(".list-body").children].at(-1);
    setInput(field(row, "key"), "pixiv");
    setInput(field(row, "icon"), "i-ri-pixiv-fill");
    setInput(field(row, "url"), "https://pixiv.example/");
    socialExtraOut = themeOf().sidebar?.social?.pixiv?.url ?? null;
  }
}

console.log(
  `  列表编辑器: 分类 ${catRows} 行 / 导航 ${navRows} 行（含 ${navSubRows} 个子项）/ 友链 ${friendRows} 行` +
    ` / 歌单 ${playlistRows} 行 / 右栏顺序 ${orderRows} 行；手写 JSON 框 ${jsonBoxes} 个`,
);

// ── 文章与发布模块 ────────────────────────────────────────────
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const postRows = () => [...doc.querySelectorAll(".post-row")];
const tabPosts = doc.querySelector('.tab[data-tab="posts"]');
const tabConfig = doc.querySelector('.tab[data-tab="config"]');

// 默认停在站点配置页，文章页是隐藏的
const tabCount = doc.querySelectorAll(".tab").length;
const defaultTab = {
  configVisible: !doc.getElementById("view-config").hidden,
  postsHidden: doc.getElementById("view-posts").hidden,
};

// 切到「文章与发布」：列表、git 摘要、分类候选都要出来
click(tabPosts);
await tick(150);
const postsVisible = !doc.getElementById("view-posts").hidden;
const configHiddenWhenPosts = doc.getElementById("view-config").hidden;
const saveHiddenOnPostsTab = doc.getElementById("save").hidden;
const postRowCount = postRows().length;
const draftBadges = doc.querySelectorAll(".post-row .badge.draft").length;
const changedBadges = doc.querySelectorAll(".post-row .badge.changed").length;
const postCountText = doc.getElementById("post-count").textContent.trim();
const gitSummaryText = doc.getElementById("git-summary").textContent;
const commitMsg = doc.getElementById("commit-msg").value;
const catOptions = doc.querySelectorAll("#cats option").length;

// 三颗按钮 + 初始状态
const actionButtons = ["btn-preview", "btn-build", "btn-deploy"].every((id) =>
  doc.getElementById(id),
);
const deployEnabled = doc.getElementById("btn-deploy").disabled === false;
const stopDisabled = doc.getElementById("btn-stop").disabled === true;
const newPostFields = [
  "np-title",
  "np-slug",
  "np-folder",
  "np-categories",
  "np-tags",
  "np-draft",
  "btn-create",
].filter((id) => doc.getElementById(id)).length;

// 改信息：点开编辑器 → 字段带出当前值 → 取消后收起
click(postRows()[0].querySelector("[data-post-edit]"));
const editor = postRows()[0].querySelector(".post-editor");
const editorTitle = editor?.querySelector('[data-edit="title"]')?.value ?? null;
const editorDate = editor?.querySelector('[data-edit="date"]')?.value ?? null;
click(postRows()[0].querySelector("[data-editor-cancel]"));
const editorClosed = postRows()[0].querySelector(".post-editor") === null;

// 筛选：只看草稿 1 篇；搜索「测试」也是 1 篇
const scopeSel = doc.getElementById("post-scope");
scopeSel.value = "draft";
scopeSel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
const draftFiltered = postRows().length;
scopeSel.value = "all";
scopeSel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
const filterInput = doc.getElementById("post-filter");
setInput(filterInput, "测试");
const searched = postRows().length;
setInput(filterInput, "");
const restored = postRows().length;

// 切回站点配置页，原来的表单与按钮要复原
click(tabConfig);
await tick(120);
const backToConfig =
  !doc.getElementById("view-config").hidden &&
  doc.getElementById("view-posts").hidden &&
  doc.getElementById("save").hidden === false;

const checks = [
  ["站点名 = 你的值", textOf("siteName"), state.theme.siteName],
  [
    "副标题 = 你的值",
    (textOf("brand.subtitle") ?? "").slice(0, 6),
    state.theme.brand.subtitle.slice(0, 6),
  ],
  ["建站年份 = 2022", textOf("footer.since"), String(state.theme.footer.since)],
  ["标签云起始色 = 你的值", textOf("tagCloud.startColor"), state.theme.tagCloud.startColor],
  ["ICP 开关 = 关闭", boolOf("footer.icp.enable"), false],
  [
    "运行时间起始 = 你的值",
    textOf("siteUptime.siteCreatedAt"),
    state.plugins.siteUptime.siteCreatedAt,
  ],
  ["头像卡片数 = 候选图数", thumbs, assets.images.length],
  ["头像选中项 = 当前值", checkedAvatar, state.avatar],
  ["字体预览数 = 2", fontPreviews, 2],
  ["社媒平台行数 = 25", socialRows, 25],
  ["社媒图标走 /icon 路由", socialIconSrc.startsWith("/icon?name="), true],
  ["社媒只填链接即生成配置", socialOut?.github?.url, "https://github.com/ChihoMN"],
  ["社媒图标名自动带上", socialOut?.github?.icon, "i-ri-github-fill"],
  ["社媒邮箱项正确", socialOut?.email?.url, "mailto:test@example.com"],
  ["留空的平台不写入配置", socialOut && Object.keys(socialOut).length, 2],
  ["色板改色会同步到文本框", pickSynced, "#123456"],
  ["色板改色能真正保存", pickSaved, "#123456"],
  ["下拉选 token 会同步到文本框", selSynced, "var(--color-pink)"],
  ["已无手写 JSON 的字段", jsonBoxes, 0],
  ["多行框都在带标签的字段里", strayTextareas, 0],
  ["首页分类 = 2 行", catRows, 2],
  ["导航 = 6 行", navRows, 6],
  ["导航下拉子项 = 3 个", navSubRows, 3],
  ["友链行数 = 配置里的条数", friendRows, friendBase],
  ["歌单 = 1 行", playlistRows, 1],
  ["右栏顺序 = 6 行", orderRows, 6],
  ["图标有预览图", iconPreviews > 0, true],
  ["子菜单标题显示自己的文字", navSubTitles, "分类/标签/归档"],
  ["分类名对不上会标黄", missFlagged, true],
  ["页面内容区字段数", contentFields, 15],
  ["公告标题 = 配置值", annTitle, state.content.announcement.title],
  ["公告正文 = 配置值", annBody.slice(0, 12), state.content.announcement.body.slice(0, 12)],
  ["关于页正文 = 配置值", aboutBody.slice(0, 12), state.content.about.body.slice(0, 12)],
  [
    "对话答复 = 配置值",
    stackAnswer.slice(0, 12),
    state.content.about.dialog.nodes.stack.slice(0, 12),
  ],
  ["改关于页正文会写回配置", aboutBodySaved, true],
  ["加一行后友链 +1", friendAfterAdd, friendBase + 1],
  ["新行的值确实写进去了", friendAddedTitle, "小明的小站"],
  ["删掉后回到配置里的条数", friendAfterDel, friendBase],
  ["导航上移生效", navAfterMove, "关于"],
  ["导航父项不被子菜单顶掉", navMovedText, "文章"],
  ["子菜单 3 项仍在", navMovedSubs, 3],
  ["子菜单第一项仍是分类", navMovedFirstSub, "分类"],
  ["挪回原位后不留覆盖", navUntouched, "无覆盖"],
  ["右栏上移生效", orderAfterMove, "search"],
  ["封面列表写进配置", coverOut, "images/cover-1.avif"],
  ["加歌单后变 2 条", playlistAfterAdd, 2],
  ["社媒自定义项合并进 social", socialExtraOut, "https://pixiv.example/"],
  ["页签数量 = 2", tabCount, 2],
  ["默认停在站点配置页", `${defaultTab.configVisible}/${defaultTab.postsHidden}`, "true/true"],
  ["切到文章页后可见", `${postsVisible}/${configHiddenWhenPosts}`, "true/true"],
  ["文章页上隐藏保存按钮", saveHiddenOnPostsTab, true],
  ["文章列表 = 2 行", postRowCount, 2],
  ["草稿有标记", draftBadges, 1],
  ["未提交改动有标记", changedBadges, 1],
  ["文章计数文案", postCountText, "共 2 篇"],
  ["git 摘要列出改动文件", gitSummaryText.includes("src/posts/hello-world.md"), true],
  ["提交说明自动带建议", commitMsg, "post: Hello World!"],
  ["分类候选来自服务端", catOptions, 2],
  ["预览/构建/部署三颗按钮都在", actionButtons, true],
  ["部署按钮可用、停止按钮初始禁用", `${deployEnabled}/${stopDisabled}`, "true/true"],
  ["新建表单字段齐全 = 7", newPostFields, 7],
  ["改信息能展开并带出标题", editorTitle, "Hello World!"],
  ["改信息带出日期", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(editorDate)), true],
  ["取消后编辑器收起", editorClosed, true],
  ["只看草稿筛出 1 篇", draftFiltered, 1],
  ["搜索标题筛出 1 篇", searched, 1],
  ["清空筛选恢复 2 篇", restored, 2],
  ["切回配置页后按钮复原", backToConfig, true],
];

let bad = 0;
let badValues = 0;
for (const [name, got, want] of checks) {
  const ok = String(got) === String(want);
  if (!ok) {
    bad++;
    badValues++;
  }
  console.log(
    `  ${ok ? "✓" : "✗"} ${name}  (显示 ${JSON.stringify(got)}${ok ? "" : "，应为 " + JSON.stringify(want)})`,
  );
}

// 关于页是给访客看的，不许出现工具链的字眼（工具的话写在源码注释里）
const aboutPath = path.resolve(here, "../../src/content/about.mdx");
const TOOL_WORDS = ["配置 GUI", "config-gui", "tools/", "state.json", "generate.mjs", "ui.html"];
let aboutSrc = "";
try {
  aboutSrc = fs.readFileSync(aboutPath, "utf8");
} catch {
  console.log("  – 关于页不存在，跳过工具痕迹检查");
}
if (aboutSrc) {
  const hits = TOOL_WORDS.filter((w) => aboutSrc.includes(w));
  const ok = hits.length === 0;
  if (!ok) bad++;
  console.log(
    `  ${ok ? "✓" : "✗"} 关于页无工具痕迹  (${ok ? "干净" : "命中 " + JSON.stringify(hits)})`,
  );
}

if (fields === 0) {
  console.error("\n✗ 表单没有渲染");
  process.exit(1);
}
if (log.startsWith("✗")) {
  console.error("\n✗ 页面报错：" + log);
  process.exit(1);
}
if (badValues > 0) {
  console.error(
    `\n✗ ${badValues} 项显示值不对（界面显示的可能是默认值而非你的配置，那样保存会清空配置）`,
  );
}
if (bad > badValues) {
  console.error("\n✗ 关于页混进了工具链的字眼——那是给访客看的页面，这类说明只写在源码注释里");
}
if (bad > 0) {
  process.exit(1);
}
console.log("\n✓ 冒烟测试通过");
