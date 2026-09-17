// 博客控制台的本地服务：零依赖，只监听 127.0.0.1。
//
//   pnpm config-gui        → 打开 http://127.0.0.1:4399
//
// 三块能力：
//   1. 站点配置：把 state.json 给界面、接收界面改好的状态、调用 generate.mjs 写回项目文件；
//   2. 文章管理：列出 / 新建 / 改信息 / 删除 src/posts 里的文章，可一键用 Typora 打开；
//   3. 构建与部署：本地构建（pnpm build）、本地预览（pnpm dev）、提交并推送（git → GitHub Pages）。
//
// 安全约定：所有能执行命令的地方都是服务端写死的固定命令，界面只能传参数（提交说明、
// 文章字段），永远不能自己拼一条命令出来；文章路径一律限制在 src/posts 内。
// 它不参与站点构建，也不会出现在 dist 里。

import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createPost, deletePost, listPosts, readPost, safeJoin, updatePost } from "./posts.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const statePath = path.join(here, "state.json");
const postsDir = path.join(root, "src/posts");
const PORT = Number(process.env.CONFIG_GUI_PORT ?? 4399);
const DEPLOY_REMOTE = "site";
const DEPLOY_BRANCH = "main";
let iconCache = null;

/** 列出可选资产：字体与图片（图片递归扫描，支持 images/cover、images/avatar 这类子目录） */
function listAssets() {
  const assetsDir = path.join(root, "src/assets");
  const fontsDir = path.join(assetsDir, "fonts");
  const IMAGE_EXTS = [".avif", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
  const read = (dir, exts) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => exts.some((e) => f.toLowerCase().endsWith(e)))
          .map((f) => ({ name: f, rel: path.relative(assetsDir, path.join(dir, f)) }))
      : [];

  const images = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (IMAGE_EXTS.some((e) => ent.name.toLowerCase().endsWith(e))) {
        images.push({
          name: ent.name,
          rel: path.relative(assetsDir, abs).split(path.sep).join("/"),
        });
      }
    }
  };
  if (fs.existsSync(assetsDir)) walk(assetsDir);

  return {
    fonts: read(fontsDir, [".ttf", ".otf", ".woff2"]),
    images: images.toSorted((a, b) => a.rel.localeCompare(b.rel)),
  };
}

/** 扫描文章 frontmatter，列出真实存在的分类（界面里直接挑，避免手写名字对不上） */
function listCategories() {
  const found = new Set();
  for (const post of safeListPosts()) {
    for (const c of post.categories) if (c && c !== "${folder}") found.add(c);
  }
  return [...found].sort();
}

/** 列出文章（含 git 状态标记），失败时不让界面白屏 */
function safeListPosts() {
  try {
    return listPosts(postsDir);
  } catch (e) {
    console.error("读取文章列表失败：" + e.message);
    return [];
  }
}

// ── git ───────────────────────────────────────────────────────

