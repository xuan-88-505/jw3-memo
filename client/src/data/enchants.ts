import type { Attr, AttrGain } from "./gear";
import { STONES, STONES_LV5 } from "./stones";

/**
 * 小附魔、大附魔、五彩石（原型）。
 *
 * 选项和数值取自开源在线计算器 jx3dps-online-public（与魔盒配装器同源）：
 * src/数据/附魔、src/数据/五彩石、src/数据/装备/装备增益数据。
 * 秒伤变化按"属性收益"折算，和增益页的估算用同一套口径，不是真实计算。
 */

/** 一组属性变化（点数），同时用来改面板和估算秒伤 */
export interface StatDelta {
  primary?: number;
  /** 主属性百分比，1024 为分母（81 ≈ 7.9%） */
  primaryPct?: number;
  baseAttack?: number;
  critLv?: number;
  critDmgLv?: number;
  overcomeLv?: number;
  strainLv?: number;
  surplus?: number;
  haste?: number;
  vitality?: number;
  hp?: number;
  score?: number;
  /** 武器伤害，不进面板 */
  weaponDmg?: number;
  /** 直接的秒伤比例（0.0095 = 0.95%），用于伤腰、伤腕、伤鞋 */
  dmgPct?: number;
}

const DELTA_KEYS: (keyof StatDelta)[] = [
  "primary",
  "primaryPct",
  "baseAttack",
  "critLv",
  "critDmgLv",
  "overcomeLv",
  "strainLv",
  "surplus",
  "haste",
  "vitality",
  "hp",
  "score",
  "weaponDmg",
  "dmgPct",
];

export function addDelta(
  a: StatDelta,
  b: StatDelta | undefined,
  sign: 1 | -1 = 1
): StatDelta {
  if (!b) return a;
  const out: StatDelta = { ...a };
  for (const k of DELTA_KEYS) {
    const v = b[k];
    if (v) out[k] = (out[k] ?? 0) + sign * v;
  }
  return out;
}

export function isOuter(main: Attr) {
  return main === "身法" || main === "力道";
}

/** 一个紫色附魔给的点数（属性收益的单位），取自计算器附魔数据 */
export const ENCHANT_POINTS: Record<Attr, number> = {
  无双: 3279,
  会心: 3279,
  破防: 3279,
  破招: 3279,
  加速: 3279,
  会心效果: 3279,
  攻击: 994,
  根骨: 420,
  元气: 420,
  身法: 420,
  力道: 420,
};

/** 每一点属性带来的秒伤比例（0.000004 = 每点 0.0004%） */
export function perPoint(
  gains: AttrGain[],
  outer: boolean
): Partial<Record<Attr, number>> {
  const out: Partial<Record<Attr, number>> = {};
  const secondaries: number[] = [];
  for (const g of gains) {
    // 外功的攻击附魔是 891 点
    const points = g.attr === "攻击" && outer ? 891 : ENCHANT_POINTS[g.attr];
    const p = g.pct / 100 / points;
    out[g.attr] = p;
    if (ENCHANT_POINTS[g.attr] === 3279) secondaries.push(p);
  }
  const avg = secondaries.length
    ? secondaries.reduce((a, b) => a + b, 0) / secondaries.length
    : 0.0000035;
  for (const a of ["无双", "会心", "破防", "破招", "会心效果"] as Attr[]) {
    if (out[a] == null) out[a] = avg;
  }
  return out;
}

/**
 * 属性变化带来的秒伤比例（不含加速跨段，跨段在 applyConfig 里算）。
 * primaryBase 用来折算主属性百分比。
 */
export function deltaDpsPct(
  delta: StatDelta,
  pp: Partial<Record<Attr, number>>,
  main: Attr,
  primaryBase: number
) {
  const primary =
    (delta.primary ?? 0) +
    Math.floor((primaryBase * (delta.primaryPct ?? 0)) / 1024);
  return (
    primary * (pp[main] ?? 0) +
    (delta.baseAttack ?? 0) * (pp["攻击"] ?? 0) +
    (delta.weaponDmg ?? 0) * (pp["攻击"] ?? 0) * 0.5 +
    (delta.critLv ?? 0) * (pp["会心"] ?? 0) +
    (delta.critDmgLv ?? 0) * (pp["会心效果"] ?? 0) +
    (delta.overcomeLv ?? 0) * (pp["破防"] ?? 0) +
    (delta.strainLv ?? 0) * (pp["无双"] ?? 0) +
    (delta.surplus ?? 0) * (pp["破招"] ?? 0) +
    (delta.dmgPct ?? 0)
  );
}

