import type { BuffSelection } from "@/lib/buffs";
import {
  ALL_HERO,
  addDelta,
  bestEnchant,
  bestStone,
  configDelta,
  deltaDpsPct,
  isOuter,
  perPoint,
  type BigEnchants,
  type GearConfig,
  type StatDelta,
} from "./enchants";
import {
  GEM_MAX,
  decodeEquip,
  getEquipDb,
  itemDelta,
  itemTags,
  maxRefine,
  poolFor,
  qualityOf,
  type EquipDb,
  type EquipDef,
} from "./equip";
import { gearIconId } from "./gearIcons";
import { SEED_EQUIP_ROWS, SEED_ZIXIA, SEED_ZIXIA_ALT } from "./seedEquip";
import { tx } from "@/lib/i18n";
/**
 * 配装与木桩（原型）。
 *
 * 云间鹤（紫霞功）用引用任务「配装和木桩」里实测的结果：
 * 开源「在线配装计算器」本地构建，紫霞功默认方案，134 级木桩，304 秒。
 * 其他心法导入后用 makeLoadout() 生成示例数值，界面标"示例数据"。
 */

export type Attr =
  | "无双"
  | "会心"
  | "攻击"
  | "根骨"
  | "身法"
  | "元气"
  | "力道"
  | "破防"
  | "会心效果"
  | "破招"
  | "加速";

/** 每多加一个该属性的附魔，秒伤增加多少 */
export interface AttrGain {
  attr: Attr;
  dps: number;
  pct: number;
}

export interface GearItem {
  name: string;
  quality: "purple" | "orange";
  /** 游戏图标编号，见 gearIcons.ts */
  iconId?: number;
  /** 精炼、镶嵌，例如"精 6 · 镶 8/8" */
  detail: string;
  /** 这件装备的主要属性 */
  tags: Attr[];
}

export type SlotGroup = "防具" | "饰品" | "武器";

export interface GearSlot {
  key: string;
  label: string;
  /** 图标里的一个字 */
  short: string;
  group: SlotGroup;
  item: GearItem;
  /** 小附魔 id，见 enchants.ts；换装备时保留 */
  enchant: string | null;
  /** 装备库里的这件装备（快照）；null 是装备库没加载时生成的示例装备 */
  def: EquipDef | null;
  /** 精炼等级，0–6（橙武 0–8） */
  refine: number;
  /** 每个五行石孔的等级，0 是没镶 */
  gems: number[];
}

export interface DpsPoint {
  at: string;
  dps: number;
  /** 图上的标注 */
  label?: string;
  kind?: "gear" | "patch" | "import";
  /** 标注的补充说明，例如"第 7 重 抱一 → 正气" */
  detail?: string;
}

/** 配装从哪里来：三种导入，或者不导入、手动配 */
export type LoadoutSource = "myplugin" | "jx3box" | "json" | "manual";

/**
 * 面板属性（不含增益），和魔盒配装器的面板一样按"等级"存，百分比用 LEVEL_COEF 换算。
 * 加速单独放在 Loadout.haste 里，因为它按段位生效。
 */
export interface PanelStats {
  /** 装分 */
  score: number;
  /** 最终气血上限 */
  hp: number;
  vitality: number;
  /** 主属性：根骨、身法、元气或力道，见 primaryAttr() */
  primary: number;
  baseAttack: number;
  /** 面板攻击 */
  attack: number;
  critLv: number;
  critDmgLv: number;
  overcomeLv: number;
  strainLv: number;
  surplus: number;
  /** 全能等级，PVE 配装一般是 0 */
  versatility: number;
}

/**
 * 130 级属性系数：100% 对应的等级。
 * 来源：计算器 src/数据/常量 属性系数 × (1155 × 130 − 130350)
 */
export const LEVEL_COEF = {
  crit: 9.985 * 19800,
  critDmg: 3.679 * 19800,
  overcome: 11.412 * 19800,
  strain: 6.734 * 19800,
  haste: 10.61 * 19800,
};

/** 面板上显示的百分数，例如 28.28 */
export const panelPct = {
  crit: (p: PanelStats) => Math.min((p.critLv / LEVEL_COEF.crit) * 100, 100),
  critDmg: (p: PanelStats) =>
    Math.min(175 + (p.critDmgLv / LEVEL_COEF.critDmg) * 100, 300),
  overcome: (p: PanelStats) => (p.overcomeLv / LEVEL_COEF.overcome) * 100,
  strain: (p: PanelStats) => (p.strainLv / LEVEL_COEF.strain) * 100,
  haste: (value: number) => Math.min(value / LEVEL_COEF.haste, 0.25) * 100,
};

