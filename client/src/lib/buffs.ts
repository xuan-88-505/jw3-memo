/**
 * 增益（小药小吃、家园、团队增益、阵眼）：类型、预设和秒伤估算。
 *
 * 数据和选项格式照开源计算器 jx3dps-online-public：
 *   增益数据 = { 阵眼, 小吃[], 团队增益[{增益名称, 启用, 层数, 覆盖率}] }
 * 正式版把选择原样交给计算器引擎重算；原型里用属性收益估算，界面上标「≈」。
 */
import { BUFF_DB } from "@/data/buffData";
import { HASTE_TIERS, type Attr, type Loadout } from "@/data/gear";

/* ---------- 数据类型（buffData.ts 的结构） ---------- */

/** [属性键, 值, 触发型(1)] */
export type EffectRow = [string, number] | [string, number, number];

export interface FoodDef {
  n: string;
  /** 类别：药品辅助、家园酒品…… */
  c: string;
  /** 品级：蓝 / 紫 */
  q: string;
  i: number;
  e: EffectRow[];
}

export interface TeamDef {
  n: string;
  /** 类型：常用增益、治疗Buff增益…… */
  t: string;
  /** 来源：门派、活动、宴席 */
  s: string;
  i: number;
  d: string;
  e: EffectRow[];
  /** 默认层数 */
  L: number;
  /** 层数上限；0 表示没有层数 */
  maxL: number;
  /** 默认覆盖率（%） */
  cov: number;
  covEdit: boolean;
  /** 互斥的增益名 */
  x: string[];
}

export interface ZhenDef {
  n: string;
  i: number;
  d: string;
  e: EffectRow[];
}

export interface BuffGroup {
  foods: FoodDef[];
  team: TeamDef[];
  zhen: ZhenDef[];
}

export interface PresetDef {
  name: string;
  zhen: string;
  foods: string[];
  /** [增益名, 层数, 覆盖率] */
  team: [string, number, number][];
}

export interface BuffDb {
  groups: Record<string, BuffGroup>;
  profiles: Record<string, { group: string; main: string; generic: boolean }>;
  presets: Record<string, PresetDef[]>;
}

/* ---------- 选择状态 ---------- */

export interface TeamBuffState {
  on: boolean;
  layers: number;
  cov: number;
}

export interface BuffSelection {
  /** 预设名；改过任何一项就是 null（自定义） */
  preset: string | null;
  zhen: string;
  /** 类别 → 小药名；没吃的类别不出现 */
  foods: Record<string, string>;
  /** 只存开着的团队增益 */
  team: Record<string, TeamBuffState>;
}

export const PRESET_LABEL: Record<string, string> = {
  清空增益: "不加增益",
  副本不吃药: "副本不吃药",
  副本常用: "副本常用",
  开荒拉满: "开荒拉满",
};

export const NO_BUFFS: BuffSelection = {
  preset: "清空增益",
  zhen: "",
  foods: {},
  team: {},
};

/** 小药小吃的 9 个类别，按游戏里常见的分法排 */
export const FOOD_CATS = [
  "药品辅助",
  "药品增强",
  "食品辅助",
  "食品增强",
  "武器磨石",
  "团队宴席",
  "家园菜品",
  "家园酒品",
  "家园香水",
] as const;

export const TEAM_TYPES: { key: string; label: string }[] = [
  { key: "常用增益", label: "常用" },
  { key: "治疗Buff增益", label: "治疗" },
  { key: "坦克Buff增益", label: "坦克" },
  { key: "目标减益", label: "目标减益" },
  { key: "稀缺增益", label: "稀缺" },
  { key: "食物增益", label: "食物" },
  { key: "节日增益", label: "节日" },
];

/* ---------- 查询 ---------- */

export function buffProfile(xinfa: string) {
  return (
    BUFF_DB.profiles[xinfa] ?? { group: "内功", main: "根骨", generic: true }
  );
}

export function buffGroup(xinfa: string): BuffGroup {
  return BUFF_DB.groups[buffProfile(xinfa).group] ?? BUFF_DB.groups["内功"];
}

export function buffPresets(xinfa: string): PresetDef[] {
  return BUFF_DB.presets[xinfa] ?? BUFF_DB.presets["紫霞功"];
}

