/**
 * 意见反馈的校验、限流和通知内容。这里只放纯逻辑，便于单元测试；
 * HTTP 处理在 server/feedbackRoute.ts。
 */

export const FEEDBACK_KINDS = ["bug", "idea", "other"] as const;
export const FEEDBACK_PLATFORMS = ["win", "mac", "web"] as const;
export const FEEDBACK_LANGS = ["zh", "en", "ja", "ko", "es"] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackPlatform = (typeof FEEDBACK_PLATFORMS)[number];

export const CONTENT_MAX = 1000;
export const CONTACT_MAX = 60;
const VERSION_MAX = 32;

export interface FeedbackInput {
  kind: FeedbackKind;
  content: string;
  contact: string | null;
  appVersion: string;
  platform: FeedbackPlatform;
  lang: string;
}

export type ParseResult =
  | { ok: true; value: FeedbackInput }
  /** 诱饵字段被填了：当作成功返回，但不存、不通知 */
  | { ok: true; spam: true }
  | { ok: false; field: string };

/** 字数按字符算（一个汉字、一个 emoji 都算 1），和前端 maxLength 的观感一致 */
export const charLength = (s: string) => Array.from(s).length;

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/** 去掉控制字符（保留换行和制表符），统一换行 */
const clean = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

export function parseFeedback(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, field: "body" };
  }
  const b = body as Record<string, unknown>;
  // 诱饵字段：界面上看不到，只有机器人会填
  if (typeof b.website === "string" && b.website.trim() !== "") {
    return { ok: true, spam: true };
  }
  if (!oneOf(FEEDBACK_KINDS, b.kind)) return { ok: false, field: "kind" };
  if (typeof b.content !== "string") return { ok: false, field: "content" };
  const content = clean(b.content);
  if (!content || charLength(content) > CONTENT_MAX) {
    return { ok: false, field: "content" };
  }
  let contact: string | null = null;
  if (b.contact != null) {
    if (typeof b.contact !== "string") return { ok: false, field: "contact" };
    const c = clean(b.contact).replace(/\s+/g, " ");
    if (charLength(c) > CONTACT_MAX) return { ok: false, field: "contact" };
    contact = c || null;
  }
  if (
    typeof b.appVersion !== "string" ||
    !/^[0-9A-Za-z.+\- ]{1,32}$/.test(b.appVersion) ||
    b.appVersion.length > VERSION_MAX
  ) {
    return { ok: false, field: "appVersion" };
  }
  if (!oneOf(FEEDBACK_PLATFORMS, b.platform)) {
    return { ok: false, field: "platform" };
  }
  if (!oneOf(FEEDBACK_LANGS, b.lang)) return { ok: false, field: "lang" };
  return {
    ok: true,
    value: {
      kind: b.kind,
      content,
      contact,
      appVersion: b.appVersion.trim(),
      platform: b.platform,
      lang: b.lang,
    },
  };
}

/* ---------------- 限流：同一 IP 10 分钟 5 条、24 小时 20 条 ---------------- */

const WINDOWS = [
  { ms: 10 * 60 * 1000, max: 5 },
  { ms: 24 * 60 * 60 * 1000, max: 20 },
];
const LONGEST = Math.max(...WINDOWS.map(w => w.ms));

export class RateLimiter {
  private hits = new Map<string, number[]>();

  /** 能发就记一次并返回 0；不能发返回还要等多少秒 */
  take(key: string, now = Date.now()): number {
    const list = (this.hits.get(key) ?? []).filter(t => now - t < LONGEST);
    let wait = 0;
    for (const w of WINDOWS) {
      const inWindow = list.filter(t => now - t < w.ms);
      if (inWindow.length >= w.max) {
        // 窗口里最早那条过期后才能再发
        const oldest = inWindow[inWindow.length - w.max];
        wait = Math.max(wait, Math.ceil((oldest + w.ms - now) / 1000));
      }
    }
    if (wait > 0) {
      this.hits.set(key, list);
      return wait;
    }
    list.push(now);
    this.hits.set(key, list);
    // 偶尔清掉早已过期的 IP，避免一直增长
    if (this.hits.size > 5000) {
      this.hits.forEach((v, k) => {
        if (!v.some(t => now - t < LONGEST)) this.hits.delete(k);
      });
    }
    return 0;
  }
}

/* ---------------- 通知内容 ---------------- */

const KIND_LABEL: Record<FeedbackKind, string> = {
  bug: "问题",
  idea: "建议",
  other: "其他",
};
const PLATFORM_LABEL: Record<FeedbackPlatform, string> = {
  win: "Windows",
  mac: "Mac",
  web: "网页版",
};
const LANG_LABEL: Record<string, string> = {
  zh: "中文",
  en: "英语",
  ja: "日语",
  ko: "韩语",
  es: "西语",
};

/** 北京时间，如 2026-10-31 01:05 */
export function beijingTime(d: Date) {
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export function notificationFor(id: number, f: FeedbackInput, at: Date) {
  return {
    title: `备忘录反馈 · ${KIND_LABEL[f.kind]}`,
    content: [
      `#${id}  ${KIND_LABEL[f.kind]}`,
      "",
      f.content,
      "",
      `联系方式：${f.contact ?? "未留"}`,
      `版本：${f.appVersion} · ${PLATFORM_LABEL[f.platform]} · ${LANG_LABEL[f.lang] ?? f.lang}`,
      `时间：${beijingTime(at)}（北京时间）`,
    ].join("\n"),
  };
}
