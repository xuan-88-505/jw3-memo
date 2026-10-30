import { useSyncExternalStore } from "react";
import en from "@/locales/en";
import es from "@/locales/es";
import ja from "@/locales/ja";
import ko from "@/locales/ko";

/**
 * 界面语言。
 * 键就是中文原文：中文模式下 tx() 原样返回，其他语言查词典，查不到也回退中文。
 * 游戏专有名词（门派、心法、奇穴、技能、装备、属性、增益、副本）和用户输入的内容不翻译。
 */
export type Lang = "zh" | "en" | "ja" | "ko" | "es";

export const LANGS: { value: Lang; label: string; html: string }[] = [
  { value: "zh", label: "简体中文", html: "zh-CN" },
  { value: "en", label: "English", html: "en" },
  { value: "ja", label: "日本語", html: "ja" },
  { value: "ko", label: "한국어", html: "ko" },
  { value: "es", label: "Español", html: "es" },
];

const DICTS: Record<Exclude<Lang, "zh">, Record<string, string>> = {
  en,
  ja,
  ko,
  es,
};

const KEY = "tongdiao.lang.v1";

function parse(v: string | null | undefined): Lang {
  return LANGS.some(l => l.value === v) ? (v as Lang) : "zh";
}

function read(): Lang {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return "zh";
  }
}

let current: Lang = typeof window === "undefined" ? "zh" : read();
const listeners = new Set<() => void>();
/** 中文用 index.html 里原来的标题 */
const ZH_TITLE = typeof document === "undefined" ? "备忘录" : document.title;

function applyDocument() {
  if (typeof document === "undefined") return;
  const html = LANGS.find(l => l.value === current)?.html ?? "zh-CN";
  document.documentElement.lang = html;
  document.title = current === "zh" ? ZH_TITLE : "JW3 Memo";
}

function emit() {
  applyDocument();
  listeners.forEach(f => f());
}

export function getLang(): Lang {
  return current;
}
/** 当前语言的 BCP 47 标签，给 Intl 用 */
export function localeTag(): string {
  return LANGS.find(l => l.value === current)?.html ?? "zh-CN";
}
/** 月日：中文「10月20日」，其他语言按各自习惯（Oct 20、20 oct、10月20日、10월 20일） */
export function monthDay(d: Date): string {
  if (current === "zh") return `${d.getMonth() + 1}月${d.getDate()}日`;
  return new Intl.DateTimeFormat(localeTag(), {
    month: "short",
    day: "numeric",
  }).format(d);
}
/** 菜单栏时钟用：中文「10月30日 周四」，其他语言 Thu, Oct 30 这类 */
export function weekdayMonthDay(d: Date): string {
  if (current === "zh")
    return `${d.getMonth() + 1}月${d.getDate()}日 周${"日一二三四五六"[d.getDay()]}`;
  return new Intl.DateTimeFormat(localeTag(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}
/** 大数字缩写：中文、日文、韩文用「万 / 만」，英文和西语用 K / M */
export function compactNumber(n: number): string {
  if (current === "zh" || current === "ja")
    return `${(n / 10000).toFixed(1)}万`;
  if (current === "ko") return `${(n / 10000).toFixed(1)}만`;
  return new Intl.NumberFormat(localeTag(), {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

/** 括注：中文、日文用全角括号，其他语言用半角括号并空一格 */
export function paren(s: string): string {
  return current === "zh" || current === "ja" ? `（${s}）` : ` (${s})`;
}

/** 标签后的冒号：中文、日文用全角，其他语言用半角并空一格 */
export function colon(): string {
  return current === "zh" || current === "ja" ? "：" : ": ";
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // 存不了就只在本次有效
  }
  emit();
}

function subscribe(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** 当前语言；语言变化时组件重新渲染 */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => "zh" as Lang);
}

if (typeof window !== "undefined") {
  applyDocument();
  // 桌面版有两个窗口：一个窗口改了语言，另一个跟着变
  const sync = () => {
    const next = read();
    if (next !== current) {
      current = next;
      emit();
    }
  };
  window.addEventListener("storage", e => {
    if (e.key === KEY) sync();
  });
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync();
  });
}

/**
 * 翻译界面文字。`zh` 是中文原文，`{0}`、`{1}` 是参数位置。
 * 词典里没有这句时返回中文原文。
 */
export function tx(zh: string, ...args: unknown[]): string {
  const s = current === "zh" ? zh : (DICTS[current][zh] ?? zh);
  if (!args.length) return s;
  return s.replace(/\{(\d+)\}/g, (m, i: string) => {
    const v = args[Number(i)];
    return v === undefined || v === null ? m : String(v);
  });
}

/**
 * 带数量的文案。n 为 1 时，如果词典里有把 {0} 换成 1 的写法（如「1 处变化」），
 * 就用它，英文、西语能显示单数；没有时和 tx 一样。
 */
export function txn(zh: string, n: number, ...rest: unknown[]): string {
  if (n === 1 && current !== "zh") {
    const one = zh.replace("{0}", "1");
    if (DICTS[current][one]) return tx(one, n, ...rest);
  }
  return tx(zh, n, ...rest);
}

/** Intl 用的语言代码：日期、数字格式化 */
export function intlLocale(): string {
  return LANGS.find(l => l.value === current)?.html ?? "zh-CN";
}
