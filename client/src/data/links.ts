/**
 * 链接：粘贴网址，点一下用浏览器打开。
 * 也可以直接放图片（上传、粘贴截图或拖进来），点一下看大图。
 * 在亲友团里默认全团可见，可改成仅自己；没加入亲友团时只有自己看到。
 */
import type { NoteImage } from "@/lib/image";
import { tx } from "@/lib/i18n";

export type LinkVisibility = "team" | "private";

export interface SharedLink {
  id: string;
  /** 图片条目没有网址，是空字符串 */
  url: string;
  /** 显示的名字：用户填的，或按网址自动起的 */
  title: string;
  by: string;
  at: string;
  visibility: LinkVisibility;
  /** 有图片就是图片条目：点开看大图，不跳转 */
  image?: NoteImage;
  /** 用户写的备注；有备注时列表第二行显示备注，不显示网址 */
  note?: string;
}

/** 常见站点的中文名，用于自动起名和显示来源 */
const KNOWN_SITES: { host: string; name: string }[] = [
  { host: "jx3box.com", name: "魔盒" },
  { host: "jx3.xoyo.com", name: "剑网3官网" },
  { host: "xoyo.com", name: "西山居" },
  { host: "dps.btcsg.top", name: "配装计算器" },
  { host: "bilibili.com", name: "B站" },
  { host: "b23.tv", name: "B站" },
  { host: "docs.qq.com", name: "腾讯文档" },
  { host: "kdocs.cn", name: "金山文档" },
  { host: "pan.baidu.com", name: "百度网盘" },
  { host: "tieba.baidu.com", name: "贴吧" },
  { host: "weibo.com", name: "微博" },
  { host: "douyin.com", name: "抖音" },
  { host: "xiaohongshu.com", name: "小红书" },
  { host: "github.com", name: "GitHub" },
];

const URL_RE = /https?:\/\/[^\s<>"'，。；、）)]+/gi;
const BARE_RE = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]\S*)?$/i;

/** 把一段文字里的网址都找出来；没有 http 开头时，整段像域名也算一条 */
export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  const list = found.length
    ? found
    : text
        .split(/\s+/)
        .filter(t => BARE_RE.test(t))
        .map(t => `https://${t}`);
  const out: string[] = [];
  for (const raw of list) {
    const url = normalizeUrl(raw);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

/** 只接受 http / https；去掉末尾多余的标点 */
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim().replace(/[.,;:!?]+$/, "");
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function siteName(url: string): string | null {
  const host = hostOf(url);
  const hit = KNOWN_SITES.find(
    s => host === s.host || host.endsWith(`.${s.host}`)
  );
  return hit?.name ?? null;
}

/** 列表第二行：站点名（认识的）+ 域名和路径 */
export function linkSubtitle(url: string) {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname + u.search).replace(/\/$/, "");
    const host = u.hostname.replace(/^www\./, "");
    return path ? `${host}${path}` : host;
  } catch {
    return url;
  }
}

/** 没填名字时自动起名：认识的站点用中文名，否则用域名 */
export function autoTitle(url: string): string {
  const site = siteName(url);
  let last = "";
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    last = segs.length ? decodeURIComponent(segs[segs.length - 1]) : "";
  } catch {
    last = "";
  }
  const tail = last.length > 24 ? `${last.slice(0, 24)}…` : last;
  if (site) return tail ? `${site} · ${tail}` : site;
  return tail ? `${hostOf(url)} · ${tail}` : hostOf(url);
}

/**
 * 图片的默认名字：文件名去掉扩展名。
 * 粘贴截图时浏览器给的文件名是 image.png，这时改用「截图 10月30日 03:08」。
 */
export function imageTitle(file: File, at = new Date()): string {
  const base = file.name.replace(/\.[a-z0-9]+$/i, "").trim();
  if (base && !/^image$/i.test(base)) return base.slice(0, 40);
  const pad = (n: number) => String(n).padStart(2, "0");
  return tx(
    "截图 {0}月{1}日 {2}:{3}",
    at.getMonth() + 1,
    at.getDate(),
    pad(at.getHours()),
    pad(at.getMinutes())
  );
}

/** 站点图标：直接取该站的 /favicon.ico，不经过第三方服务 */
export function faviconOf(url: string) {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return "";
  }
}

/** 我能看到的：亲友团可见的，加上我自己加的仅自己可见的 */
export function visibleLinks(links: SharedLink[], meId: string) {
  return links.filter(l => l.visibility === "team" || l.by === meId);
}

export function seedLinks(meId: string): SharedLink[] {
  const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  return [
    {
      id: "l1",
      url: "https://www.jx3box.com/bps/109793",
      title: "苍生铸世 小药宴席整理",
      by: "xiaotao",
      at: ago(5),
      visibility: "team",
    },
    {
      id: "l2",
      url: "https://dps.btcsg.top/",
      title: "在线配装计算器",
      by: meId,
      at: ago(26),
      visibility: "team",
    },
    {
      id: "l3",
      url: "https://jx3.xoyo.com/launcher/update/latest.html",
      title: "官方更新公告",
      by: "ajiu",
      at: ago(50),
      visibility: "team",
    },
    {
      id: "l4",
      url: "https://docs.qq.com/sheet/DTEhvbmdkaWFv",
      title: "我的四个号的毕业进度",
      by: meId,
      at: ago(80),
      visibility: "private",
    },
    {
      // 阿九自己的，别人看不到
      id: "l5",
      url: "https://www.bilibili.com/video/BV1jx3tongdiao",
      title: "阿九收藏的打法视频",
      by: "ajiu",
      at: ago(30),
      visibility: "private",
    },
  ];
}