export function applyPreset(xinfa: string, name: string): BuffSelection {
  const p = buffPresets(xinfa).find(x => x.name === name);
  if (!p) return NO_BUFFS;
  const g = buffGroup(xinfa);
  const foods: Record<string, string> = {};
  for (const n of p.foods) {
    const f = g.foods.find(x => x.n === n);
    if (f) foods[f.c] = f.n;
  }
  const team: Record<string, TeamBuffState> = {};
  for (const [n, layers, cov] of p.team) {
    team[n] = { on: true, layers, cov };
  }
  return { preset: p.name, zhen: p.zhen, foods, team };
}

/** 打开一个团队增益；同组互斥的会被关掉，返回被关掉的名字 */
export function enableTeamBuff(
  sel: BuffSelection,
  def: TeamDef
): { next: BuffSelection; turnedOff: string[] } {
  const team = { ...sel.team };
  const turnedOff: string[] = [];
  for (const other of def.x) {
    if (team[other]?.on) {
      delete team[other];
      turnedOff.push(other);
    }
  }
  team[def.n] = {
    on: true,
    layers: def.maxL ? def.L : 1,
    cov: def.cov,
  };
  return { next: { ...sel, preset: null, team }, turnedOff };
}

/* ---------- 秒伤估算 ---------- */

/** 一个紫色附魔给的点数（属性收益的单位），取自计算器附魔数据 */
const ENCHANT_POINTS: Record<Attr, number> = {
  无双: 3279,
  会心: 3279,
  破防: 3279,
  破招: 3279,
  加速: 3279,
  会心效果: 3279,
  根骨: 420,
  元气: 420,
  身法: 420,
  力道: 420,
  攻击: 994,
};

/** 点数类属性键 → 原型的属性；MAIN 表示本心法主属性 */
const POINT_KEYS: Record<string, Attr | "MAIN"> = {
  atStrainBase: "无双",
  atAllTypeCriticalStrike: "会心",
  atAllOvercome: "破防",
  atPhysicsOvercomeBase: "破防",
  atSurplusValueBase: "破招",
  atHasteBase: "加速",
  atAllTypeCriticalDamagePowerBase: "会心效果",
  allAttackPowerBase: "攻击",
  atMagicAttackPowerBase: "攻击",
  atPhysicsAttackPowerBase: "攻击",
  atSpiritBase: "根骨",
  atSpunkBase: "元气",
  atAgilityBase: "身法",
  atStrengthBase: "力道",
  atBasePotentialAdd: "MAIN",
};

/**
 * 百分比类属性：每单位值折成多少秒伤比例。估算系数，不是公式结果。
 * 「郭氏」值以 1024 为分母；Rate 类是小数；DamageAdd 类直接是伤害比例。
 */
const K = 1 / 1024;
const PCT_KEYS: Record<string, number> = {
  atMagicAttackPowerPercent: 0.75 * K,
  atPhysicsAttackPowerPercent: 0.75 * K,
  allAttackPowerPercent: 0.75 * K,
  atMagicCriticalStrikeBaseRate: 0.55,
  atPhysicsCriticalStrikeBaseRate: 0.55,
  atAllCriticalStrikeBaseRate: 0.55,
  atMagicCriticalDamagePowerBaseKiloNumRate: 0.3 * K,
  atPhysicsCriticalDamagePowerBaseKiloNumRate: 0.3 * K,
  atAllCriticalDamagePowerBaseKiloNumRate: 0.3 * K,
  atMagicOvercomePercent: 0.4 * K,
  atPhysicsOvercomePercent: 0.4 * K,
  atStrainRate: 0.45 * K,
  atSkillDamageCommonAdd: 1,
  atSkillDamageFragileAdd: 1,
  atActivityDamageFinalCof: 1,
  atAllShieldIgnorePercent: 0.35 * K,
  // 目标防御降低：值是负数
  atMagicShieldPercent: -0.35 * K,
  atPhysicsShieldPercent: -0.35 * K,
  atPhysicsShieldBase: -0.000004,
  atSpiritBasePercentAdd: 0.5 * K,
  atSpunkBasePercentAdd: 0.5 * K,
  atAgilityBasePercentAdd: 0.5 * K,
  atStrengthBasePercentAdd: 0.5 * K,
};
/** 武器伤害按攻击的一半折算（外功） */
const WEAPON_KEY = "atMeleeWeaponDamageBase";

