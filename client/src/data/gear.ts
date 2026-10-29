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
import { candidateIconId, gearIconId } from "./gearIcons";
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
}

export interface Effect {
  label: string;
  value: string;
  up: boolean;
}

export interface Candidate {
  id: string;
  name: string;
  source: string;
  quality: "purple" | "orange";
  /** 游戏图标编号，见 gearIcons.ts */
  iconId?: number;
  tags: Attr[];
  /** 秒伤提升百分比，相对当前配装 */
  pct: number;
  effects: Effect[];
  /** 反直觉结果的原因，例如"加速仍是一段，没有跨段" */
  note?: string;
  /** 正在穿的那件 */
  current?: boolean;
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

/** 配装从哪里导入 */
export type LoadoutSource = "myplugin" | "jx3box" | "json";

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
  candidates: Record<string, Candidate[]>;
  history: DpsPoint[];
  /** 生成的示例数值（不是实测） */
  sample: boolean;
  /** 小药、团队增益、阵眼；没有就是不加增益 */
  buffs?: BuffSelection;
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

const SLOT_DEFS: Array<Omit<GearSlot, "item" | "enchant"> & { tags: Attr[] }> =
  [
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

function itemDetail(slot: Omit<GearSlot, "item" | "enchant">) {
  if (slot.group === "武器" && slot.key === "weapon")
    return "特效武器 · 精 8 · 镶 8/8";
  if (slot.group === "饰品")
    return slot.key.startsWith("ring") ? "精 6 · 小附魔" : "精 6 · 镶 8";
  if (slot.key === "hidden") return "精 6 · 镶 8";
  return "精 6 · 镶 8/8";
}

/**
 * 生成全身装备。variant 为空时是这个心法的默认配装；
 * 不为空时按它随机换掉几件防具和饰品的属性组合（同一个 variant 结果固定）。
 */
function buildSlots(xinfa: string, variant?: string): GearSlot[] {
  return SLOT_DEFS.map(({ tags: baseTags, ...def }) => {
    let tags = baseTags;
    // 带加速的部位不换，避免加速掉段
    if (variant && def.group !== "武器" && !baseTags.includes("加速")) {
      const r = hash(`${variant}-${def.key}`);
      if (r < 0.4) {
        const pool = SWAP_PAIRS.filter(p => p.join() !== baseTags.join());
        tags = pool[Math.floor(hash(`${variant}-${def.key}-p`) * pool.length)];
      }
    }
    return {
      ...def,
      short: def.key === "weapon" ? weaponShort(xinfa) : def.short,
      enchant: null,
      item: {
        name: `${def.label}·${tags.join(" ")}`,
        quality: def.key === "weapon" ? "orange" : "purple",
        iconId: gearIconId(xinfa, def.key),
        detail: itemDetail(def),
        tags,
      },
    };
  });
}

/** 换装时可选的属性组合（不含加速，避免跨段位） */
const SWAP_PAIRS: Attr[][] = [
  ["无双", "会心"],
  ["无双", "破防"],
  ["会心", "攻击"],
  ["会心效果", "破招"],
  ["破防", "会心"],
  ["无双", "破招"],
];

/** 每多一条属性词条，面板加多少（示例数值，和试穿里的效果一致） */
const TAG_DELTA: Partial<Record<Attr, StatDelta>> = {
  攻击: { baseAttack: 420 },
  会心: { critLv: 2175 },
  会心效果: { critDmgLv: 2622 },
  破防: { overcomeLv: 2260 },
  无双: { strainLv: 1200 },
  破招: { surplus: 410 },
  加速: { haste: 2743 },
};

function tagsDelta(from: Attr[], to: Attr[]): StatDelta {
  let d: StatDelta = {};
  for (const t of from) d = addDelta(d, TAG_DELTA[t], -1);
  for (const t of to) d = addDelta(d, TAG_DELTA[t]);
  return d;
}

function slotsDelta(from: GearSlot[], to: GearSlot[]): StatDelta {
  let d: StatDelta = {};
  for (const s of to) {
    const old = from.find(x => x.key === s.key);
    if (old) d = addDelta(d, tagsDelta(old.item.tags, s.item.tags));
  }
  return d;
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

/** 按两套装备的词条差，调整面板和加速 */
function adjustPanel(
  panel: PanelStats,
  hasteValue: number,
  from: GearSlot[],
  to: GearSlot[],
  main: Attr
) {
  return applyDeltaToPanel(panel, hasteValue, slotsDelta(from, to), main);
}

/** 试穿：把一个部位换成这些词条后的面板和加速 */
export function swapPanel(lo: Loadout, slotKey: string, tags: Attr[]) {
  const slot = lo.slots.find(s => s.key === slotKey);
  if (!slot) return { panel: lo.panel, hasteValue: lo.haste.value };
  return applyDeltaToPanel(
    lo.panel,
    lo.haste.value,
    tagsDelta(slot.item.tags, tags),
    primaryAttr(lo.xinfa)
  );
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

/** 装备总分（示例算法）：换装后秒伤按分差变化 */
function slotsScore(slots: GearSlot[], gains: AttrGain[]) {
  return slots.reduce((sum, s) => sum + scorePair(s.item.tags, gains), 0);
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

const PCT_ATTR: Attr[] = ["会心", "会心效果", "破防", "无双", "加速"];

function effectValue(attr: Attr, sign: 1 | -1, seed: number) {
  if (PCT_ATTR.includes(attr)) {
    const v = (attr === "会心效果" ? 3.6 : 0.9 + seed * 0.4).toFixed(1);
    return `${sign > 0 ? "+" : "−"}${v}%`;
  }
  const v = Math.round(380 + seed * 80);
  return `${sign > 0 ? "+" : "−"}${v}`;
}

const SOURCES = ["秘境掉落", "商店兑换", "上赛季", "试炼之地"];
const PAIRS: Attr[][] = [
  ["无双", "会心"],
  ["无双", "破防"],
  ["会心", "攻击"],
  ["会心效果", "破招"],
  ["加速", "会心"],
  ["破招", "会心效果"],
  ["破防", "会心"],
  ["无双", "破招"],
];

/** 按属性收益给一件候选打分（示例算法，不是真实计算） */
function scorePair(tags: Attr[], gains: AttrGain[]) {
  const g = (a: Attr) => gains.find(x => x.attr === a)?.pct ?? 0;
  return tags.reduce((sum, a) => sum + g(a), 0) * 0.3;
}

function buildCandidates(
  xinfa: string,
  slots: GearSlot[],
  gains: AttrGain[]
): Record<string, Candidate[]> {
  const out: Record<string, Candidate[]> = {};
  for (const slot of slots) {
    if (slot.key === "weapon" || slot.key === "hidden") {
      out[slot.key] = [currentAsCandidate(slot)];
      continue;
    }
    const base = scorePair(slot.item.tags, gains);
    const pool = PAIRS.filter(
      p =>
        p.join() !== slot.item.tags.join() &&
        p.join() !== [...slot.item.tags].reverse().join()
    ).slice(0, 5);
    const list: Candidate[] = pool.map((tags, i) => {
      const r = hash(`${xinfa}-${slot.key}-${i}`);
      const hasHaste = tags.includes("加速");
      const pct = hasHaste
        ? -(0.05 + r * 0.1)
        : scorePair(tags, gains) - base + (r - 0.5) * 0.12;
      const added = tags.filter(t => !slot.item.tags.includes(t));
      const removed = slot.item.tags.filter(t => !tags.includes(t));
      return {
        id: `${slot.key}-${i}`,
        name: `${slot.label.replace(/ \d$/, "")} · ${tags.join(" ")}`,
        source: `${SOURCES[i % SOURCES.length]} · 精炼上限 6`,
        quality: "purple",
        iconId: candidateIconId(xinfa, slot.key, SOURCES[i % SOURCES.length]),
        tags,
        pct: Math.round(pct * 100) / 100,
        effects: [
          ...added.map(a => ({
            label: a,
            value: effectValue(a, 1, r),
            up: true,
          })),
          ...removed.map(a => ({
            label: a,
            value: effectValue(a, -1, r),
            up: false,
          })),
        ],
        note: hasHaste ? "加速仍是一段，没有跨段" : undefined,
      };
    });
    out[slot.key] = sortCandidates([...list, currentAsCandidate(slot)]);
  }
  return out;
}

function currentAsCandidate(slot: GearSlot): Candidate {
  return {
    id: `${slot.key}-current`,
    name: slot.item.name.replace("·", " · "),
    source: "已装备",
    quality: slot.item.quality,
    iconId: slot.item.iconId,
    tags: slot.item.tags,
    pct: 0,
    effects: [],
    current: true,
  };
}

export function sortCandidates(list: Candidate[]) {
  return [...list].sort((a, b) => b.pct - a.pct);
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
  const withEnchant = (list: GearSlot[]) =>
    list.map(s => ({ ...s, enchant: cfg.enchants[s.key] ?? null }));
  const baseSlots = withEnchant(buildSlots(xinfa));
  const slots = variant ? withEnchant(buildSlots(xinfa, variant)) : baseSlots;
  const adj = adjustPanel(
    panel0,
    Math.round(1200 + r * 2400),
    baseSlots,
    slots,
    primary
  );
  const dps = variant
    ? Math.round(
        baseDps *
          (1 +
            (slotsScore(slots, gains) - slotsScore(baseSlots, gains)) / 100 +
            (hash(`${variant}-dps`) - 0.5) * 0.004)
      )
    : baseDps;
  return {
    id,
    xinfa,
    charId,
    source,
    sourceId,
    name,
    importedAt: at,
    target: "134 级木桩 · 304 秒",
    dps,
    haste: hasteOf(adj.hasteValue),
    panel: adj.panel,
    big: cfg.big,
    stone: cfg.stone,
    gains,
    slots,
    candidates: buildCandidates(xinfa, slots, gains),
    history: [{ at, dps, label: "导入", kind: "import" }],
    sample: true,
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
  const slots = buildSlots(xinfa).map(s => ({
    ...s,
    enchant: ZIXIA_ENCHANTS[s.key] ?? null,
  }));
  const candidates = buildCandidates(xinfa, slots, gains);
  // 戒指 1：引用任务原型里的 6 件候选
  candidates.ring1 = sortCandidates([
    {
      id: "ring1-a",
      name: "戒指 · 无双 会心",
      source: "秘境掉落 · 精炼上限 6",
      quality: "purple",
      tags: ["无双", "会心"],
      pct: 0.82,
      effects: [
        { label: "无双", value: "+0.9%", up: true },
        { label: "会心", value: "+1.1%", up: true },
        { label: "会心效果", value: "−3.6%", up: false },
        { label: "破招", value: "−410", up: false },
      ],
    },
    {
      id: "ring1-b",
      name: "戒指 · 无双 破防",
      source: "秘境掉落 · 精炼上限 6",
      quality: "purple",
      tags: ["无双", "破防"],
      pct: 0.61,
      effects: [
        { label: "无双", value: "+0.9%", up: true },
        { label: "破防", value: "+1.0%", up: true },
        { label: "会心效果", value: "−3.6%", up: false },
        { label: "破招", value: "−410", up: false },
      ],
    },
    {
      id: "ring1-c",
      name: "戒指 · 会心 攻击",
      source: "商店兑换 · 精炼上限 6",
      quality: "purple",
      tags: ["会心", "攻击"],
      pct: 0.38,
      effects: [
        { label: "会心", value: "+1.1%", up: true },
        { label: "攻击", value: "+420", up: true },
        { label: "会心效果", value: "−3.6%", up: false },
        { label: "破招", value: "−410", up: false },
      ],
    },
    {
      id: "ring1-current",
      name: "戒指 · 会效 破招",
      source: "已装备",
      quality: "purple",
      tags: ["会心效果", "破招"],
      pct: 0,
      effects: [],
      current: true,
    },
    {
      id: "ring1-d",
      name: "戒指 · 加速 会心",
      source: "商店兑换 · 精炼上限 6",
      quality: "purple",
      tags: ["加速", "会心"],
      pct: -0.09,
      effects: [
        { label: "加速", value: "+1.3%", up: true },
        { label: "会心", value: "+1.1%", up: true },
      ],
      note: "加速仍是一段，没有跨段",
    },
    {
      id: "ring1-e",
      name: "戒指 · 破招 会效",
      source: "上赛季 · 精炼上限 6",
      quality: "purple",
      tags: ["破招", "会心效果"],
      pct: -0.36,
      effects: [
        { label: "会心效果", value: "−0.9%", up: false },
        { label: "破招", value: "−120", up: false },
      ],
    },
  ]);
  candidates.ring1 = candidates.ring1.map(c => ({
    ...c,
    iconId: c.iconId ?? candidateIconId(xinfa, "ring1", c.source, c.current),
  }));
  // 其他部位的最佳候选都压到 0.82% 以下，让"下一步建议"指向戒指 1
  for (const k of Object.keys(candidates)) {
    if (k === "ring1") continue;
    candidates[k] = sortCandidates(
      candidates[k].map(c =>
        c.pct > 0.6 ? { ...c, pct: Math.round(c.pct * 50) / 100 } : c
      )
    );
  }
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
    candidates,
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

/** 第二套紫霞功配装（示例）：换了戒指 1 和腰带，用来演示对比；不关联角色 */
export function seedLoadoutZixiaAlt(): Loadout {
  const base = seedLoadoutZixia();
  const swap: Record<string, Attr[]> = {
    ring1: ["无双", "会心"],
    belt: ["无双", "破防"],
  };
  const slots = base.slots.map(s =>
    swap[s.key]
      ? {
          ...s,
          item: {
            ...s.item,
            name: `${s.label.replace(/ \d$/, "")}·${swap[s.key].join(" ")}`,
            iconId: candidateIconId(base.xinfa, s.key, "秘境掉落"),
            tags: swap[s.key],
          },
        }
      : s
  );
  const main = primaryAttr(base.xinfa);
  const adj = adjustPanel(
    base.panel,
    base.haste.value,
    base.slots,
    slots,
    main
  );
  // 五彩石换成无双
  const stone = "彩·无双·激流·灭气(陆)";
  const withStone = applyDeltaToPanel(
    adj.panel,
    adj.hasteValue,
    configDelta(main, configOf(base), { ...configOf(base), stone }),
    main
  );
  const dps = 2321146;
  return {
    ...base,
    id: "lo2",
    charId: null,
    name: "无双流",
    source: "myplugin",
    sourceId: null,
    importedAt: "2026-10-26T21:15:00+08:00",
    dps,
    haste: hasteOf(withStone.hasteValue),
    panel: withStone.panel,
    stone,
    slots,
    candidates: buildCandidates(base.xinfa, slots, base.gains),
    history: [
      {
        at: "2026-10-26T21:15:00+08:00",
        dps: 2312400,
        label: "导入",
        kind: "import",
      },
      {
        at: "2026-10-28T21:40:00+08:00",
        dps,
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

export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  mycode: "茗伊插件装备码",
  link: "魔盒配装链接",
  id: "魔盒方案 ID",
  json: "数据版 JSON",
};

export const IMPORT_SOURCE: Record<ImportKind, LoadoutSource> = {
  mycode: "myplugin",
  link: "jx3box",
  id: "jx3box",
  json: "json",
};

export const SOURCE_LABEL: Record<LoadoutSource, string> = {
  myplugin: "茗伊装备码",
  jx3box: "魔盒",
  json: "数据版 JSON",
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