/** 配装属于本人，按心法建；关联角色是可选的 */
export interface Loadout {
  id: string;
  xinfa: string;
  /** 关联的角色；只按心法建配装时为 null */
  charId: string | null;
  source: LoadoutSource;
  /** 魔盒方案 ID；装备码、数据版 JSON 导入时为 null */
  sourceId: string | null;
  /** 配装名，用户自己起，例如"毕业""过渡" */
  name: string;
  importedAt: string;
  target: string;
  dps: number;
  haste: { value: number; tier: string; nextTier: string; nextValue: number };
  panel: PanelStats;
  /** 大附魔：帽、衣、腰、腕、鞋 */
  big: BigEnchants;
  /** 主武器的五彩石名称；没镶是 null */
  stone: string | null;
  gains: AttrGain[];
  slots: GearSlot[];
  history: DpsPoint[];
  /** 生成的示例数值（不是实测） */
  sample: boolean;
  /** 小药、团队增益、阵眼；没有就是不加增益 */
  buffs?: BuffSelection;
  /**
   * 最近一次从内置原版计算器带回结果的时间、计算器里的角色 id，
   * 当时备忘录这边的装备签名（见 lib/dpsCalc.ts gearSig），
   * 以及计算器装备库里没有、装分和秒伤没算进去的部位
   */
  calc?: {
    at: string;
    roleId: string;
    sig: string;
    missing?: string[];
    /** 计算器面板上的百分比（新赛季系数），有就直接显示，不用备忘录的系数换算 */
    pct?: CalcPct;
    /** 计算器里的小附魔简写，按部位 */
    enchants?: Record<string, string>;
  };
}

/** 原版计算器算好的面板百分比，都是保留两位的百分数 */
export interface CalcPct {
  crit: number;
  critDmg: number;
  overcome: number;
  strain: number;
  haste: number;
}

/**
 * 第一次用原版计算器算出来的那一笔秒伤记录的标签。
 * 这之前的点是备忘录按上赛季估算的，和原版计算器的数量级不同，不放在一起比
 */
export const CALC_SWITCH_LABEL = "换成原版计算器";

/** 能放在一起比的秒伤记录：从最近一次换成原版计算器那一笔开始 */
export function comparableHistory(history: DpsPoint[]): DpsPoint[] {
  const i = history.map(p => p.label).lastIndexOf(CALC_SWITCH_LABEL);
  return i > 0 ? history.slice(i) : history;
}

/** 加速段位阈值（1.5 秒 GCD），取自上游源码 */
export const HASTE_TIERS = [
  { tier: "零段", value: 0 },
  { tier: "一段", value: 206 },
  { tier: "二段", value: 9232 },
];

export function hasteOf(value: number): Loadout["haste"] {
  let i = 0;
  while (i + 1 < HASTE_TIERS.length && value >= HASTE_TIERS[i + 1].value) i++;
  const next = HASTE_TIERS[i + 1] ?? HASTE_TIERS[i];
  return {
    value,
    tier: HASTE_TIERS[i].tier,
    nextTier: next.tier,
    nextValue: next.value,
  };
}

const SLOT_DEFS: Array<
  Pick<GearSlot, "key" | "label" | "short" | "group"> & { tags: Attr[] }
> = [
  {
    key: "hat",
    label: "帽子",
    short: "帽",
    group: "防具",
    tags: ["会心", "破防"],
  },
  {
    key: "coat",
    label: "上衣",
    short: "衣",
    group: "防具",
    tags: ["破防", "无双"],
  },
  {
    key: "belt",
    label: "腰带",
    short: "腰",
    group: "防具",
    tags: ["会心效果", "破防"],
  },
  {
    key: "wrist",
    label: "护腕",
    short: "腕",
    group: "防具",
    tags: ["加速", "破防"],
  },
  {
    key: "pants",
    label: "下装",
    short: "裤",
    group: "防具",
    tags: ["会心", "无双"],
  },
  {
    key: "shoes",
    label: "鞋子",
    short: "鞋",
    group: "防具",
    tags: ["破招", "破防"],
  },
  {
    key: "neck",
    label: "项链",
    short: "链",
    group: "饰品",
    tags: ["会心", "会心效果"],
  },
  {
    key: "pendant",
    label: "腰坠",
    short: "坠",
    group: "饰品",
    tags: ["破防", "无双"],
  },
  {
    key: "ring1",
    label: "戒指 1",
    short: "戒",
    group: "饰品",
    tags: ["会心效果", "破招"],
  },
  {
    key: "ring2",
    label: "戒指 2",
    short: "戒",
    group: "饰品",
    tags: ["破防", "会心"],
  },
  {
    key: "weapon",
    label: "主武器",
    short: "剑",
    group: "武器",
    tags: ["会心", "破防"],
  },
  {
    key: "hidden",
    label: "暗器",
    short: "暗",
    group: "武器",
    tags: ["会心"],
  },
];

