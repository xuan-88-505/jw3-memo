/**
 * 桌面版一键更新的服务端。
 *
 * - `GET /api/update/:target/:arch/:current`：Tauri 更新插件的「动态服务器」格式。
 *   读 GitHub Release 里的 latest.json，有新版本返回 200 和
 *   `{version, notes, pub_date, url, signature}`，没有返回 204。
 *   下载地址改成本服务器的 `/api/update/file/...`，国内用户不用直连 GitHub。
 * - `GET /api/update/file/:tag/:name`：转发 GitHub Release 里的安装包。
 *   只转发本仓库、版本标签和更新包后缀都符合规则的文件。
 *
 * 读不到 latest.json 时返回 503，客户端会改问第二个地址（GitHub 上的 latest.json）。
 * 安装包的签名由客户端用内置公钥校验，这里不需要也不能改动文件内容。
 */
import { Readable } from "node:stream";
import type { Express, Response } from "express";
import { compareSemver, parseSemver } from "@shared/semver";

export { compareSemver, parseSemver };

export const UPDATE_REPO = "xuan-88-505/jw3-memo";
/** 已发布网站的地址。下载地址必须是完整网址，不能用请求里的 Host 拼 */
export const UPDATE_PUBLIC_ORIGIN = "https://tongdiao-k5ujnxu8.manus.space";
const MANIFEST_URL = `https://github.com/${UPDATE_REPO}/releases/latest/download/latest.json`;
const RELEASE_DOWNLOAD = `https://github.com/${UPDATE_REPO}/releases/download/`;

/** latest.json 缓存 5 分钟；GitHub 读不到时，1 天内的旧缓存还能用 */
const MANIFEST_TTL_MS = 5 * 60 * 1000;
const MANIFEST_STALE_MS = 24 * 60 * 60 * 1000;
/** 同时转发的下载最多几个，超过返回 503 */
const MAX_DOWNLOADS = 16;

const TARGETS = new Set(["windows", "darwin", "linux"]);
const ARCHES = new Set(["x86_64", "i686", "aarch64", "armv7"]);
const TAG_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
/** 只转发更新包：Windows 安装程序和 Mac 的 .app.tar.gz */
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:-setup\.exe|\.app\.tar\.gz)$/;
const RFC3339_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** GitHub Release 的下载地址改成本服务器的转发地址；不是本仓库的地址原样返回 */
export function mirrorUrl(url: string, origin = UPDATE_PUBLIC_ORIGIN) {
  if (!url.startsWith(RELEASE_DOWNLOAD)) return url;
  const [tag, name, ...rest] = url.slice(RELEASE_DOWNLOAD.length).split("/");
  if (rest.length || !tag || !name) return url;
  if (!TAG_RE.test(tag) || !FILE_RE.test(name)) return url;
  return `${origin}/api/update/file/${tag}/${name}`;
}

export function isMirrorFile(tag: string, name: string) {
  return TAG_RE.test(tag) && FILE_RE.test(name);
}

export interface DynamicUpdate {
  version: string;
  notes: string;
  pub_date?: string;
  url: string;
  signature: string;
}

/**
 * 从 latest.json 里挑出这台电脑要的更新。
 * 返回 null 表示没有更新（版本不比当前新，或没有这个平台的包）；
 * 返回 "invalid" 表示 latest.json 格式不对。
 */
export function pickUpdate(
  manifest: unknown,
  target: string,
  arch: string,
  current: string,
  origin = UPDATE_PUBLIC_ORIGIN
): DynamicUpdate | null | "invalid" {
  if (!manifest || typeof manifest !== "object") return "invalid";
  const m = manifest as Record<string, unknown>;
  const version = typeof m.version === "string" ? m.version : "";
  const latest = parseSemver(version);
  const now = parseSemver(current);
  if (!latest || !now) return "invalid";
  const platforms = m.platforms;
  if (!platforms || typeof platforms !== "object") return "invalid";
  if (compareSemver(latest, now) <= 0) return null;
  const keys = [
    target === "windows" ? `${target}-${arch}-nsis` : null,
    target === "darwin" ? `${target}-${arch}-app` : null,
    `${target}-${arch}`,
  ].filter((k): k is string => !!k);
  const table = platforms as Record<string, unknown>;
  for (const key of keys) {
    const p = table[key] as Record<string, unknown> | undefined;
    if (!p || typeof p !== "object") continue;
    const url = typeof p.url === "string" ? p.url : "";
    const signature = typeof p.signature === "string" ? p.signature : "";
    if (!url.startsWith("https://") || !signature) return "invalid";
    const pubDate =
      typeof m.pub_date === "string" && RFC3339_RE.test(m.pub_date)
        ? m.pub_date
        : undefined;
    return {
      version: version.replace(/^v/, ""),
      notes: typeof m.notes === "string" ? m.notes : "",
      ...(pubDate ? { pub_date: pubDate } : {}),
      url: mirrorUrl(url, origin),
      signature,
    };
  }
  return null;
}