/* ---------------- 小附魔 ---------------- */

type EnchantKind =
  | "攻击"
  | "破招"
  | "加速"
  | "无双"
  | "会心"
  | "破防"
  | "主属性"
  | "武伤"
  | "体质"
  | "气血"
  | "无双·节日";

export interface EnchantDef {
  id: EnchantKind;
  /** 游戏里的写法，例如"攻击+994" */
  label: string;
  /** 蓝色是节日附魔 */
  color: "紫" | "蓝";
  delta: StatDelta;
}

/** 每个部位能附的小附魔（当前赛季紫色，衣服腰带另有节日无双），取自计算器附魔数据 */
const SLOT_ENCHANTS: Record<string, EnchantKind[]> = {
  hat: ["攻击", "破招", "加速"],
  coat: ["无双·节日", "体质", "气血"],
  belt: ["无双·节日", "体质", "气血"],
  wrist: ["无双", "会心", "破防", "主属性"],
  pants: ["无双", "会心", "破防", "主属性"],
  shoes: ["攻击", "破招", "加速"],
  neck: ["体质"],
  pendant: ["体质"],
  ring1: ["攻击", "破招", "主属性"],
  ring2: ["攻击", "破招", "主属性"],
  weapon: ["攻击", "武伤"],
  hidden: ["加速", "破防", "主属性"],
};

/** 附魔装分：当前赛季紫色 3368，节日蓝色 1341 */
const SCORE = { 紫: 3368, 蓝: 1341 };

export function enchantDef(main: Attr, id: string): EnchantDef | null {
  const outer = isOuter(main);
  const make = (
    label: string,
    delta: StatDelta,
    color: "紫" | "蓝" = "紫"
  ): EnchantDef => ({
    id: id as EnchantKind,
    label,
    color,
    delta: { ...delta, score: SCORE[color] },
  });
  switch (id) {
    case "攻击": {
      const v = outer ? 891 : 994;
      return make(`攻击+${v}`, { baseAttack: v });
    }
    case "破招":
      return make("破招+3279", { surplus: 3279 });
    case "加速":
      return make("加速+3279", { haste: 3279 });
    case "无双":
      return make("无双+3279", { strainLv: 3279 });
    case "会心":
      return make("会心+3279", { critLv: 3279 });
    case "破防":
      return make("破防+3279", { overcomeLv: 3279 });
    case "主属性":
      return make(`${main}+420`, { primary: 420 });
    case "武伤":
      return make("武伤+1344", { weaponDmg: 1344 });
    case "体质":
      return make("体质+1215", { vitality: 1215 });
    case "气血":
      return make("气血+16397", { hp: 16397 });
    case "无双·节日":
      return make("无双+978", { strainLv: 978 }, "蓝");
  }
  return null;
}

export function enchantOptions(main: Attr, slotKey: string): EnchantDef[] {
  return (SLOT_ENCHANTS[slotKey] ?? [])
    .map(id => enchantDef(main, id))
    .filter((d): d is EnchantDef => !!d);
}

/* ---------------- 大附魔 ---------------- */

export type BigSlot = "hat" | "coat" | "belt" | "wrist" | "shoes";
/** 0 不附，1 普通，2 英雄 */
export type BigLevel = 0 | 1 | 2;
export type BigEnchants = Record<BigSlot, BigLevel>;

export const BIG_LEVEL_LABEL: Record<BigLevel, string> = {
  0: "不附",
  1: "普通",
  2: "英雄",
};
/** 大附魔的游戏图标（英雄 / 普通），同计算器 */
export const BIG_ICON: Record<1 | 2, number> = { 1: 23950, 2: 23948 };

export interface BigDef {
  key: BigSlot;
  /** 游戏里的叫法 */
  label: string;
  effect: string;
  delta: (lv: 1 | 2) => StatDelta;
  /** 没有现成数值，按估算 */
  estimated?: boolean;
}