const PRIMARY: Record<string, Attr> = {
  花间游: "元气",
  山居剑意: "身法",
  山海心诀: "身法",
  傲血战意: "力道",
  分山劲: "身法",
  孤锋诀: "身法",
  北傲诀: "力道",
  凌海诀: "身法",
  隐龙诀: "身法",
  惊羽诀: "力道",
  问水诀: "身法",
  笑尘诀: "力道",
  太虚剑意: "身法",
  太玄经: "元气",
  焚影圣诀: "元气",
  易筋经: "元气",
  天罗诡道: "元气",
  毒经: "根骨",
  莫问: "根骨",
  无方: "根骨",
};

export function primaryAttr(xinfa: string): Attr {
  return PRIMARY[xinfa] ?? "根骨";
}

/** 稳定的伪随机：同一个输入每次得到同一个数 */
function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** 装备库没加载时的示例部位（只有名称和词条，不参与属性计算） */
function legacySlots(xinfa: string): GearSlot[] {
  return SLOT_DEFS.map(({ tags, ...def }) => ({
    ...def,
    short: def.key === "weapon" ? weaponShort(xinfa) : def.short,
    enchant: null,
    def: null,
    refine: 6,
    gems: [],
    item: {
      name: `${def.label}·${tags.join(" ")}`,
      quality: def.key === "weapon" ? "orange" : "purple",
      iconId: gearIconId(xinfa, def.key),
      detail: "精 6",
      tags,
    },
  }));
}

/** 装备的显示信息：名称、品质、图标、精炼和镶嵌、二级属性 */
export function itemOf(
  def: EquipDef,
  refine: number,
  gems: number[]
): GearItem {
  return {
    name: def.name,
    quality: qualityOf(def),
    iconId: def.iconId,
    detail: gems.length
      ? `精 ${refine} · 镶 ${gems.join("/")}`
      : `精 ${refine}`,
    tags: itemTags(def),
  };
}

/**
 * 部位换上一件装备：精炼拉满；五行石按孔继承原来的等级，
 * 多出来的孔用原来最高的等级（原来没孔就 8 级）。小附魔保留。
 */
export function equipSlot(slot: GearSlot, def: EquipDef): GearSlot {
  const fallback = slot.gems.length ? Math.max(...slot.gems) : GEM_MAX;
  const gems = def.holes.map((_, i) => slot.gems[i] ?? fallback);
  const refine = maxRefine(def);
  return { ...slot, def, refine, gems, item: itemOf(def, refine, gems) };
}

export function refineSlot(slot: GearSlot, refine: number): GearSlot {
  if (!slot.def) return slot;
  const r = Math.max(0, Math.min(maxRefine(slot.def), refine));
  return { ...slot, refine: r, item: itemOf(slot.def, r, slot.gems) };
}

export function gemSlot(
  slot: GearSlot,
  index: number,
  level: number
): GearSlot {
  if (!slot.def || index >= slot.gems.length) return slot;
  const gems = slot.gems.map((g, i) => (i === index ? level : g));
  return { ...slot, gems, item: itemOf(slot.def, slot.refine, gems) };
}

/** 一个部位的装备（含精炼、镶嵌）给的属性；示例装备按 0 算 */
function slotStats(slot: GearSlot, main: Attr): StatDelta {
  return slot.def
    ? itemDelta(slot.def, slot.refine, slot.gems, main, isOuter(main))
    : {};
}

/** 部位从 a 换成 b 的属性变化（不含小附魔） */
export function slotChange(a: GearSlot, b: GearSlot, main: Attr): StatDelta {
  return addDelta(slotStats(b, main), slotStats(a, main), -1);
}

/** 配装器里还没保存的改动：全身装备（含小附魔、精炼、镶嵌）、大附魔、五彩石 */
export interface GearDraft {
  slots: GearSlot[];
  big: BigEnchants;
  stone: string | null;
}

export function draftOf(lo: Loadout): GearDraft {
  return { slots: lo.slots, big: lo.big, stone: lo.stone };
}

/** 草稿相对已保存配装的属性变化 */
export function draftDelta(lo: Loadout, d: GearDraft): StatDelta {
  const main = primaryAttr(lo.xinfa);
  let out = configDelta(main, configOf(lo), configOf(d));
  for (const s of d.slots) {
    const old = lo.slots.find(x => x.key === s.key);
    if (old && old !== s) out = addDelta(out, slotChange(old, s, main));
  }
  return out;
}

export interface DraftEval {
  panel: PanelStats;
  hasteValue: number;
  /** 不含增益的秒伤（估算） */
  dps: number;
  /** 相对已保存配装的秒伤比例（0.01 = 1%） */
  pct: number;
}