type FetchLike = typeof fetch;

export interface UpdateRouteOptions {
  fetchImpl?: FetchLike;
  origin?: string;
  now?: () => number;
}

export function registerUpdateRoutes(
  app: Express,
  opts: UpdateRouteOptions = {}
) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const origin = opts.origin ?? UPDATE_PUBLIC_ORIGIN;
  const now = opts.now ?? Date.now;
  let cache: { at: number; data: unknown } | null = null;
  let inflight: Promise<unknown> | null = null;
  let downloads = 0;

  const loadManifest = async (): Promise<unknown | null> => {
    if (cache && now() - cache.at < MANIFEST_TTL_MS) return cache.data;
    inflight ??= (async () => {
      try {
        const r = await fetchImpl(MANIFEST_URL, {
          redirect: "follow",
          signal: AbortSignal.timeout(10_000),
          headers: { "User-Agent": "jw3-memo-update-server" },
        });
        if (!r.ok) throw new Error(`latest.json HTTP ${r.status}`);
        const data: unknown = await r.json();
        cache = { at: now(), data };
        return data;
      } finally {
        inflight = null;
      }
    })();
    try {
      return await inflight;
    } catch (err) {
      console.warn("[update] 读取 latest.json 失败", String(err));
      if (cache && now() - cache.at < MANIFEST_STALE_MS) return cache.data;
      return null;
    }
  };

  const noStore = (res: Response) => res.set("Cache-Control", "no-store");

  app.get("/api/update/file/:tag/:name", async (req, res) => {
    const { tag, name } = req.params;
    if (!isMirrorFile(tag, name)) {
      noStore(res).status(404).json({ error: "not_found" });
      return;
    }
    if (downloads >= MAX_DOWNLOADS) {
      noStore(res).status(503).json({ error: "busy" });
      return;
    }
    downloads++;
    const ctrl = new AbortController();
    // 只限制等 GitHub 回应的时间；文件正文按用户的网速慢慢传，不设总时长
    const headerTimer = setTimeout(() => ctrl.abort(), 30_000);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      downloads--;
      clearTimeout(headerTimer);
    };
    res.on("close", () => {
      if (!res.writableFinished) ctrl.abort();
      finish();
    });
    try {
      const r = await fetchImpl(`${RELEASE_DOWNLOAD}${tag}/${name}`, {
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "jw3-memo-update-server" },
      });
      clearTimeout(headerTimer);
      if (!r.ok || !r.body) {
        noStore(res)
          .status(r.status === 404 ? 404 : 502)
          .json({ error: r.status === 404 ? "not_found" : "upstream" });
        finish();
        return;
      }
      res.status(200);
      res.set("Content-Type", "application/octet-stream");
      res.set("Cache-Control", "public, max-age=3600");
      const len = r.headers.get("content-length");
      if (len && /^\d+$/.test(len)) res.set("Content-Length", len);
      if (req.method === "HEAD") {
        ctrl.abort();
        res.end();
        return;
      }
      const body = Readable.fromWeb(r.body as never);
      body.on("error", err => {
        console.warn("[update] 转发安装包中断", name, String(err));
        res.destroy(err);
      });
      body.pipe(res);
    } catch (err) {
      console.warn("[update] 转发安装包失败", name, String(err));
      if (!res.headersSent)
        noStore(res).status(502).json({ error: "upstream" });
      else res.destroy();
      finish();
    }
  });

  app.get("/api/update/:target/:arch/:current", async (req, res) => {
    noStore(res);
    const { target, arch, current } = req.params;
    if (!TARGETS.has(target) || !ARCHES.has(arch) || !parseSemver(current)) {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    const manifest = await loadManifest();
    if (manifest === null) {
      res.status(503).json({ error: "unavailable" });
      return;
    }
    const update = pickUpdate(manifest, target, arch, current, origin);
    if (update === "invalid") {
      console.warn("[update] latest.json 格式不对");
      res.status(503).json({ error: "unavailable" });
      return;
    }
    if (!update) {
      res.status(204).end();
      return;
    }
    res.status(200).json(update);
  });
}
