import { MODES, type Mode, type Scheme } from "@/data/types";

/**
 * 一个心法下可以有多个方案（一套宏：二段宏、三段宏……），每个方案里的宏是一段一段的。
 * 这里放和界面、状态无关的纯函数，store、亲友团同步、测试共用。
 */

/**
 * 角色的同步记录统一成「方案 id → 版本号」。
 * 旧数据是「心法 → { PVE: 版本号, PVP: 版本号 }」，当时方案 id 就是 `${心法}-${模式}`，
 * 所以能一一对应过来。其它看不懂的值丢掉。
 */
export function normalizeSynced(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const m of MODES) {
        const v = (value as Record<string, unknown>)[m];
        if (typeof v === "number" && Number.isFinite(v)) out[`${key}-${m}`] = v;
      }
    }
  }
  return out;
}

/**
 * 旧数据的「面板里每个角色在看 PVE 还是 PVP」转成「每个角色每个心法在看哪个方案」。
 * 只转换确实存在的方案。
 */
export function activeSetFromMode(
  activeMode: unknown,
  characters: { id: string }[],
  xinfasOf: (charId: string) => string[],
  schemeIds: Set<string>
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!activeMode || typeof activeMode !== "object") return out;
  for (const c of characters) {
    const m = (activeMode as Record<string, unknown>)[c.id];
    if (m !== "PVE" && m !== "PVP") continue;
    for (const x of xinfasOf(c.id)) {
      const id = `${x}-${m}`;
      if (schemeIds.has(id)) (out[c.id] ??= {})[x] = id;
    }
  }
  return out;
}

/** 只保留形状正确的「角色 → 心法 → 方案 id」 */
export function cleanActiveSet(
  raw: unknown
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [charId, byXinfa] of Object.entries(
    raw as Record<string, unknown>
  )) {
    if (!byXinfa || typeof byXinfa !== "object" || Array.isArray(byXinfa))
      continue;
    for (const [x, id] of Object.entries(byXinfa as Record<string, unknown>))
      if (typeof id === "string" && id) (out[charId] ??= {})[x] = id;
  }
  return out;
}

/**
 * 同一个心法下方案的顺序：先建的在前（第一个版本的时间），时间一样再按 id。
 * 亲友团里每个人看到的顺序一样。
 */
export function compareSchemes(a: Scheme, b: Scheme): number {
  const ta = a.versions[0]?.at ?? "";
  const tb = b.versions[0]?.at ?? "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 方案里用户自己填了名字的内容：宏、几套奇穴。版本和草稿都符合 */
export interface SchemeContent {
  macros: readonly { name: string }[];
  talentsName?: string;
  moreTalents?: readonly { name: string }[];
}

interface SchemeLike {
  title?: string;
  xinfa: string;
  mode: Mode;
  versions?: readonly SchemeContent[];
}

/**
 * 用户自己起的标题。以前新建方案会自动存「心法 · 模式」「心法 · 模式 2」这样的标题，
 * 它们不算用户起的名字，显示时换成用户填的宏名
 */
export function customTitle(s: {
  title?: string;
  xinfa: string;
  mode: Mode;
}): string | undefined {
  const t = s.title?.trim();
  if (!t) return undefined;
  const auto = `${s.xinfa} · ${s.mode}`;
  if (t === auto) return undefined;
  if (t.startsWith(`${auto} `) && /^\d+$/.test(t.slice(auto.length + 1)))
    return undefined;
  return t;
}

/**
 * 用户自己填的名字：起的标题 → 第一段宏的名字 → 奇穴套的名字；都没有时是 undefined。
 * 不传 content 时用方案最新的版本
 */
export function userSchemeName(
  s: SchemeLike,
  content?: SchemeContent
): string | undefined {
  const c = content ?? s.versions?.[s.versions.length - 1];
  const names = [
    ...(c?.macros.map(m => m.name) ?? []),
    c?.talentsName,
    ...(c?.moreTalents?.map(t => t.name) ?? []),
  ];
  return (
    customTitle(s) || names.map(n => n?.trim()).find((n): n is string => !!n)
  );
}

/** 方案显示的名字：用户填的名字；都没有时是自动标题或「心法 · 模式」 */
export function schemeName(s: SchemeLike, content?: SchemeContent): string {
  return (
    userSchemeName(s, content) || s.title?.trim() || `${s.xinfa} · ${s.mode}`
  );
}

/**
 * 新方案没写名字时的默认标题：同心法同模式还没有方案就用「心法 · 模式」（不存标题）；
 * 已经有了就加编号，避免两行一模一样。
 */
export function defaultSchemeTitle(
  existing: { title?: string; xinfa: string; mode: Mode }[],
  xinfa: string,
  mode: Mode
): string | undefined {
  const base = `${xinfa} · ${mode}`;
  const names = new Set(existing.map(s => s.title || `${s.xinfa} · ${s.mode}`));
  if (!names.has(base)) return undefined;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** 新方案的 id：心法开头方便看，后面的时间和随机数保证亲友团里不重复 */
export function newSchemeId(xinfa: string): string {
  return `${xinfa}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
