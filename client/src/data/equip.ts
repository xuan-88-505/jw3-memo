import type { StatDelta } from "./enchants";
import type { Attr } from "./gear";
import { schoolOf } from "./seed";

/**
 * 配装器用的装备库（原型）。
 *
 * 数据由 scripts/gen_equip.py 从开源计算器 jx3dps-online-public 2.5.8（130 级赛季，
 * 和原型面板同一口径）导出：装备名、品级、图标、类型、属性、镶嵌孔、来源都是真实数据。
 * 精炼系数、五行石数值也取自同一份源码，见 research-notes.md。
 * 秒伤变化仍按属性收益折算（估算）。
 */

/** 装备属性在 StatDelta 里的字段；主属性用中文名，只在和心法主属性一致时生效 */
export type EquipStatKey =
  | "根骨"
  | "元气"
  | "身法"
  | "力道"
  | "vitality"
  | "baseAttack"
  | "critLv"
  | "critDmgLv"
  | "overcomeLv"
  | "strainLv"
  | "haste"
  | "surplus"
  | "versatility";

/** 五行石孔的属性 */
export type GemAttr = Attr | "全能" | "体质";

export type EquipType =
  | "普通"
  | "副本精简"
  | "切糕"
  | "门派套装"
  | "门派特效武器"
  | "试炼精简"
  | "特效武器"
  | "橙武";

/** 生成文件里的一行：[id, 名称, 品级, 图标, 类型, 特效, 主属性, 门派, 属性, 镶嵌孔, 武器伤害, 来源] */
export type EquipRow = [
  number,
  string,
  number,
  number,
  string,
  string,
  string,
  string,
  [string, number][],
  string[],
  number,
  string | null,
];

export interface EquipDef {
  id: number;
  name: string;
  /** 品级 */
  ilvl: number;
  iconId: number;
  type: EquipType;
  /** 装备特效，例如"切糕_英雄"；没有是空串 */
  effect: string;
  /** 装备主属性：根骨、元气、身法、力道，或"通用" */
  main: string;
  /** 所属门派："通用"或门派名 */
  school: string;
  stats: [EquipStatKey, number][];
  holes: GemAttr[];
  /** 武器平均伤害；不是武器为 0 */
  weaponDmg: number;
  source: string | null;
}

export function decodeEquip(r: EquipRow): EquipDef {
  return {
    id: r[0],
    name: r[1],
    ilvl: r[2],
    iconId: r[3],
    type: r[4] as EquipType,
    effect: r[5],
    main: r[6] || "通用",
    school: r[7] || "通用",
    stats: r[8] as [EquipStatKey, number][],
    holes: r[9] as GemAttr[],
    weaponDmg: r[10],
    source: r[11],
  };
}

/** 装备库的部位；两个戒指共用"ring" */
export type EquipPart =
  | "hat"
  | "coat"
  | "belt"
  | "wrist"
  | "pants"
  | "shoes"
  | "neck"
  | "pendant"
  | "ring"
  | "hidden"
  | "weapon";

export function partOf(slotKey: string): EquipPart {
  return (slotKey.startsWith("ring") ? "ring" : slotKey) as EquipPart;
}

/* ---------------- 精炼、五行石 ---------------- */

/** 精炼加成系数（计算器 src/数据/常量）：精炼后 = 基础 + round(基础 × 系数) */
export const REFINE_COEF = [
  0, 0.005, 0.013, 0.024, 0.038, 0.055, 0.075, 0.098, 0.124,
];

export function maxRefine(def: Pick<EquipDef, "type">) {
  return def.type === "橙武" ? 8 : 6;
}

export function refined(value: number, level: number) {
  return value + Math.round(value * (REFINE_COEF[level] ?? 0));
}

/** 五行石 0–8 级的数值（计算器 src/数据/镶嵌孔） */
const GEM_TABLE = {
  attackIn: [0, 29, 59, 89, 120, 149, 178, 269, 398],
  attackOut: [0, 26, 52, 80, 107, 133, 161, 241, 357],
  primary: [0, 13, 25, 38, 49, 62, 75, 113, 168],
  secondary: [0, 99, 197, 296, 396, 493, 593, 889, 1317],
  minor: [0, 49, 99, 149, 197, 246, 298, 446, 660],
};

export const GEM_MAX = 8;

export function gemValue(attr: GemAttr, level: number, outer: boolean) {
  const lv = Math.max(0, Math.min(GEM_MAX, level));
  if (attr === "攻击")
    return (outer ? GEM_TABLE.attackOut : GEM_TABLE.attackIn)[lv];
  if (attr === "根骨" || attr === "元气" || attr === "身法" || attr === "力道")
    return GEM_TABLE.primary[lv];
  if (attr === "全能" || attr === "体质") return GEM_TABLE.minor[lv];
  return GEM_TABLE.secondary[lv];
}

const GEM_FIELD: Partial<Record<GemAttr, keyof StatDelta>> = {
  攻击: "baseAttack",
  会心: "critLv",
  会心效果: "critDmgLv",
  破防: "overcomeLv",
  无双: "strainLv",
  加速: "haste",
  破招: "surplus",
  体质: "vitality",
};

const STAT_FIELD: Partial<Record<EquipStatKey, keyof StatDelta>> = {
  vitality: "vitality",
  baseAttack: "baseAttack",
  critLv: "critLv",
  critDmgLv: "critDmgLv",
  overcomeLv: "overcomeLv",
  strainLv: "strainLv",
  haste: "haste",
  surplus: "surplus",
};