export function evalDraft(lo: Loadout, d: GearDraft): DraftEval {
  const main = primaryAttr(lo.xinfa);
  const delta = draftDelta(lo, d);
  const adj = applyDeltaToPanel(lo.panel, lo.haste.value, delta, main);
  const pct = statDeltaDpsPct(lo, delta);
  return {
    panel: adj.panel,
    hasteValue: adj.hasteValue,
    dps: Math.round(lo.dps * (1 + pct)),
    pct,
  };
}

/** 在草稿上再做一处改动的秒伤比例（相对草稿）。加速按草稿当前的段位算 */
export function changePct(lo: Loadout, ev: DraftEval, change: StatDelta) {
  const main = primaryAttr(lo.xinfa);
  const pp = perPoint(lo.gains, isOuter(main));
  const from = hasteTierIndex(ev.hasteValue);
  const to = hasteTierIndex(Math.max(0, ev.hasteValue + (change.haste ?? 0)));
  const p =
    deltaDpsPct(change, pp, main, ev.panel.primary) + (to - from) * 0.02;
  return ev.dps ? (p * lo.dps) / ev.dps : p;
}

/** 把草稿存进配装：面板、加速、秒伤一起更新 */
export function applyDraft(lo: Loadout, d: GearDraft): Loadout {
  const ev = evalDraft(lo, d);
  return {
    ...lo,
    slots: d.slots,
    big: { ...d.big },
    stone: d.stone,
    panel: ev.panel,
    haste: hasteOf(ev.hasteValue),
    dps: ev.dps,
  };
}

/** 草稿里改了哪些地方，例如 ["帽子", "大附魔", "五彩石"] */
export function draftChanges(lo: Loadout, d: GearDraft): string[] {
  const out: string[] = [];
  for (const s of d.slots) {
    const old = lo.slots.find(x => x.key === s.key);
    if (!old || old === s) continue;
    if (
      old.def?.id !== s.def?.id ||
      old.item.name !== s.item.name ||
      old.refine !== s.refine ||
      old.gems.join() !== s.gems.join() ||
      old.enchant !== s.enchant
    )
      out.push(s.label);
  }
  const bigKeys = Object.keys(d.big) as (keyof BigEnchants)[];
  if (bigKeys.some(k => d.big[k] !== lo.big[k])) out.push("大附魔");
  if (d.stone !== lo.stone) out.push("五彩石");
  return out;
}

/** 装备库里提升最大的一件（看板"下一步建议"）；pct 单位是 % */
export function bestUpgrade(lo: Loadout, db: EquipDb) {
  const main = primaryAttr(lo.xinfa);
  const ev = evalDraft(lo, draftOf(lo));
  let best: {
    slotKey: string;
    slotLabel: string;
    itemId: number;
    name: string;
    pct: number;
  } | null = null;
  for (const slot of lo.slots) {
    for (const def of poolFor(db, slot.key, lo.xinfa, main)) {
      if (def.id === slot.def?.id) continue;
      const pct =
        changePct(lo, ev, slotChange(slot, equipSlot(slot, def), main)) * 100;
      if (pct > 0 && (!best || pct > best.pct))
        best = {
          slotKey: slot.key,
          slotLabel: slot.label,
          itemId: def.id,
          name: def.name,
          pct,
        };
    }
  }
  return best;
}

/**
 * 主属性每一点顺带加的攻击、会心、破防（示例系数）。
 * 紫霞功实际是：根骨 → 面板攻击 1946/1024，会心 0.9 + 625/1024。
 */
const MAIN_CONV: Record<
  string,
  { attack: number; crit: number; overcome: number }
> = {
  根骨: { attack: 1.9, crit: 1.51, overcome: 0 },
  元气: { attack: 1.85, crit: 0, overcome: 0.3 },
  身法: { attack: 1.45, crit: 0.9, overcome: 0 },
  力道: { attack: 1.6, crit: 0, overcome: 0.3 },
};
/** 体质转气血 10 点，再乘心法基础气血加成（紫霞功 307/1024） */
const HP_MULT = 1 + 307 / 1024;