/** 每点属性的秒伤比例（相对不带增益的秒伤） */
function perPointPct(lo: Loadout): Partial<Record<Attr, number>> {
  const out: Partial<Record<Attr, number>> = {};
  const secondaries: number[] = [];
  // 外功的攻击附魔是 891 点
  const outer = buffProfile(lo.xinfa).group === "外功";
  for (const g of lo.gains) {
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

export interface EffectResult {
  /** 秒伤比例（0.012 = 1.2%） */
  pct: number;
  /** 加速点数 */
  haste: number;
}

function evalEffects(
  rows: EffectRow[],
  mult: number,
  pp: Partial<Record<Attr, number>>,
  main: string
): EffectResult {
  let pct = 0;
  let haste = 0;
  for (const [key, raw] of rows) {
    const v = raw * mult;
    const attr = POINT_KEYS[key];
    if (attr === "加速") {
      haste += v;
    } else if (attr === "MAIN") {
      pct += v * (pp[main as Attr] ?? 0);
    } else if (attr) {
      // 别的主属性对本心法没用（比如紫霞功吃元气）
      if (["根骨", "元气", "身法", "力道"].includes(attr) && attr !== main) {
        continue;
      }
      pct += v * (pp[attr] ?? 0);
    } else if (key in PCT_KEYS) {
      pct += v * PCT_KEYS[key];
    } else if (key === WEAPON_KEY) {
      pct += v * ((pp["攻击"] ?? 0) * 0.5);
    }
  }
  return { pct, haste };
}

export interface BuffEstimate {
  /** 合计秒伤比例 */
  pct: number;
  /** 增益给的加速点数 */
  haste: number;
  /** 加速跨段带来的比例 */
  hastePct: number;
  zhen: number;
  foods: number;
  team: number;
  /** 每一项单独的秒伤比例，键是名字 */
  items: Record<string, number>;
}

const EMPTY_ESTIMATE: BuffEstimate = {
  pct: 0,
  haste: 0,
  hastePct: 0,
  zhen: 0,
  foods: 0,
  team: 0,
  items: {},
};

function tierIndex(value: number) {
  let idx = 0;
  HASTE_TIERS.forEach((t, i) => {
    if (value >= t.value) idx = i;
  });
  return idx;
}

/** 加速段位：带上增益给的加速后重新算 */
export function hasteWithBuffs(lo: Loadout, extra: number) {
  const value = Math.round(lo.haste.value + extra);
  const idx = tierIndex(value);
  const cur = HASTE_TIERS[idx];
  const next = HASTE_TIERS[idx + 1];
  return {
    value,
    tier: cur.tier,
    from: cur.value,
    nextTier: next?.tier ?? null,
    nextValue: next?.value ?? null,
  };
}

/** 一组属性单独给这套配装带来的秒伤比例（用于下拉选项和每行右边的数字） */
export function effectPct(lo: Loadout, rows: EffectRow[], mult = 1): number {
  const pp = perPointPct(lo);
  const main = buffProfile(lo.xinfa).main;
  return evalEffects(rows, mult, pp, main).pct;
}

export function teamMult(def: TeamDef, st: TeamBuffState) {
  return ((def.maxL ? st.layers : 1) * st.cov) / 100;
}

export function estimateBuffs(
  lo: Loadout,
  sel: BuffSelection | undefined
): BuffEstimate {
  if (!sel) return EMPTY_ESTIMATE;
  const g = buffGroup(lo.xinfa);
  const pp = perPointPct(lo);
  const main = buffProfile(lo.xinfa).main;
  const items: Record<string, number> = {};
  let haste = 0;

  let zhen = 0;
  const z = g.zhen.find(x => x.n === sel.zhen);
  if (z) {
    const r = evalEffects(z.e, 1, pp, main);
    zhen = r.pct;
    haste += r.haste;
    items[z.n] = r.pct;
  }

  let foods = 0;
  for (const name of Object.values(sel.foods)) {
    const f = g.foods.find(x => x.n === name);
    if (!f) continue;
    const r = evalEffects(f.e, 1, pp, main);
    foods += r.pct;
    haste += r.haste;
    items[f.n] = r.pct;
  }

  let team = 0;
  for (const [name, st] of Object.entries(sel.team)) {
    if (!st.on) continue;
    const def = g.team.find(x => x.n === name);
    if (!def) continue;
    const r = evalEffects(def.e, teamMult(def, st), pp, main);
    team += r.pct;
    haste += r.haste;
    items[def.n] = r.pct;
  }

  // 加速跨段：每跨一段按 2% 估
  const tiers = tierIndex(lo.haste.value + haste) - tierIndex(lo.haste.value);
  const hastePct = Math.max(0, tiers) * 0.02;

  return {
    pct: zhen + foods + team + hastePct,
    haste,
    hastePct,
    zhen,
    foods,
    team,
    items,
  };
}

/** 带增益的秒伤（估算）；没加增益就是导入时的木桩秒伤 */
export function buffedDps(lo: Loadout): number {
  return Math.round(lo.dps * (1 + estimateBuffs(lo, lo.buffs).pct));
}

export function buffFactor(lo: Loadout): number {
  return 1 + estimateBuffs(lo, lo.buffs).pct;
}

/** 当前增益的简称：预设名、自定义或不加增益 */
export function buffLabel(sel: BuffSelection | undefined): string {
  if (!sel || sel.preset === "清空增益") return "不加增益";
  if (sel.preset) return PRESET_LABEL[sel.preset] ?? sel.preset;
  return "自定义增益";
}

/* ---------- 属性说明 ---------- */

const KEY_LABEL: Record<string, [string, "pt" | "k" | "rate" | "frac"]> = {
  atStrainBase: ["无双", "pt"],
  atAllTypeCriticalStrike: ["会心", "pt"],
  atAllOvercome: ["破防", "pt"],
  atPhysicsOvercomeBase: ["破防", "pt"],
  atSurplusValueBase: ["破招", "pt"],
  atHasteBase: ["加速", "pt"],
  atAllTypeCriticalDamagePowerBase: ["会效", "pt"],
  allAttackPowerBase: ["攻击", "pt"],
  atMagicAttackPowerBase: ["内攻", "pt"],
  atPhysicsAttackPowerBase: ["外攻", "pt"],
  atSpiritBase: ["根骨", "pt"],
  atSpunkBase: ["元气", "pt"],
  atAgilityBase: ["身法", "pt"],
  atStrengthBase: ["力道", "pt"],
  atBasePotentialAdd: ["全属性", "pt"],
  atMeleeWeaponDamageBase: ["武伤", "pt"],
  atMaxLifeAdditional: ["气血", "pt"],
  atMagicAttackPowerPercent: ["内攻", "k"],
  atPhysicsAttackPowerPercent: ["外攻", "k"],
  allAttackPowerPercent: ["攻击", "k"],
  atMagicOvercomePercent: ["破防", "k"],
  atPhysicsOvercomePercent: ["破防", "k"],
  atMagicCriticalDamagePowerBaseKiloNumRate: ["会效", "k"],
  atPhysicsCriticalDamagePowerBaseKiloNumRate: ["会效", "k"],
  atAllCriticalDamagePowerBaseKiloNumRate: ["会效", "k"],
  atStrainRate: ["无双", "k"],
  atMagicCriticalStrikeBaseRate: ["会心", "rate"],
  atPhysicsCriticalStrikeBaseRate: ["会心", "rate"],
  atAllCriticalStrikeBaseRate: ["会心", "rate"],
  atSkillDamageCommonAdd: ["伤害", "frac"],
  atActivityDamageFinalCof: ["伤害", "frac"],
};

/** 小药、阵眼的属性摘要：攻击 +2,236 · 会心 +3% */
export function effectSummary(rows: EffectRow[], max = 3): string {
  const parts: string[] = [];
  for (const [key, v] of rows) {
    const l = KEY_LABEL[key];
    if (!l || v === 0) continue;
    const [name, kind] = l;
    const sign = v > 0 ? "+" : "−";
    const a = Math.abs(v);
    const val =
      kind === "pt"
        ? a.toLocaleString("zh-CN", { maximumFractionDigits: 0 })
        : kind === "k"
          ? `${Math.round((a / 1024) * 1000) / 10}%`
          : `${Math.round(a * 1000) / 10}%`;
    parts.push(`${name} ${sign}${val}`);
    if (parts.length >= max) break;
  }
  return parts.join(" · ");
}

/** 0.0123 → "1.23%" */
export function fmtPct(p: number, digits = 2): string {
  return `${(p * 100).toFixed(digits)}%`;
}