const PRIMARIES = ["根骨", "元气", "身法", "力道"];

function add(d: StatDelta, k: keyof StatDelta, v: number) {
  d[k] = (d[k] ?? 0) + v;
}

/** 一个五行石孔给的属性；主属性孔只在和心法主属性一致时生效 */
export function gemDelta(
  attr: GemAttr,
  level: number,
  main: Attr,
  outer: boolean
): StatDelta {
  const v = gemValue(attr, level, outer);
  const d: StatDelta = {};
  if (PRIMARIES.includes(attr)) {
    if (attr === main) d.primary = v;
    return d;
  }
  const k = GEM_FIELD[attr];
  if (k) d[k] = v;
  return d;
}

/** 一件装备（含精炼、五行石）给的全部属性 */
export function itemDelta(
  def: EquipDef,
  refine: number,
  gems: number[],
  main: Attr,
  outer: boolean
): StatDelta {
  const d: StatDelta = {};
  for (const [k, v] of def.stats) {
    const val = refined(v, refine);
    if (PRIMARIES.includes(k)) {
      if (k === main) add(d, "primary", val);
      continue;
    }
    const f = STAT_FIELD[k];
    if (f) add(d, f, val);
  }
  if (def.weaponDmg) add(d, "weaponDmg", def.weaponDmg);
  def.holes.forEach((h, i) => {
    const g = gemDelta(h, gems[i] ?? 0, main, outer);
    for (const k of Object.keys(g) as (keyof StatDelta)[]) add(d, k, g[k]!);
  });
  return d;
}

/* ---------------- 显示 ---------------- */

/** 装备里的二级属性，按装备上的顺序，例如 ["会心", "无双"] */
export function itemTags(def: EquipDef): Attr[] {
  const map: Partial<Record<EquipStatKey, Attr>> = {
    critLv: "会心",
    critDmgLv: "会心效果",
    overcomeLv: "破防",
    strainLv: "无双",
    surplus: "破招",
    haste: "加速",
  };
  return def.stats.map(([k]) => map[k]).filter((a): a is Attr => !!a);
}

export function qualityOf(def: EquipDef): "purple" | "orange" {
  return def.type === "橙武" ? "orange" : "purple";
}

/** 类型的短标签；普通装备不标 */
export const TYPE_TAG: Record<EquipType, string> = {
  普通: "",
  副本精简: "精简",
  试炼精简: "精简",
  切糕: "切糕",
  门派套装: "套装",
  门派特效武器: "特效",
  特效武器: "特效",
  橙武: "橙武",
};

/** 筛选里"不看"的类型分组 */
export const TYPE_GROUPS = ["精简", "切糕", "套装", "特效", "橙武"] as const;
export type TypeGroup = (typeof TYPE_GROUPS)[number];

/** 属性名在窄控件里的简称 */
export function attrShort(a: GemAttr | Attr) {
  return a === "会心效果" ? "会效" : a;
}

/** 装备属性的中文名（详情卡用） */
export const STAT_LABEL: Record<EquipStatKey, string> = {
  根骨: "根骨",
  元气: "元气",
  身法: "身法",
  力道: "力道",
  vitality: "体质",
  baseAttack: "攻击",
  critLv: "会心",
  critDmgLv: "会心效果",
  overcomeLv: "破防",
  strainLv: "无双",
  haste: "加速",
  surplus: "破招",
  versatility: "全能",
};

/* ---------------- 装备库加载 ---------------- */

export type EquipDb = Record<EquipPart, EquipDef[]>;
type DbKind = "nei" | "wai";

function kindOf(main: Attr): DbKind {
  return main === "身法" || main === "力道" ? "wai" : "nei";
}

const cache: Partial<Record<DbKind, EquipDb>> = {};
const pending: Partial<Record<DbKind, Promise<EquipDb>>> = {};

function decodeDb(json: { items: Record<string, EquipRow[]> }): EquipDb {
  const out = {} as EquipDb;
  for (const [k, rows] of Object.entries(json.items))
    out[k as EquipPart] = rows.map(decodeEquip);
  return out;
}

/** 已经加载好的装备库；没加载是 null */
export function getEquipDb(main: Attr): EquipDb | null {
  return cache[kindOf(main)] ?? null;
}

/** 按需加载内功或外功装备库（约 330 KB，单独打包） */
export function loadEquipDb(main: Attr): Promise<EquipDb> {
  const kind = kindOf(main);
  if (cache[kind]) return Promise.resolve(cache[kind]!);
  if (!pending[kind]) {
    const p =
      kind === "nei" ? import("./equip/nei.json") : import("./equip/wai.json");
    pending[kind] = p
      .then(m => {
        const json = (m.default ?? m) as unknown as {
          items: Record<string, EquipRow[]>;
        };
        const db = decodeDb(json);
        cache[kind] = db;
        return db;
      })
      .catch(err => {
        delete pending[kind];
        throw err;
      });
  }
  return pending[kind]!;
}

/** 这个心法能穿的装备：主属性一致或通用；武器、门派装备只看本门派 */
export function poolFor(
  db: EquipDb,
  slotKey: string,
  xinfa: string,
  main: Attr
): EquipDef[] {
  const school = schoolOf(xinfa);
  return (db[partOf(slotKey)] ?? []).filter(
    d =>
      (d.main === main || d.main === "通用") &&
      (d.school === "通用" || d.school === school)
  );
}