/** 把一组属性变化加到面板和加速上 */
export function applyDeltaToPanel(
  panel: PanelStats,
  hasteValue: number,
  d: StatDelta,
  main: Attr
): { panel: PanelStats; hasteValue: number } {
  const conv = MAIN_CONV[main] ?? MAIN_CONV["根骨"];
  const primary =
    (d.primary ?? 0) + Math.floor((panel.primary * (d.primaryPct ?? 0)) / 1024);
  const r = Math.round;
  return {
    panel: {
      ...panel,
      score: panel.score + (d.score ?? 0),
      vitality: panel.vitality + (d.vitality ?? 0),
      hp: r(panel.hp + ((d.vitality ?? 0) * 10 + (d.hp ?? 0)) * HP_MULT),
      primary: panel.primary + primary,
      baseAttack: panel.baseAttack + (d.baseAttack ?? 0),
      attack: r(panel.attack + (d.baseAttack ?? 0) + primary * conv.attack),
      critLv: r(panel.critLv + (d.critLv ?? 0) + primary * conv.crit),
      critDmgLv: panel.critDmgLv + (d.critDmgLv ?? 0),
      overcomeLv: r(
        panel.overcomeLv + (d.overcomeLv ?? 0) + primary * conv.overcome
      ),
      strainLv: panel.strainLv + (d.strainLv ?? 0),
      surplus: panel.surplus + (d.surplus ?? 0),
    },
    hasteValue: Math.max(0, hasteValue + (d.haste ?? 0)),
  };
}

/** 这个心法默认配装的面板（示例数值，已经算上默认的附魔和五彩石） */
function basePanel(xinfa: string): PanelStats {
  const h = (k: string) => hash(`${xinfa}-panel-${k}`);
  const lv = (coef: number, pct: number) => Math.round((coef * pct) / 100);
  const vitality = Math.round(132000 + h("v") * 8000);
  const attack = Math.round(64000 + h("a") * 7000);
  return {
    score: Math.round(505000 + h("sc") * 14000),
    vitality,
    hp: Math.round((158000 + vitality * 10) * HP_MULT),
    primary: Math.round(7400 + h("p") * 900),
    baseAttack: Math.round(attack * 0.76),
    attack,
    critLv: lv(LEVEL_COEF.crit, 24 + h("c") * 6),
    critDmgLv: lv(LEVEL_COEF.critDmg, 3 + h("cd") * 10),
    overcomeLv: lv(LEVEL_COEF.overcome, 19 + h("o") * 5),
    strainLv: lv(LEVEL_COEF.strain, 60 + h("s") * 8),
    surplus: Math.round(10800 + h("su") * 2200),
    versatility: 0,
  };
}

/** 这套配装当前的附魔和五彩石 */
export function configOf(
  lo: Pick<Loadout, "slots" | "big" | "stone">
): GearConfig {
  return {
    enchants: Object.fromEntries(lo.slots.map(s => [s.key, s.enchant])),
    big: { ...lo.big },
    stone: lo.stone,
  };
}

/** 新建配装的默认附魔：每个部位挑秒伤最高的，大附魔全英雄，五彩石挑不带加速的里秒伤最高的 */
function defaultConfig(
  xinfa: string,
  gains: AttrGain[],
  primaryBase: number
): GearConfig {
  const main = primaryAttr(xinfa);
  const pp = perPoint(gains, isOuter(main));
  return {
    enchants: Object.fromEntries(
      SLOT_DEFS.map(d => [d.key, bestEnchant(main, d.key, pp, primaryBase)])
    ),
    big: { ...ALL_HERO },
    stone: bestStone(main, pp, primaryBase),
  };
}

function hasteTierIndex(value: number) {
  let i = 0;
  HASTE_TIERS.forEach((t, idx) => {
    if (value >= t.value) i = idx;
  });
  return i;
}

/**
 * 一组属性变化给这套配装带来的秒伤比例（0.01 = 1%）。
 * 按属性收益折算；加速每跨一段 ±2%，和增益页一致。
 */
export function statDeltaDpsPct(lo: Loadout, d: StatDelta) {
  const main = primaryAttr(lo.xinfa);
  const pp = perPoint(lo.gains, isOuter(main));
  const tierFrom = hasteTierIndex(lo.haste.value);
  const tierTo = hasteTierIndex(Math.max(0, lo.haste.value + (d.haste ?? 0)));
  return (
    deltaDpsPct(d, pp, main, lo.panel.primary) + (tierTo - tierFrom) * 0.02
  );
}

/** 换附魔、大附魔、五彩石：面板、加速、秒伤一起重算。秒伤是估算 */
export function applyConfig(lo: Loadout, next: GearConfig): Loadout {
  const main = primaryAttr(lo.xinfa);
  const d = configDelta(main, configOf(lo), next);
  const adj = applyDeltaToPanel(lo.panel, lo.haste.value, d, main);
  const pct = statDeltaDpsPct(lo, d);
  return {
    ...lo,
    dps: Math.round(lo.dps * (1 + pct)),
    panel: adj.panel,
    haste: hasteOf(adj.hasteValue),
    slots: lo.slots.map(s => ({ ...s, enchant: next.enchants[s.key] ?? null })),
    big: { ...next.big },
    stone: next.stone,
  };
}

