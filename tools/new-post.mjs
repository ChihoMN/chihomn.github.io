#!/usr/bin/env node
// 新建一篇文章：生成带好 frontmatter 的 src/posts/xxx.md，然后直接用 Typora 打开写正文。
//
//   pnpm new-post "标题" [--slug 自定义文件名] [--tags a,b] [--categories 技术] [--folder 技术] [--draft]
//
// 只负责建文件和写头部字段，不碰任何已有文章。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "src", "posts");

const argv = process.argv.slice(2);
const flags = new Map();
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--draft") flags.set("draft", "true");
  else if (arg.startsWith("--")) flags.set(arg.slice(2), argv[++i] ?? "");
  else rest.push(arg);
}

const title = rest.join(" ").trim();
if (!title) {
  console.error('用法：pnpm new-post "文章标题" [--slug 文件名] [--tags 标签1,标签2] [--categories 分类] [--folder 子目录] [--draft]');
  process.exit(1);
}

const toSlug = (text) =>
  text
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

const slug = (flags.get("slug") || toSlug(title)) || "post";
const folder = (flags.get("folder") || "").trim().replace(/^\/|\/$/g, "");
const dir = folder ? path.join(postsDir, folder) : postsDir;
const file = path.join(dir, `${slug}.md`);

if (fs.existsSync(file)) {
  console.error(`已经存在同名的文章，换个标题或用 --slug 指定文件名：\n  ${path.relative(root, file)}`);
  process.exit(1);
}

// 本地时间 + 时区偏移，写成 2026-09-16T15:40:00+08:00 这种格式（schema 只要求能被 Date 解析）
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const offsetMin = -now.getTimezoneOffset();
const sign = offsetMin >= 0 ? "+" : "-";
const date =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
  `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`;

const list = (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const lines = ["---", `title: ${title}`, `date: ${date}`];
const tags = list(flags.get("tags") ?? "");
if (tags.length) lines.push(`tags: [${tags.join(", ")}]`);
const categories = list(flags.get("categories") ?? "");
if (categories.length) lines.push(`categories: [${categories.join(", ")}]`);
if (flags.get("draft") === "true") lines.push("draft: true");
lines.push("---", "", "");

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, lines.join("\n"), "utf8");

const rel = path.relative(root, file);
console.log(`已创建：${rel}`);
console.log("");
console.log("接下来：");
console.log(`  1. 用 Typora 打开这个文件写正文（图片建议放在同目录的 ${slug}.assets/ 里，插入时选相对路径）`);
console.log("  2. pnpm dev        —— 本地预览，改完刷新即可");
console.log(`  3. git add -A && git commit -m "post: ${title}" && git push site main`);
console.log("     —— 推送后 GitHub Actions 会自动构建并发布到 https://chihomn.github.io （约 2 分钟）");
if (flags.get("draft") === "true") {
  console.log("");
  console.log("注意：draft: true 的文章本地预览时也不会出现（整个页面不会被生成），写完了把它删掉或改成 false 再推。");
}
