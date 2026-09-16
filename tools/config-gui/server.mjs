// 配置 GUI 的本地服务：零依赖，只监听 127.0.0.1。
//
//   pnpm config-gui        → 打开 http://127.0.0.1:4399
//
// 它只做三件事：把 state.json 给界面、接收界面改好的状态、调用 generate.mjs 写回项目文件。
// 不参与站点构建，也不会出现在 dist 里。

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const statePath = path.join(here, "state.json");
const PORT = Number(process.env.CONFIG_GUI_PORT ?? 4399);
let iconCache = null;

/** 列出可选资产：字体与图片 */
function listAssets() {
  const fontsDir = path.join(root, "src/assets/fonts");
  const assetsDir = path.join(root, "src/assets");
  const imagesDir = path.join(assetsDir, "images");
  const read = (dir, exts) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => exts.some((e) => f.toLowerCase().endsWith(e)))
          .map((f) => ({ name: f, rel: path.relative(assetsDir, path.join(dir, f)) }))
      : [];

  return {
    fonts: read(fontsDir, [".ttf", ".otf", ".woff2"]),
    images: [
      ...read(assetsDir, [".avif", ".png", ".jpg", ".jpeg", ".webp"]),
      ...read(imagesDir, [".avif", ".png", ".jpg", ".jpeg", ".webp"]).map((x) => ({
        name: x.name,
        rel: `images/${x.name}`,
      })),
    ],
  };
}

/** 扫描文章 frontmatter，列出真实存在的分类（界面里直接挑，避免手写名字对不上） */
function listCategories() {
  const postsDir = path.join(root, "src/posts");
  if (!fs.existsSync(postsDir)) return [];
  const found = new Set();
  const strip = (s) => s.trim().replace(/^["']|["']$/g, "").trim();
  for (const file of fs.readdirSync(postsDir)) {
    if (!/\.mdx?$/i.test(file)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(postsDir, file), "utf8");
    } catch {
      continue;
    }
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
    if (!fm) continue;
    // categories: [A, B] 或 categories: 换行 - A
    const inline = /^categories:[ \t]*\[(.*?)\]/m.exec(fm);
    if (inline) {
      for (const c of inline[1].split(",")) {
        const v = strip(c);
        if (v) found.add(v);
      }
      continue;
    }
    const block = /^categories:[ \t]*\r?\n((?:[ \t]*-[ \t]*.+\r?\n?)+)/m.exec(fm);
    if (block) {
      for (const line of block[1].split("\n")) {
        const v = strip(line.replace(/^[ \t]*-[ \t]*/, ""));
        if (v) found.add(v);
      }
    }
  }
  return [...found].sort();
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const html = fs.readFileSync(path.join(here, "ui.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  // 提供 Remix Icon 图标（界面上的社媒图标直接取自项目里的图标集）
  if (req.method === "GET" && url.pathname === "/icon") {
    const name = (url.searchParams.get("name") ?? "").replace(/^i-ri-/, "").replace(/[^a-z0-9-]/gi, "");
    try {
      if (!iconCache) {
        iconCache = JSON.parse(
          fs.readFileSync(path.join(root, "node_modules/@iconify-json/ri/icons.json"), "utf8"),
        );
      }
      const ic = iconCache.icons?.[name];
      if (!ic) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end("404 no such icon");
      }
      const w = iconCache.width ?? 24;
      const h = iconCache.height ?? 24;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="#333" color="#333">${ic.body}</svg>`;
      res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "max-age=3600" });
      return res.end(svg);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      return res.end("图标集读取失败：" + e.message);
    }
  }

  // 读取项目里的资产文件（供界面预览图片与字体）
  if (req.method === "GET" && url.pathname === "/asset") {
    const rel = url.searchParams.get("rel") ?? "";
    const base = path.join(root, "src/assets");
    const abs = path.resolve(base, rel);
    if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("404");
    }
    const ext = path.extname(abs).toLowerCase();
    const mime =
      {
        ".avif": "image/avif",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
        ".woff2": "font/woff2",
      }[ext] ?? "application/octet-stream";
    const buf = fs.readFileSync(abs);
    res.writeHead(200, { "content-type": mime, "content-length": buf.length, "cache-control": "no-cache" });
    return res.end(buf);
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, {
      state: JSON.parse(fs.readFileSync(statePath, "utf8")),
      assets: listAssets(),
      categories: listCategories(),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/save") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { ok: false, log: "状态不是合法 JSON" });
      }
      try {
        fs.writeFileSync(statePath, JSON.stringify(payload, null, 2) + "\n");
      } catch (e) {
        return sendJson(res, 500, { ok: false, log: `写入 state.json 失败：${e.message}` });
      }
      const r = spawnSync(process.execPath, [path.join(here, "generate.mjs")], {
        cwd: root,
        encoding: "utf8",
      });
      const log = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
      return sendJson(res, r.status === 0 ? 200 : 500, { ok: r.status === 0, log });
    });
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("404");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`配置 GUI 已启动：http://127.0.0.1:${PORT}`);
  console.log("改完点「保存并写入」，项目文件会被重新生成。");
  console.log("（hyacine.plugin.ts / astro.config.mjs / hyacine.yml 的改动需重启开发服务器）");
});