function weaponShort(xinfa: string) {
  const map: Record<string, string> = {
    紫霞功: "剑",
    冰心诀: "剑",
    花间游: "笔",
    山海心诀: "弓",
  };
  return map[xinfa] ?? "武";
}

/**
 * 生成一份示例配装（导入后用）。
 * variant 为空时是这个心法的默认配装；同一心法再建一套时传配装 id，换几件装备，数值也跟着变。
 */
export function makeLoadout(opts: {
  id: string;
  xinfa: string;
  name: string;
  charId: string | null;
  source: LoadoutSource;
  sourceId: string | null;
  at?: string;
  variant?: string;
}): Loadout {
  const { id, xinfa, name, charId, source, sourceId, variant } = opts;
  const at = opts.at ?? new Date().toISOString();
  const r = hash(xinfa);
  const baseDps = Math.round(2_150_000 + r * 260_000);
  const primary = primaryAttr(xinfa);
  const order: Attr[] = [
    "无双",
    "会心",
    "攻击",
    primary,
    "破防",
    "会心效果",
    "破招",
  ];
  // 按心法稍微打乱前几名的顺序（排序键固定，结果稳定）
  const shuffled = order
    .map((a, i) => ({ a, k: i + hash(`${xinfa}-${a}`) * 2.2 }))
    .sort((x, y) => x.k - y.k)
    .map(x => x.a);
  const gains: AttrGain[] = shuffled
    .map((attr, i) => {
      const pct =
        Math.round((1.42 - i * 0.075 - hash(`${xinfa}-g${i}`) * 0.04) * 100) /
        100;
      return { attr, pct, dps: Math.round((baseDps * pct) / 100) };
    })
    .sort((a, b) => b.pct - a.pct);
  const panel0 = basePanel(xinfa);
  const cfg = defaultConfig(xinfa, gains, panel0.primary);
  const db = getEquipDb(primary);
  const pp = perPoint(gains, isOuter(primary));
  // 从装备库挑：品级 35xxx 的普通装备里按属性收益排序，取第 nth 件
  const pick = (slot: GearSlot, nth: number) => {
    if (!db) return slot;
    const pool = poolFor(db, slot.key, xinfa, primary);
    const tier = pool.filter(
      d => d.ilvl >= 35000 && d.ilvl < 36000 && d.type === "普通"
    );
    const ranked = (tier.length ? tier : pool)
      .map(def => ({
        def,
        s: deltaDpsPct(
          itemDelta(
            def,
            maxRefine(def),
            def.holes.map(() => GEM_MAX),
            primary,
            isOuter(primary)
          ),
          pp,
          primary,
          panel0.primary
        ),
      }))
      .sort((a, b) => b.s - a.s);
    if (!ranked.length) return slot;
    return equipSlot(slot, ranked[Math.min(nth, ranked.length - 1)].def);
  };
  const baseSlots = legacySlots(xinfa)
    .map(s => ({ ...s, enchant: cfg.enchants[s.key] ?? null }))
    .map(s => pick(s, s.key === "ring2" ? 1 : 0));
  const base: Loadout = {
    id,
    xinfa,
    charId,
    source,
    sourceId,
    name,
    importedAt: at,
    target: "134 级木桩 · 304 秒",
    dps: baseDps,
    haste: hasteOf(Math.round(1200 + r * 2400)),
    panel: panel0,
    big: cfg.big,
    stone: cfg.stone,
    gains,
    slots: baseSlots,
    history: [
      {
        at,
        dps: baseDps,
        label: source === "manual" ? "新建" : "导入",
        kind: "import",
      },
    ],
    sample: true,
  };
  if (!variant || !db) return base;
  // 同心法再建一套：随机换掉几件（同一个 variant 结果固定）
  const slots = baseSlots.map(s =>
    s.key !== "weapon" && hash(`${variant}-${s.key}`) < 0.4
      ? pick(s, 1 + Math.floor(hash(`${variant}-${s.key}-n`) * 3))
      : s
  );
  const next = applyDraft(base, { slots, big: base.big, stone: base.stone });
  return {
    ...next,
    history: [{ at, dps: next.dps, label: "导入", kind: "import" }],
  };
}

/** 计算器紫霞功默认方案的小附魔（种类照抄，数值用当前赛季） */
const ZIXIA_ENCHANTS: Record<string, string> = {
  hat: "攻击",
  coat: "无双·节日",
  belt: "无双·节日",
  wrist: "无双",
  pants: "无双",
  shoes: "攻击",
  neck: "体质",
  pendant: "体质",
  ring1: "攻击",
  ring2: "攻击",
  weapon: "攻击",
  hidden: "加速",
};

