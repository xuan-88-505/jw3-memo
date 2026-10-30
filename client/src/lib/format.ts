import type { Platform, Role } from "@/data/types";
import { IS_DESKTOP, writeClipboard } from "@/lib/desktop";
import { getLang, monthDay, tx } from "@/lib/i18n";

/**
 * 相对时间。inline 为真时用于句子中间（如「Updated {0}」）：英文、西语的「Just now」
 * 「Hace 1 día」首字母改小写；超过 7 天返回的日期（如 Oct 20）不动。
 */
export function relativeTime(
  iso: string,
  now = Date.now(),
  inline = false
): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  const lang = getLang();
  const rel = (s: string) =>
    inline && (lang === "en" || lang === "es")
      ? s.charAt(0).toLowerCase() + s.slice(1)
      : s;
  if (min < 1) return rel(tx("刚刚"));
  if (min < 60) return rel(min === 1 ? tx("1 分钟前") : tx("{0} 分钟前", min));
  const hour = Math.floor(min / 60);
  if (hour < 24)
    return rel(hour === 1 ? tx("1 小时前") : tx("{0} 小时前", hour));
  const day = Math.floor(hour / 24);
  if (day < 7) return rel(day === 1 ? tx("1 天前") : tx("{0} 天前", day));
  const d = new Date(t);
  return monthDay(d);
}

/** 绝对时间，带时区，用于 title 提示 */
export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -d.getTimezoneOffset() / 60;
  const tz = `UTC${offset >= 0 ? "+" : ""}${offset}`;
  const text = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
  return getLang() === "zh" ? `${text}（${tz}）` : `${text} (${tz})`;
}

export function pasteHint(platform: Platform): string {
  return platform === "mac" ? "⌘V" : "Ctrl+V";
}

/** 取值时按当前语言翻译 */
export const ROLE_LABEL: Record<Role, string> = {
  get admin() {
    return tx("管理员");
  },
  get editor() {
    return tx("编辑");
  },
  get viewer() {
    return tx("只读");
  },
};

const LAYER_ZH = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 奇穴第几重：中文写「一」到「九」，其他语言写 1 到 9。i 从 0 开始 */
export function layerLabel(i: number): string {
  return getLang() === "zh" ? (LAYER_ZH[i] ?? String(i + 1)) : String(i + 1);
}

export async function copyText(text: string): Promise<boolean> {
  // 桌面版：直接写系统剪贴板，不受网页权限限制
  if (IS_DESKTOP) {
    try {
      await writeClipboard(text);
      return true;
    } catch {
      // 继续尝试网页的方式
    }
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续尝试后备方案
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
