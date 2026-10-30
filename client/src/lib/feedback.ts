/**
 * 意见反馈：发到备忘录自己的服务器（POST /api/feedback），服务器存库并通知作者。
 * 网页版同源用相对路径；桌面版页面不在网站上，用已发布的网站地址。
 */
import { DESKTOP_PLATFORM, IS_DESKTOP, SITE_ORIGIN } from "@/lib/desktop";
import type { Lang } from "@/lib/i18n";

export type FeedbackKind = "bug" | "idea" | "other";

export const FEEDBACK_CONTENT_MAX = 1000;
export const FEEDBACK_CONTACT_MAX = 60;

const ENDPOINT = IS_DESKTOP
  ? `${SITE_ORIGIN}/api/feedback`
  : "/api/feedback";
const TIMEOUT_MS = 15000;

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "network" | "server" | "invalid" }
  | { ok: false; reason: "rate_limited"; retryAfter: number };

/** 字数按字符算，和服务器一致（一个 emoji 也算 1） */
export const charLength = (s: string) => Array.from(s).length;

export async function sendFeedback(input: {
  kind: FeedbackKind;
  content: string;
  contact: string;
  appVersion: string;
  lang: Lang;
}): Promise<SendResult> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: input.kind,
        content: input.content,
        contact: input.contact.trim() || null,
        appVersion: input.appVersion,
        platform: IS_DESKTOP ? DESKTOP_PLATFORM : "web",
        lang: input.lang,
      }),
      signal: ctrl.signal,
    });
    if (res.ok) return { ok: true };
    if (res.status === 429) {
      const body = await res.json().catch(() => null);
      const retryAfter = Number(
        body?.retryAfter ?? res.headers.get("Retry-After") ?? 600
      );
      return {
        ok: false,
        reason: "rate_limited",
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : 600,
      };
    }
    if (res.status === 400 || res.status === 413) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: false, reason: "server" };
  } catch {
    // 断网、超时、跨域被拦都到这里
    return { ok: false, reason: "network" };
  } finally {
    window.clearTimeout(timer);
  }
}

/* ---------------- 草稿：没发出去就关掉，下次打开还在 ---------------- */

const DRAFT_KEY = "tongdiao.feedbackDraft.v1";

export interface FeedbackDraft {
  kind: FeedbackKind;
  content: string;
  contact: string;
}

const EMPTY: FeedbackDraft = { kind: "bug", content: "", contact: "" };

export function loadDraft(): FeedbackDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY;
    const d = JSON.parse(raw) as Partial<FeedbackDraft>;
    return {
      kind:
        d.kind === "idea" || d.kind === "other" || d.kind === "bug"
          ? d.kind
          : "bug",
      content: typeof d.content === "string" ? d.content : "",
      contact: typeof d.contact === "string" ? d.contact : "",
    };
  } catch {
    return EMPTY;
  }
}

export function saveDraft(d: FeedbackDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // 存不下就算了，只是草稿
  }
}

/** 发送成功后：清空内容和类型，留下联系方式，下次不用再填 */
export function clearDraftAfterSend(contact: string) {
  saveDraft({ ...EMPTY, contact });
}