/** 跑一条 git 命令（固定参数，不经 shell） */
function git(args, { allowFail = true } = {}) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.join(" ")} 失败：${out}`);
  return { code: r.status, out };
}

/** 从 site 远端地址里取出 owner/repo，用于查 Actions 运行状态 */
function repoSlug() {
  const { out } = git(["remote", "get-url", DEPLOY_REMOTE]);
  const m = /github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?$/.exec(out);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** 工作区状态：改了什么、领先远端多少、建议的提交说明 */
function gitStatus() {
  const porcelain = git(["status", "--porcelain=v1", "-b"]);
  const lines = porcelain.out.split("\n").filter(Boolean);
  const head = lines.shift() ?? "";
  const branch = /^##\s+([^\s.]+)/.exec(head)?.[1] ?? "";
  const changed = lines.map((l) => ({ status: l.slice(0, 2).trim(), file: l.slice(3).trim() }));

  // 与「部署远端」比较（当前分支的 upstream 是主题上游，跟发布无关）
  const remoteRef = `refs/remotes/${DEPLOY_REMOTE}/${DEPLOY_BRANCH}`;
  const hasRemote = git(["rev-parse", "--verify", "--quiet", remoteRef]).code === 0;
  const count = (range) =>
    hasRemote ? Number(git(["rev-list", "--count", range]).out.trim() || 0) || 0 : 0;
  const ahead = count(`${remoteRef}..HEAD`);
  const behind = count(`HEAD..${remoteRef}`);
  const last = git(["log", "-1", "--format=%h%x09%s"]).out;
  const [shortSha, subject] = last.split("\t");

  // 建议的提交说明：只有一篇文章改动就写那篇的标题，否则按数量概括
  const touchedPosts = changed
    .map((c) => c.file)
    .filter((f) => f.startsWith("src/posts/") && /\.mdx?$/i.test(f))
    .map((f) => f.slice("src/posts/".length).replace(/\.mdx?$/i, ""));
  const byPath = new Map(safeListPosts().map((p) => [p.path.replace(/\.mdx?$/i, ""), p.title]));
  let suggestion = "chore: 站点内容更新";
  if (touchedPosts.length === 1)
    suggestion = `post: ${byPath.get(touchedPosts[0]) ?? touchedPosts[0]}`;
  else if (touchedPosts.length > 1) suggestion = `post: 更新 ${touchedPosts.length} 篇文章`;
  else if (changed.length > 0) suggestion = "chore: 站点更新";

  return {
    branch,
    ahead,
    behind,
    changed,
    lastCommit: shortSha ? { sha: shortSha, subject } : null,
    suggestion,
    repo: repoSlug(),
  };
}

// ── 任务（构建 / 预览 / 部署）─────────────────────────────────

let job = null;
let currentChild = null;

const JOB_LOG_LIMIT = 200_000;
const appendLog = (text) => {
  if (!job) return;
  job.log += text;
  if (job.log.length > JOB_LOG_LIMIT) job.log = job.log.slice(job.log.length - JOB_LOG_LIMIT);
};

/** 起一个子进程并把输出接到任务日志 */
function stream(file, args, { shell = false, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: root,
      shell,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...env },
    });
    currentChild = child;
    child.stdout?.on("data", (d) => onOutput(d.toString()));
    child.stderr?.on("data", (d) => onOutput(d.toString()));
    child.on("error", (e) => {
      appendLog(`\n[启动失败] ${e.message}\n`);
      resolve(-1);
    });
    child.on("close", (code) => {
      if (currentChild === child) currentChild = null;
      resolve(code ?? 0);
    });
  });
}

/** 输出里的开发服务器地址抓出来，界面上直接点 */
function onOutput(text) {
  appendLog(text);
  const m = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?/.exec(text);
  if (m && job && !job.url) job.url = m[0];
}

function startJob(kind, label, task) {
  if (job && job.status === "running")
    throw new Error("已经有一个任务在跑，先等它结束或点「停止」");
  job = {
    kind,
    label,
    status: "running",
    log: "",
    code: null,
    url: null,
    sha: null,
    startedAt: Date.now(),
    endedAt: null,
    stopped: false,
  };
  const started = job;
  Promise.resolve()
    .then(() =>
      task({
        shell: (command, opts) => stream("/bin/sh", ["-lc", command], opts),
        run: (args, opts = {}) => {
          appendLog(`\n$ ${["git", ...args].join(" ")}\n`);
          return stream("git", args, opts);
        },
        log: appendLog,
        stopped: () => started.stopped,
      }),
    )
    .then((code) => {
      started.code = typeof code === "number" ? code : 0;
      started.status = started.stopped ? "stopped" : started.code === 0 ? "done" : "failed";
    })
    .catch((e) => {
      appendLog(`\n[出错] ${e.message}\n`);
      started.code = 1;
      started.status = "failed";
    })
    .finally(() => {
      started.endedAt = Date.now();
      if (currentChild) currentChild = null;
    });
  return job;
}

const jobView = () =>
  job && {
    kind: job.kind,
    label: job.label,
    status: job.status,
    code: job.code,
    url: job.url,
    sha: job.sha,
    log: job.log,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
  };

/** 本地构建：astro build + pagefind 索引 */
function jobBuild() {
  return startJob("build", "本地构建", async (ctx) => {
    ctx.log(`$ pnpm build（工作目录 ${root}）\n`);
    const code = await ctx.shell("pnpm build");
    if (code === 0) ctx.log("\n✓ 构建通过，产物在 dist/（这一步只是本地检查，不会改动线上站点）\n");
    return code;
  });
}

/** 本地预览：已经在跑就直接指过去，否则起一个 pnpm dev */
async function jobPreview() {
  const running = await probePort(4321);
  if (running) {
    startJob("preview", "本地预览", async (ctx) => {
      ctx.log("4321 端口上已经有一个开发服务器在跑，直接用它。\n");
      job.url = "http://localhost:4321/";
      return 0;
    });
    return;
  }
  startJob("preview", "本地预览", async (ctx) => {
    ctx.log("$ pnpm dev（改完文章刷新浏览器即可；点「停止」结束）\n");
    const code = await ctx.shell("pnpm dev");
    // astro 发现端口上已经有开发服务器时会自己退出，这时把那个地址当成结果
    if (code !== 0 && job.url && /already running|already in use/i.test(job.log)) {
      ctx.log("\n已经有一个开发服务器在跑，直接用它。\n");
      return 0;
    }
    return code;
  });
}

/** 探测端口上是否已经有服务在监听（IPv4 与 IPv6 回环都试一遍） */
async function probePort(port) {
  for (const host of ["127.0.0.1", "::1"]) {
    if (await probe(host, port)) return true;
  }
  return false;
}

function probe(host, port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port: Number(port) });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(600);
    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  });
}

/** 提交并推送：git add → commit → push，成功后交给 GitHub Actions 构建发布 */
function jobDeploy(message) {
  const note =
    String(message ?? "").trim() || `chore: 站点更新 ${new Date().toLocaleString("zh-CN")}`;
  return startJob("deploy", "提交并部署", async (ctx) => {
    ctx.log(`提交说明：${note}\n`);
    const add = await ctx.run(["add", "-A"]);
    if (add !== 0) return add;

    const staged = git(["diff", "--cached", "--quiet"]).code !== 0;
    const remoteRef = `refs/remotes/${DEPLOY_REMOTE}/${DEPLOY_BRANCH}`;
    const hasRef = git(["rev-parse", "--verify", "--quiet", remoteRef]).code === 0;
    const ahead = hasRef
      ? Number(git(["rev-list", "--count", `${remoteRef}..HEAD`]).out.trim() || 0) || 0
      : 0;
    if (!staged && ahead === 0) {
      ctx.log("\n工作区是干净的，远端也已经是最新，没有需要发布的改动。\n");
      return 0;
    }
    if (staged) {
      const commit = await ctx.run(["commit", "-m", note]);
      if (commit !== 0) return commit;
    } else {
      ctx.log(`\n没有新的改动，但有 ${ahead} 个提交还没推上去，直接推送。\n`);
    }
    if (ctx.stopped()) return 1;

    const push = await ctx.run(["push", DEPLOY_REMOTE, DEPLOY_BRANCH]);
    if (push !== 0) {
      ctx.log(
        "\n推送失败。如果提示权限问题，检查一下 git 凭据（钥匙串里的 GitHub token 是否过期）。\n",
      );
      return push;
    }
    job.sha = git(["rev-parse", "HEAD"]).out.trim();
    ctx.log(`\n✓ 已推送 ${job.sha.slice(0, 7)}，GitHub Actions 正在构建，大约 2 分钟。\n`);
    return 0;
  });
}

/** 查这次提交在 GitHub 上的运行状态（未登录的公开接口） */
async function deployRun(sha) {
  const slug = repoSlug();
  if (!slug || !sha) return { ok: false, reason: "no-remote" };
  const url = `https://api.github.com/repos/${slug}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=5`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/vnd.github+json", "user-agent": "blog-console" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok)
      return {
        ok: false,
        reason: res.status === 403 ? "rate-limit" : `http-${res.status}`,
        repo: slug,
      };
    const data = await res.json();
    const run = (data.workflow_runs ?? []).find((r) => r.head_sha === sha);
    if (!run) return { ok: true, pending: true, repo: slug };
    return {
      ok: true,
      repo: slug,
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url,
      name: run.name,
      updatedAt: run.updated_at,
    };
  } catch (e) {
    return { ok: false, reason: e.name === "TimeoutError" ? "timeout" : e.message };
  }
}