export const BIG_SLOTS: BigDef[] = [
  {
    key: "hat",
    label: "伤帽",
    effect: "破防等级 +3501 / +4099",
    delta: lv => ({ overcomeLv: lv === 2 ? 4099 : 3501 }),
  },
  {
    key: "coat",
    label: "伤衣",
    effect: "基础攻击 +951 / +1114",
    delta: lv => ({ baseAttack: lv === 2 ? 1114 : 951 }),
  },
  {
    key: "belt",
    label: "伤腰",
    effect: "概率提高伤害，平均约 0.95%",
    delta: () => ({ dmgPct: 0.0095 }),
  },
  {
    key: "wrist",
    label: "伤腕",
    effect: "触发额外伤害",
    delta: lv => ({ dmgPct: lv === 2 ? 0.009 : 0.0075 }),
    estimated: true,
  },
  {
    key: "shoes",
    label: "伤鞋",
    effect: "触发额外伤害",
    delta: lv => ({ dmgPct: lv === 2 ? 0.008 : 0.0065 }),
    estimated: true,
  },
];

export const ALL_HERO: BigEnchants = {
  hat: 2,
  coat: 2,
  belt: 2,
  wrist: 2,
  shoes: 2,
};

export function bigDelta(big: BigEnchants): StatDelta {
  let d: StatDelta = {};
  for (const b of BIG_SLOTS) {
    const lv = big[b.key];
    if (lv) d = addDelta(d, b.delta(lv));
  }
  return d;
}

/* ---------------- 五彩石 ---------------- */

/** 五彩石等级，写在名称后面：彩·灭气·激流·月华(陆) */
export const STONE_LEVELS = ["壹", "贰", "叁", "肆", "伍", "陆"] as const;
export type StoneLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface StoneDef {
  name: string;
  /** 去掉"彩·"和等级，例如"灭气·激流·月华" */
  short: string;
  /** 带等级的短名，例如"灭气·激流·月华(陆)" */
  label: string;
  /** 名称里的三个词，依次对应三条属性 */
  words: string[];
  level: StoneLevel;
  /** 壹到肆级是按五级比例换算的 */
  estimated: boolean;
  attrs: { label: string; value: string }[];
  delta: StatDelta;
}

/** 同一种石头的 6 个等级（levels[0] 是壹级） */
export interface StoneFamily {
  short: string;
  words: string[];
  /** 三条属性的名称，例如 ["破防", "攻击", "会效"] */
  labels: string[];
  levels: StoneDef[];
}

const PRIMARY_KEYS = ["根骨", "元气", "身法", "力道"];

function stoneAttr(
  key: string,
  v: number
): { label: string; value: string; delta: StatDelta; primaryOf?: string } {
  const pctKey = key.endsWith("百分比") ? key.replace("百分比", "") : null;
  if (pctKey)
    return {
      label: pctKey,
      value: `+${((v / 1024) * 100).toFixed(1)}%`,
      delta: { primaryPct: v },
      primaryOf: pctKey,
    };
  if (PRIMARY_KEYS.includes(key))
    return {
      label: key,
      value: `+${v}`,
      delta: { primary: v },
      primaryOf: key,
    };
  const map: Record<string, [string, keyof StatDelta]> = {
    内攻: ["攻击", "baseAttack"],
    外攻: ["攻击", "baseAttack"],
    武伤: ["武伤", "weaponDmg"],
    破防: ["破防", "overcomeLv"],
    会心: ["会心", "critLv"],
    会效: ["会效", "critDmgLv"],
    无双: ["无双", "strainLv"],
    破招: ["破招", "surplus"],
    加速: ["加速", "haste"],
    全属: ["全属性", "primary"],
  };
  const [label, k] = map[key] ?? [key, "score"];
  return { label, value: `+${v}`, delta: { [k]: v } as StatDelta };
}

/**
 * 某一级的数值。陆、伍是计算器的真实数据；壹到肆按五级 × k / 5 换算。
 * 魔盒物品库里各级数值约为六级的 k/6，和计算器五级 = 六级 × 5/6 一致；
 * 只有主属性百分比（81 → 71）不按 5/6，所以统一以五级为基准。
 */
function levelValue(v6: number, v5: number | undefined, k: StoneLevel) {
  if (k === 6) return v6;
  const five = v5 ?? Math.round((v6 * 5) / 6);
  if (k === 5) return five;
  return Math.max(1, Math.round((five * k) / 5));
}