/** 云间鹤（紫霞功）：引用任务实测数据 + 示例历史 */
export function seedLoadoutZixia(): Loadout {
  const xinfa = "紫霞功";
  const gains: AttrGain[] = [
    { attr: "无双", dps: 32319, pct: 1.4 },
    { attr: "会心", dps: 31085, pct: 1.35 },
    { attr: "攻击", dps: 27756, pct: 1.21 },
    { attr: "根骨", dps: 26045, pct: 1.13 },
    { attr: "破防", dps: 24940, pct: 1.08 },
    { attr: "会心效果", dps: 23765, pct: 1.03 },
    { attr: "破招", dps: 21214, pct: 0.92 },
  ];
  const slots = seedSlots(xinfa, SEED_ZIXIA);
  return {
    id: "lo1",
    xinfa,
    charId: "c1",
    source: "jx3box",
    sourceId: "87412",
    name: "日常木桩",
    importedAt: "2026-09-06T20:30:00+08:00",
    target: "134 级木桩 · 304 秒",
    dps: 2302267,
    haste: { value: 2089, tier: "一段", nextTier: "二段", nextValue: 9232 },
    // 计算器紫霞功默认方案的面板（不含增益），推算过程见 research-notes.md
    panel: {
      score: 512287,
      hp: 1979703,
      vitality: 136220,
      primary: 7872,
      baseAttack: 52111,
      attack: 68320,
      critLv: 55908,
      critDmgLv: 7518,
      overcomeLv: 50253,
      strainLv: 88172,
      surplus: 12239,
      versatility: 0,
    },
    big: { ...ALL_HERO },
    stone: "彩·灭气·激流·月华(陆)",
    gains,
    slots,
    history: [
      {
        at: "2026-09-06T20:30:00+08:00",
        dps: 2215300,
        label: "导入",
        kind: "import",
      },
      { at: "2026-09-13T21:10:00+08:00", dps: 2231000 },
      {
        at: "2026-09-20T22:05:00+08:00",
        dps: 2262400,
        label: "换特效武器",
        kind: "gear",
      },
      { at: "2026-10-02T20:10:00+08:00", dps: 2268900 },
      { at: "2026-10-16T22:05:00+08:00", dps: 2283100 },
      {
        at: "2026-10-28T21:40:00+08:00",
        dps: 2302267,
        label: "v4 技改",
        kind: "patch",
        detail: "第 7 重 抱一 → 正气",
      },
    ],
    sample: false,
  };
}

const SEED_DEFS = new Map(
  SEED_EQUIP_ROWS.map(r => [r[0], decodeEquip(r)] as const)
);

/** 示例配装的部位：装备快照来自 seedEquip.ts，五行石 8 级、精炼满级 */
function seedSlots(xinfa: string, ids: Record<string, number>): GearSlot[] {
  return legacySlots(xinfa).map(s => {
    const def = SEED_DEFS.get(ids[s.key]);
    return {
      ...(def ? equipSlot(s, def) : s),
      enchant: ZIXIA_ENCHANTS[s.key] ?? null,
    };
  });
}

/** 第二套紫霞功配装（示例）：帽子、下装、腰坠、戒指 1 和五彩石换成无双，用来演示对比；不关联角色 */
export function seedLoadoutZixiaAlt(): Loadout {
  const base = seedLoadoutZixia();
  const next = applyDraft(base, {
    slots: seedSlots(base.xinfa, SEED_ZIXIA_ALT),
    big: base.big,
    stone: "彩·无双·激流·灭气(陆)",
  });
  return {
    ...next,
    id: "lo2",
    charId: null,
    name: "无双流",
    source: "myplugin",
    sourceId: null,
    importedAt: "2026-10-26T21:15:00+08:00",
    history: [
      {
        at: "2026-10-26T21:15:00+08:00",
        dps: Math.round(next.dps * 0.9962),
        label: "导入",
        kind: "import",
      },
      {
        at: "2026-10-28T21:40:00+08:00",
        dps: next.dps,
        label: "v4 技改",
        kind: "patch",
        detail: "第 7 重 抱一 → 正气",
      },
    ],
    sample: true,
  };
}

/**
 * 识别粘贴的内容：茗伊插件装备码、魔盒配装链接、方案 ID、数据版 JSON。
 * 装备码 = base64url(zlib(Lua 表文本))，zlib 头 0x78 编码后以 "e" 开头。
 * 格式参照开源机器人 Inkar-Suki 的 parse_plugin_data，还没用真实装备码验证。
 */
export type ImportKind = "mycode" | "link" | "id" | "json";
export type ParsedImport =
  | { ok: true; kind: ImportKind; sourceId: string | null; code?: string }
  | { ok: false; reason: string };