// ── HTTP ──────────────────────────────────────────────────────

/** 按扩展名给 MIME（图片与字体预览用） */
function mimeOf(file) {
  return (
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
    }[path.extname(file).toLowerCase()] ?? "application/octet-stream"
  );
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

/** 文章列表 + 每篇文章的未提交状态 */
function postsPayload() {
  const status = gitStatus();
  const dirty = new Map();
  for (const c of status.changed) if (c.file.startsWith("src/posts/")) dirty.set(c.file, c.status);
  return {
    posts: safeListPosts().map((p) => ({
      ...p,
      gitStatus: dirty.get(`src/posts/${p.path}`) ?? null,
    })),
    categories: listCategories(),
    git: status,
  };
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
    const name = (url.searchParams.get("name") ?? "")
      .replace(/^i-ri-/, "")
      .replace(/[^a-z0-9-]/gi, "");
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
      res.writeHead(200, {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "max-age=3600",
      });
      return res.end(svg);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      return res.end("图标集读取失败：" + e.message);
    }
  }

  // 读取项目里的资产文件（供界面预览图片与字体）
  if (req.method === "GET" && (url.pathname === "/asset" || url.pathname === "/pubasset")) {
    // /asset 读 src/assets（文章图片、字体），/pubasset 读 public（首页封面这类 web 路径）
    const fromPublic = url.pathname === "/pubasset";
    const base = path.join(root, fromPublic ? "public" : "src/assets");
    const rel = (url.searchParams.get("rel") ?? "").replace(/^\/+/, "");
    const abs = path.resolve(base, rel);
    if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("404");
    }
    const buf = fs.readFileSync(abs);
    res.writeHead(200, {
      "content-type": mimeOf(abs),
      "content-length": buf.length,
      "cache-control": "no-cache",
    });
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
    readBody(req).then((payload) => {
      if (!payload) return sendJson(res, 400, { ok: false, log: "状态不是合法 JSON" });
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

  // ── 文章管理 ────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/posts") {
    try {
      return sendJson(res, 200, { ok: true, ...postsPayload() });
    } catch (e) {
      return sendJson(res, 500, { ok: false, log: e.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/posts/read") {
    try {
      const rel = url.searchParams.get("path") ?? "";
      return sendJson(res, 200, { ok: true, path: rel, content: readPost(postsDir, rel) });
    } catch (e) {
      return sendJson(res, 400, { ok: false, log: e.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/posts/create") {
    readBody(req).then((body) => {
      if (!body) return sendJson(res, 400, { ok: false, log: "请求不是合法 JSON" });
      try {
        const rel = createPost(postsDir, body);
        if (body.open !== false) openInEditor(path.join(postsDir, rel));
        return sendJson(res, 200, {
          ok: true,
          path: rel,
          log: `已创建 src/posts/${rel}`,
          ...postsPayload(),
        });
      } catch (e) {
        return sendJson(res, 400, { ok: false, log: e.message });
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/posts/update") {
    readBody(req).then((body) => {
      if (!body) return sendJson(res, 400, { ok: false, log: "请求不是合法 JSON" });
      try {
        const rel = updatePost(postsDir, body.path, body.patch ?? {});
        return sendJson(res, 200, {
          ok: true,
          path: rel,
          log: `已更新 src/posts/${rel}`,
          ...postsPayload(),
        });
      } catch (e) {
        return sendJson(res, 400, { ok: false, log: e.message });
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/posts/delete") {
    readBody(req).then((body) => {
      if (!body) return sendJson(res, 400, { ok: false, log: "请求不是合法 JSON" });
      try {
        const removed = deletePost(postsDir, body.path, { withAssets: body.withAssets !== false });
        return sendJson(res, 200, {
          ok: true,
          log: `已删除 ${removed.join("、")}`,
          ...postsPayload(),
        });
      } catch (e) {
        return sendJson(res, 400, { ok: false, log: e.message });
      }
    });
    return;
  }

  // 用 Typora（没装就用系统默认程序）打开文章
  if (req.method === "POST" && url.pathname === "/api/posts/open") {
    readBody(req).then((body) => {
      try {
        const abs = safeJoin(postsDir, body?.path ?? "");
        if (!fs.existsSync(abs)) throw new Error("文章不存在");
        const how = openInEditor(abs);
        return sendJson(res, 200, { ok: true, log: `已用 ${how} 打开 src/posts/${body.path}` });
      } catch (e) {
        return sendJson(res, 400, { ok: false, log: e.message });
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/git") {
    try {
      return sendJson(res, 200, { ok: true, ...gitStatus() });
    } catch (e) {
      return sendJson(res, 500, { ok: false, log: e.message });
    }
  }

  // ── 构建 / 预览 / 部署 ──────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/job") {
    return sendJson(res, 200, { ok: true, job: jobView() });
  }

  if (req.method === "POST" && url.pathname === "/api/job/build") {
    try {
      jobBuild();
      return sendJson(res, 200, { ok: true, job: jobView() });
    } catch (e) {
      return sendJson(res, 409, { ok: false, log: e.message, job: jobView() });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/job/preview") {
    try {
      sendAsync(jobPreview(), res);
      return;
    } catch (e) {
      return sendJson(res, 409, { ok: false, log: e.message, job: jobView() });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/job/deploy") {
    readBody(req).then((body) => {
      try {
        jobDeploy(body?.message);
        return sendJson(res, 200, { ok: true, job: jobView() });
      } catch (e) {
        return sendJson(res, 409, { ok: false, log: e.message, job: jobView() });
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/job/stop") {
    if (job?.status === "running") {
      job.stopped = true;
      currentChild?.kill("SIGTERM");
      setTimeout(() => currentChild?.kill("SIGKILL"), 3000).unref?.();
      return sendJson(res, 200, { ok: true, log: "已请求停止", job: jobView() });
    }
    return sendJson(res, 200, { ok: true, log: "当前没有正在跑的任务", job: jobView() });
  }

  if (req.method === "GET" && url.pathname === "/api/deploy/run") {
    deployRun(url.searchParams.get("sha") ?? "").then((r) => sendJson(res, 200, r));
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("404");
});

/** 把异步任务的失败也回给界面（预览要先探测端口，所以是异步的） */
function sendAsync(promise, res) {
  promise
    .then(() => sendJson(res, 200, { ok: true, job: jobView() }))
    .catch((e) => sendJson(res, 409, { ok: false, log: e.message, job: jobView() }));
}

/** 优先用 Typora 打开，没装就退回系统默认程序 */
function openInEditor(abs) {
  const typora = spawnSync("open", ["-a", "Typora", abs], { encoding: "utf8" });
  if (typora.status === 0) return "Typora";
  spawnSync("open", [abs]);
  return "系统默认程序";
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`博客控制台已启动：http://127.0.0.1:${PORT}`);
  console.log("「站点配置」改完点「保存并写入」；「文章」里可以直接新建、改信息、构建和部署。");
  console.log("（hyacine.plugin.ts / astro.config.mjs / hyacine.yml 的改动需重启开发服务器）");
});
