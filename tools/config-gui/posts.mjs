// 文章的读写实现：控制台的「文章」模块与 `pnpm new-post` 命令共用这一份。
//
// 设计原则：
//   · 只读写 src/posts 这棵树里的 .md / .mdx，路径越界一律拒绝；
//   · 改文章信息时只重写 frontmatter 里那几个字段，其它字段与正文一个字都不动；
//   · 不引入 YAML 库，只用行级解析，够用且不会因为格式怪而整篇写坏。

import fs from "node:fs";
import path from "node:path";

/** 界面上可以编辑的 frontmatter 字段（其余字段原样保留） */
export const EDITABLE_FIELDS = [
  "title",
  "date",
  "description",
  "tags",
  "categories",
  "cover",
  "draft",
  "sticky",
];

export const isPostFile = (name) => /\.(md|mdx)$/i.test(name);

/** 标题 → 文件名：空格转连字符，去掉文件名里不能用的字符，中文原样保留 */
export function slugify(title) {
  return String(title)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** 本地时间 + 时区偏移，如 2026-09-16T15:40:00+08:00（schema 只要求能被 Date 解析） */
export function localISO(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  );
}

/** 需要引号包起来的 YAML 标量（标题里带冒号、井号等会破坏解析） */
export function yamlScalar(value) {
  const s = String(value);
  if (s === "") return '""';
  const risky = /^[\s>|*&!%@`{}[\]",#-]|[:#]\s|[:\s]$|\n/.test(s);
  return risky ? JSON.stringify(s) : s;
}

/** 解析 2026-09-16 / 2026-09-16T15:40:00+08:00 之类的日期，失败返回 null */
export function parseDate(value) {
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── frontmatter 行级解析 ────────────────────────────────────────

/** 把 frontmatter 拆成 [{key, lines}] + 正文，保留原有字段顺序 */
export function splitFrontmatter(text) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n)?/.exec(text);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const entries = [];
  let cur = null;
  for (const line of lines) {
    const kv = /^([A-Za-z_][\w-]*):/.exec(line);
    if (kv) {
      cur = { key: kv[1], lines: [line] };
      entries.push(cur);
      continue;
    }
    // 块状数组（- xxx）、多行标量、空行都算作上一个字段的一部分
    if (cur && (/^[ \t]+\S/.test(line) || line.trim() === "")) cur.lines.push(line);
    else cur = null;
  }
  return { entries, body: text.slice(m[0].length) };
}

const stripQuotes = (s) =>
  String(s)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();

/** 取一个字段的值：块状数组 / 行内数组 / 单行标量都能认 */
function readField(entries, key) {
  const entry = entries.find((e) => e.key === key);
  if (!entry) return undefined;
  const rest = entry.lines[0].slice(entry.lines[0].indexOf(":") + 1).trim();
  const block = entry.lines.slice(1).filter((l) => /^[ \t]*-[ \t]*\S/.test(l));
  if (block.length) return block.map((l) => stripQuotes(l.replace(/^[ \t]*-[ \t]*/, "")));
  if (rest === "") return "";
  if (rest.startsWith("[")) {
    const inner = rest.replace(/^\[|\]$/g, "").trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map(stripQuotes)
      .filter((x) => x !== "");
  }
  return stripQuotes(rest);
}

const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === "" ? [] : [String(v)]);

/** 读一篇文章：返回元信息（界面用）与正文之外的原始内容 */
export function parsePost(text, rel) {
  const fm = splitFrontmatter(text);
  const entries = fm?.entries ?? [];
  const date = parseDate(readField(entries, "date") ?? "");
  return {
    path: rel,
    title: String(readField(entries, "title") ?? path.basename(rel).replace(/\.mdx?$/i, "")),
    date: date ? date.toISOString() : null,
    dateRaw: String(readField(entries, "date") ?? ""),
    description: String(readField(entries, "description") ?? ""),
    cover: String(readField(entries, "cover") ?? ""),
    tags: asList(readField(entries, "tags")),
    categories: asList(readField(entries, "categories")),
    draft: readField(entries, "draft") === true || String(readField(entries, "draft")) === "true",
    sticky:
      readField(entries, "sticky") === true || String(readField(entries, "sticky")) === "true",
    hasFrontmatter: Boolean(fm),
  };
}

/** 生成某个字段要写进 frontmatter 的行 */
function fieldLines(key, value) {
  if (key === "tags" || key === "categories") {
    const list = asList(value).map((x) => yamlScalar(x));
    return [`${key}: [${list.join(", ")}]`];
  }
  if (key === "draft" || key === "sticky") {
    return value ? [`${key}: true`] : []; // 为 false 时干脆不写这一行
  }
  if (key === "cover") {
    const v = String(value ?? "").trim();
    return v === "" ? [] : [`cover: ${yamlScalar(v)}`];
  }
  if (key === "date") {
    const d = parseDate(value);
    if (!d) return [];
    return [`date: ${localISO(d)}`];
  }
  const s = String(value ?? "").trim();
  return s === "" ? [] : [`${key}: ${yamlScalar(s)}`];
}

/** 只替换 patch 里给出的字段，其余字段与正文保持原样 */
export function updateFrontmatter(text, patch) {
  const fm = splitFrontmatter(text);
  if (!fm) throw new Error("这篇文章没有 frontmatter，无法在界面上修改信息");
  const replacements = new Map();
  for (const [key, value] of Object.entries(patch)) {
    if (EDITABLE_FIELDS.includes(key)) replacements.set(key, fieldLines(key, value));
  }
  const out = [];
  const done = new Set();
  for (const entry of fm.entries) {
    if (!replacements.has(entry.key)) {
      out.push(...entry.lines);
      continue;
    }
    if (done.has(entry.key)) continue; // 重复字段只留第一次出现的位置
    out.push(...replacements.get(entry.key));
    done.add(entry.key);
  }
  for (const [key, lines] of replacements) {
    if (!done.has(key)) out.push(...lines);
  }
  const block = out.join("\n").replace(/\n+$/, "");
  return `---\n${block}\n---\n${fm.body}`;
}

// ── 文件层 ────────────────────────────────────────────────────

/** 把相对路径限制在 postsDir 里，并确认是文章文件 */
export function safeJoin(postsDir, rel) {
  const clean = String(rel ?? "").replace(/^[/\\]+/, "");
  const abs = path.resolve(postsDir, clean);
  if (abs !== postsDir && !abs.startsWith(postsDir + path.sep))
    throw new Error("路径超出 src/posts");
  if (!isPostFile(abs)) throw new Error("只支持 .md / .mdx 文件");
  return abs;
}

const toRel = (postsDir, abs) => path.relative(postsDir, abs).split(path.sep).join("/");

/** 递归列出所有文章（含子目录），按日期从新到旧 */
export function listPosts(postsDir) {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".") || ent.name.endsWith(".assets")) continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (isPostFile(ent.name)) {
        const text = fs.readFileSync(abs, "utf8");
        const rel = toRel(postsDir, abs);
        out.push({ ...parsePost(text, rel), mtime: fs.statSync(abs).mtimeMs, bytes: text.length });
      }
    }
  };
  walk(postsDir);
  return out.toSorted(
    (a, b) =>
      String(b.date ?? "").localeCompare(String(a.date ?? "")) || a.path.localeCompare(b.path),
  );
}

export function readPost(postsDir, rel) {
  const abs = safeJoin(postsDir, rel);
  if (!fs.existsSync(abs)) throw new Error("文章不存在");
  return fs.readFileSync(abs, "utf8");
}

/** 新建文章：返回相对路径；同名文件已存在时报错，不覆盖 */
export function createPost(
  postsDir,
  { title, slug, tags = [], categories = [], folder = "", cover = "", draft = false, date } = {},
) {
  const name = slugify(slug || title || "");
  if (!name) throw new Error("标题不能为空");
  const sub = String(folder ?? "")
    .trim()
    .replace(/^[/\\]+|[/\\]+$/g, "");
  const dir = sub
    ? safeJoin(postsDir, path.join(sub, "placeholder.md")).replace(/placeholder\.md$/, "")
    : postsDir;
  if (!dir.startsWith(postsDir)) throw new Error("目录超出 src/posts");
  const abs = path.join(dir, `${name}.md`);
  if (fs.existsSync(abs)) throw new Error(`已经有同名文件了：${toRel(postsDir, abs)}`);
  const coverValue = validateCover(postsDir, toRel(postsDir, abs), cover);
  const lines = [
    "---",
    `title: ${yamlScalar(title || name)}`,
    `date: ${localISO(date ? (parseDate(date) ?? new Date()) : new Date())}`,
  ];
  if (asList(tags).length) lines.push(`tags: [${asList(tags).map(yamlScalar).join(", ")}]`);
  if (asList(categories).length)
    lines.push(`categories: [${asList(categories).map(yamlScalar).join(", ")}]`);
  if (coverValue) lines.push(`cover: ${yamlScalar(coverValue)}`);
  if (draft) lines.push("draft: true");
  lines.push("---", "", "");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abs, lines.join("\n"), "utf8");
  return toRel(postsDir, abs);
}

/**
 * 校验封面值：主题把 frontmatter 的 cover 交给 Astro 的 image() 解析，
 * 所以只接受「相对文章文件的路径」（文件必须存在）或远程 URL；
 * 写成 /images/xxx.jpg 这类 public 路径会让 astro build 直接失败（ImageNotFound）。
 */
export function validateCover(postsDir, rel, value) {
  const v = String(value ?? "").trim();
  if (v === "") return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("/")) {
    throw new Error(
      "封面不能用 /images/xxx.jpg 这种 public 路径（构建会报 ImageNotFound），请用相对路径（如 ../assets/images/xxx.jpg）或 https 地址",
    );
  }
  const postAbs = safeJoin(postsDir, rel); // 文章本身必须在 src/posts 内
  const abs = path.resolve(path.dirname(postAbs), v); // 封面可以指向 src/assets（所以在 posts 之外）
  const repoRoot = path.resolve(postsDir, "..", "..");
  if (!abs.startsWith(repoRoot + path.sep)) throw new Error(`封面路径超出了项目目录：${v}`);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `封面文件不存在：${v}（路径要相对于这篇文章，比如 ../assets/images/cover-2.avif）`,
    );
  }
  return v;
}

/** 改文章信息：只动 patch 里给出的字段 */
export function updatePost(postsDir, rel, patch) {
  const abs = safeJoin(postsDir, rel);
  if (!fs.existsSync(abs)) throw new Error("文章不存在");
  const clean = { ...patch };
  if ("cover" in clean) clean.cover = validateCover(postsDir, rel, clean.cover);
  const next = updateFrontmatter(fs.readFileSync(abs, "utf8"), clean);
  fs.writeFileSync(abs, next, "utf8");
  return toRel(postsDir, abs);
}

/** 删除文章；withAssets 为真时连同同目录的 xxx.assets/ 图片目录一起删 */
export function deletePost(postsDir, rel, { withAssets = false } = {}) {
  const abs = safeJoin(postsDir, rel);
  if (!fs.existsSync(abs)) throw new Error("文章不存在");
  const removed = [toRel(postsDir, abs)];
  fs.unlinkSync(abs);
  const assetsDir = abs.replace(/\.mdx?$/i, ".assets");
  if (withAssets && fs.existsSync(assetsDir) && assetsDir.startsWith(postsDir + path.sep)) {
    fs.rmSync(assetsDir, { recursive: true, force: true });
    removed.push(`${toRel(postsDir, assetsDir)}/`);
  }
  return removed;
}