const MYCODE_RE = /^e[A-Za-z0-9_-]{40,}={0,2}$/;

export function parseImport(raw: string): ParsedImport {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "先粘贴装备码或魔盒配装链接" };
  const compact = text.replace(/\s+/g, "");
  if (MYCODE_RE.test(compact))
    return { ok: true, kind: "mycode", sourceId: null, code: compact };
  const link = text.match(/jx3box\.com\/pz\/(?:view\/)?(\d{3,10})/i);
  if (link) return { ok: true, kind: "link", sourceId: link[1] };
  if (/^\d{3,10}$/.test(text)) return { ok: true, kind: "id", sourceId: text };
  if (text.startsWith("{")) {
    try {
      JSON.parse(text);
      return { ok: true, kind: "json", sourceId: null };
    } catch {
      return {
        ok: false,
        reason: "JSON 格式不完整，从魔盒「数据版」里重新复制一次",
      };
    }
  }
  return {
    ok: false,
    reason: "认不出来。支持茗伊插件装备码、魔盒配装链接、方案 ID 和数据版 JSON",
  };
}

/** 取值时按当前语言翻译 */
export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  get mycode() {
    return tx("茗伊插件装备码");
  },
  get link() {
    return tx("魔盒配装链接");
  },
  get id() {
    return tx("魔盒方案 ID");
  },
  get json() {
    return tx("数据版 JSON");
  },
};

export const IMPORT_SOURCE: Record<ImportKind, LoadoutSource> = {
  mycode: "myplugin",
  link: "jx3box",
  id: "jx3box",
  json: "json",
};

export const SOURCE_LABEL: Record<LoadoutSource, string> = {
  get myplugin() {
    return tx("茗伊装备码");
  },
  get jx3box() {
    return tx("魔盒");
  },
  get json() {
    return tx("数据版 JSON");
  },
  get manual() {
    return tx("手动");
  },
};

/** 示例装备码：装备 ID 取自魔盒导入文档的样例，只用来演示格式 */
export const SAMPLE_MYCODE =
  "eNrFld9qwjAUh18og5zkJE0vcjGog8KQgb5AtGGW2SglnSul775OBf9gdZVqb0I4DeT70l9OqirZTM1sWq6tlmQ7j11ifzQiU7ArTIp97QWIm3gz_xoXmd7Oc-s-_eLdftulVsRFRW5m6TL1pWaKUmKi1GQrl4zcfGGc1xVDxJAcjXWzxYfNM-Os8_tlcaRBMh787W6z9So3eXn4RJty7G32Nno9FJUMatKuomg3FflflVZ8hC749AQ-OIYHoCDCx9Df-AUcxGWHRi-A7h6Si0E8GKpWDxne9lAnYVJI8dlhouLuMJ3BC-wf_solgL64Qyl6b0YP4T4PvRAwTOgltIdedj5_pejTQ99jB6V8oM4j-wtSMNArsDu7y68Au8OD8YE8rlwIbPOo619zmCRO";

export interface MyCodeSummary {
  items: number;
  strength: [number, number] | null;
  /** 五行石最高等级；没有镶嵌时为 null */
  stone: number | null;
}

/** 五行石物品编号 → 等级（取自 Inkar-Suki get_fivestone_level） */
function stoneLevel(id: number) {
  if (id >= 24442 && id <= 24449) return id - 24441;
  if (id >= 24423 && id <= 24430) return id - 24422;
  return null;
}

/** 解开装备码，只读出摘要用来给用户确认；解不开时抛错 */
export async function decodeMyCode(code: string): Promise<MyCodeSummary> {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  const text = await new Response(stream).text();
  if (!text.startsWith("{")) throw new Error("not a lua table");
  const ids = [...text.matchAll(/dwTabIndex=(\d+)/g)].filter(m => m[1] !== "0");
  if (ids.length === 0) throw new Error("no items");
  const str = [...text.matchAll(/nStrengthLevel=(\d+)/g)].map(m => +m[1]);
  const stones = [...text.matchAll(/aDiamondEnchant=\{([\d,]*)\}/g)]
    .flatMap(m => (m[1] ? m[1].split(",").map(Number) : []))
    .map(stoneLevel)
    .filter((x): x is number => x !== null);
  return {
    items: ids.length,
    strength: str.length ? [Math.min(...str), Math.max(...str)] : null,
    stone: stones.length ? Math.max(...stones) : null,
  };
}

/** 技改后重算：示例算法，按版本号给一个稳定的小幅变化 */
export function patchDelta(xinfa: string, version: number) {
  const r = hash(`${xinfa}-v${version}`);
  return Math.round((r - 0.4) * 1.6 * 100) / 100; // 约 −0.64% 到 +0.96%
}
