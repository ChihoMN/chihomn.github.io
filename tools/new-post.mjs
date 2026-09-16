#!/usr/bin/env node
// 新建一篇文章：生成带好 frontmatter 的 src/posts/xxx.md，然后直接用 Typora 打开写正文。
//
//   pnpm new-post "标题" [--slug 自定义文件名] [--tags a,b] [--categories 技术] [--folder 技术] [--draft]
//
// 与博客控制台「文章」模块共用 tools/config-gui/posts.mjs，只负责建文件，不碰任何已有文章。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPost } from "./config-gui/posts.mjs";

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
  console.error(
    '用法：pnpm new-post "文章标题" [--slug 文件名] [--tags 标签1,标签2] [--categories 分类] [--folder 子目录] [--draft]',
  );
  process.exit(1);
}

const list = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

let rel;
try {
  rel = createPost(postsDir, {
    title,
    slug: flags.get("slug") ?? "",
    folder: flags.get("folder") ?? "",
    tags: list(flags.get("tags")),
    categories: list(flags.get("categories")),
    draft: flags.get("draft") === "true",
  });
} catch (e) {
  console.error(`没能创建文章：${e.message}`);
  process.exit(1);
}

const slug = path.basename(rel).replace(/\.mdx?$/i, "");
console.log(`已创建：src/posts/${rel}`);
console.log("");
console.log("接下来：");
console.log(
  `  1. 用 Typora 打开这个文件写正文（图片建议放在同目录的 ${slug}.assets/ 里，插入时选相对路径）`,
);
console.log("  2. pnpm dev        —— 本地预览，改完刷新即可（或直接点控制台的「本地预览」）");
console.log(`  3. git add -A && git commit -m "post: ${title}" && git push site main`);
console.log(
  "     —— 推送后 GitHub Actions 会自动构建并发布到 https://chihomn.github.io （约 2 分钟）",
);
if (flags.get("draft") === "true") {
  console.log("");
  console.log(
    "注意：draft: true 的文章本地预览时也不会出现（整个页面不会被生成），写完了把它删掉或改成 false 再推。",
  );
}