const familyCache = new Map<Attr, StoneFamily[]>();

/** 这个主属性能用的五彩石，按石头分组（带别的主属性的不列） */
export function stoneFamilies(main: Attr): StoneFamily[] {
  const hit = familyCache.get(main);
  if (hit) return hit;
  const kind = isOuter(main) ? "外功" : "内功";
  const list: StoneFamily[] = [];
  for (const [name, attrs] of STONES[kind]) {
    const probe = attrs.map(([k, v]) => stoneAttr(k, v));
    if (probe.some(p => p.primaryOf && p.primaryOf !== main)) continue;
    const base = name.replace(/\(陆\)$/, "");
    const v5 = STONES_LV5[kind][base];
    const short = base.replace(/^彩·/, "");
    const words = short.split("·");
    const levels = ([1, 2, 3, 4, 5, 6] as StoneLevel[]).map(k => {
      const parts = attrs.map(([key, v], i) =>
        stoneAttr(key, levelValue(v, v5?.[i], k))
      );
      const lv = STONE_LEVELS[k - 1];
      return {
        name: `${base}(${lv})`,
        short,
        label: `${short}(${lv})`,
        words,
        level: k,
        estimated: k < 5,
        attrs: parts.map(p => ({ label: p.label, value: p.value })),
        delta: parts.reduce<StatDelta>((d, p) => addDelta(d, p.delta), {}),
      };
    });
    list.push({ short, words, labels: probe.map(p => p.label), levels });
  }
  familyCache.set(main, list);
  return list;
}

const stoneCache = new Map<Attr, StoneDef[]>();

/** 这个主属性能用的全部五彩石（6 个等级都列） */
export function stonesFor(main: Attr): StoneDef[] {
  const hit = stoneCache.get(main);
  if (hit) return hit;
  const list = stoneFamilies(main).flatMap(f => f.levels);
  stoneCache.set(main, list);
  return list;
}

export function stoneDef(main: Attr, name: string | null) {
  if (!name) return null;
  return stonesFor(main).find(s => s.name === name) ?? null;
}

/* ---------------- 合计 ---------------- */

/** 一套配装上的附魔和五彩石 */
export interface GearConfig {
  /** 部位 key → 小附魔 id；null 是没附魔 */
  enchants: Record<string, string | null>;
  big: BigEnchants;
  stone: string | null;
}

/** 这套附魔和五彩石一共给的属性 */
export function configTotal(main: Attr, c: GearConfig): StatDelta {
  let d = bigDelta(c.big);
  for (const [slot, id] of Object.entries(c.enchants)) {
    if (!id) continue;
    if (!(SLOT_ENCHANTS[slot] ?? []).includes(id as EnchantKind)) continue;
    d = addDelta(d, enchantDef(main, id)?.delta);
  }
  d = addDelta(d, stoneDef(main, c.stone)?.delta);
  return d;
}

/** 从 from 换成 to，属性变了多少 */
export function configDelta(
  main: Attr,
  from: GearConfig,
  to: GearConfig
): StatDelta {
  return addDelta(configTotal(main, to), configTotal(main, from), -1);
}

/** 按属性收益挑最好的选项（新建配装时的默认值） */
export function bestEnchant(
  main: Attr,
  slotKey: string,
  pp: Partial<Record<Attr, number>>,
  primaryBase: number
): string | null {
  const opts = enchantOptions(main, slotKey);
  if (!opts.length) return null;
  // 衣服、腰带、项链、腰坠：秒伤附魔只有节日无双，其他是体质、气血
  return opts
    .map(o => ({ o, v: deltaDpsPct(o.delta, pp, main, primaryBase) }))
    .sort((a, b) => b.v - a.v)[0].o.id;
}

export function bestStone(
  main: Attr,
  pp: Partial<Record<Attr, number>>,
  primaryBase: number
): string | null {
  const list = stonesFor(main);
  if (!list.length) return null;
  // 加速会改段位，默认不选带加速的石头
  return list
    .filter(s => !s.delta.haste)
    .map(s => ({ s, v: deltaDpsPct(s.delta, pp, main, primaryBase) }))
    .sort((a, b) => b.v - a.v)[0].s.name;
}
