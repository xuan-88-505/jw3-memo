/**
 * 内置原版计算器的计算引擎（jx3dps-online，BSD-3-Clause）。
 *
 * 不显示原版页面：在隐藏的同源 iframe 里打开 /dps-calculator/index.html?engine=1，
 * 原版只加载数据和计算核心，界面全是备忘录自己的（见 tools/dps-calculator/engine.ts）。
 * - loadCatalog：当季装备库、附魔、五彩石、循环、增益，按心法缓存。
 * - computeSync：按配装和战斗配置算装分、面板、秒伤，一次约 4 ms，可以每改一下就算。
 */
import { useCallback, useEffect, useState } from "react";
import type { CalcBigKey, CalcInput, CalcSlotInput } from "@/data/calcTypes";
import {
  hasteOf,
  type Attr,
  type CalcPct,
  type GearSlot,
  type Loadout,
} from "@/data/gear";
import {
  BIG_SLOTS,
  type StoneDef,
  type StoneFamily,
  type StoneLevel,
} from "@/data/enchants";
import {
  CALC_BASE,
  calcCode,
  gearSig,
  hasBundledCalc,
  INDEX_KEY,
  KEY_INDEX,
} from "./dpsCalc";

/* ---------------- 目录：原版计算器的数据，字段名照原版 ---------------- */

export interface CalcAttr {
  属性: string;
  值: number;
}

export interface CalcEquip {
  id: number;
  图标ID?: number;
  装备名称: string;
  所属门派: string;
  装备主属性: string;
  装备品级: number;
  装备特效?: string;
  装备类型: string;
  装备增益: CalcAttr[];
  镶嵌孔数组?: { 镶嵌类型: string }[];
  武器伤害_最小值?: number;
  武器伤害_最大值?: number;
  /** 引擎补上的：橙武 8，其他 6 */
  最大精炼等级: number;
}

export interface CalcEnchant {
  id: number;
  附魔名称: string;
  附魔效果简写: string;
  附魔支持部位: string[];
  附魔装分?: number;
  附魔颜色?: string;
}

export interface CalcStone {
  五彩石名称: string;
  五彩石等级: number;
  装备增益: { 增益类型: string; 增益名称: string; 增益数值: number }[];
}

export interface CalcTeamBuff {
  增益名称: string;
  覆盖率: number;
  层数: number;
  团队增益类型?: string;
  增益图片?: string;
  增益描述?: string;
  增益来源?: string;
  层数选项数组?: number[];
  覆盖率支持手动录入?: boolean;
  冲突增益?: string[];
}

export interface CalcFormation {
  阵眼名称: string;
  阵眼标题?: string;
  图标?: string;
}

export interface CalcFood {
  小吃名称: string;
  小吃部位: string;
  小吃品级?: string;
  图标?: string;
  增益集合?: CalcAttr[];
}

export interface CalcLoop {
  name: string;
  title: string;
  /** 可能带 <br/> */
  note: string;
  tag: string;
  provider: string;
}

export interface CalcCatalog {
  v: number;
  xf: string;
  name: string;
  gongfa: string;
  main: string;
  /** _1 … _12 → 部位名（帽子、衣服…，两个戒指都是「戒指」） */
  slotPart: Record<string, string>;
  equips: Record<string, CalcEquip[]>;
  /** 属性 id → 简写，例如 atSpiritBase → 根骨 */
  attrNames: Record<string, string>;
  enchants: CalcEnchant[];
  /** 按等级分组："5"、"6" */
  stones: Record<string, CalcStone[]>;
  team: CalcTeamBuff[];
  formations: CalcFormation[];
  foods: CalcFood[];
  loops: CalcLoop[];
  targets: { name: string; level: number }[];
  defaults: CalcInput;
  defaultTalents: string[];
}

export interface CalcPanel {
  hp: number;
  vitality: number;
  primary: number;
  baseAttack: number;
  attack: number;
  critLv: number;
  critDmgLv: number;
  overcomeLv: number;
  strainLv: number;
  versatility: number;
  haste: number;
}

export interface EngineOk {
  ok: true;
  dps: number;
  total: number;
  /** 战斗时间，秒 */
  time: number;
  score: number;
  panel: CalcPanel;
  pct: CalcPct;
  loop: { name: string; title: string; tag: string };
  talents: string[];
  target: string;
  stone: string | null;
  missing: string[];
}

export type EngineResult =
  | EngineOk
  | { ok: false; error: string; missing?: string[]; message?: string };

/* ---------------- 引擎 ---------------- */

interface EngineApi {
  version: number;
  load(xf: string): Promise<string>;
  compute(xf: string, input: string): string;
}

let engine: Promise<EngineApi> | null = null;
let api: EngineApi | null = null;
const catalogs = new Map<string, Promise<CalcCatalog>>();
const loaded = new Map<string, CalcCatalog>();

function mount(): Promise<EngineApi> {
  return new Promise((resolve, reject) => {
    const f = document.createElement("iframe");
    f.src = `${CALC_BASE}index.html?engine=1`;
    f.title = "jw3memo-engine";
    f.tabIndex = -1;
    f.setAttribute("aria-hidden", "true");
    f.dataset.jw3Engine = "1";
    f.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
    const started = Date.now();
    const tick = () => {
      const found = (
        f.contentWindow as unknown as { jw3Engine?: EngineApi } | null
      )?.jw3Engine;
      if (found) return resolve(found);
      if (Date.now() - started > 45_000) {
        f.remove();
        return reject(new Error("engine-timeout"));
      }
      window.setTimeout(tick, 80);
    };
    document.body.appendChild(f);
    tick();
  });
}

function getEngine() {
  // 先确认内置计算器在：网页版的部署里没有，这时去开 iframe 只会开出备忘录自己的首页
  engine ??= hasBundledCalc()
    .then(ok => {
      if (!ok) throw new Error("engine-unavailable");
      return mount();
    })
    .then(
      a => (api = a),
      e => {
        engine = null;
        throw e;
      }
    );
  return engine;
}

/** 加载心法的当季目录；同一心法只加载一次 */
export function loadCatalog(xinfa: string): Promise<CalcCatalog> {
  const xf = calcCode(xinfa);
  if (!xf) return Promise.reject(new Error("unsupported"));
  let p = catalogs.get(xf);
  if (!p) {
    p = getEngine()
      .then(a => a.load(xf))
      .then(s => {
        const c = JSON.parse(s) as CalcCatalog;
        loaded.set(xf, c);
        return c;
      });
    p.catch(() => catalogs.delete(xf));
    catalogs.set(xf, p);
  }
  return p;
}

/** 同步计算；目录还没加载完时返回 not-loaded */
export function computeSync(xinfa: string, input: CalcInput): EngineResult {
  const xf = calcCode(xinfa);
  if (!api || !loaded.has(xf)) return { ok: false, error: "not-loaded" };
  try {
    return JSON.parse(api.compute(xf, JSON.stringify(input))) as EngineResult;
  } catch (e) {
    return { ok: false, error: "exception", message: String(e) };
  }
}

export function useCalcCatalog(xinfa: string) {
  const [state, setState] = useState<{
    catalog: CalcCatalog | null;
    failed: boolean;
  }>(() => ({ catalog: loaded.get(calcCode(xinfa)) ?? null, failed: false }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const hit = loaded.get(calcCode(xinfa));
    if (hit) {
      setState({ catalog: hit, failed: false });
      return;
    }
    let alive = true;
    setState({ catalog: null, failed: false });
    loadCatalog(xinfa).then(
      c => alive && setState({ catalog: c, failed: false }),
      () => alive && setState({ catalog: null, failed: true })
    );
    return () => {
      alive = false;
    };
  }, [xinfa, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { ...state, retry };
}

/* ---------------- 目录工具 ---------------- */

export const SLOT_INDEXES = Object.keys(INDEX_KEY);

export function equipOf(cat: CalcCatalog, idx: string, id: number) {
  return cat.equips[cat.slotPart[idx]]?.find(e => e.id === id) ?? null;
}

export function enchantsFor(cat: CalcCatalog, idx: string) {
  const part = cat.slotPart[idx];
  return cat.enchants
    .filter(f => f.附魔支持部位.includes(part))
    .sort((a, b) => (b.附魔装分 ?? 0) - (a.附魔装分 ?? 0));
}

export function attrName(cat: CalcCatalog, key: string) {
  return cat.attrNames[key] ?? key;
}

const BASE_KEYS = new Set([
  "atSpiritBase",
  "atSpunkBase",
  "atAgilityBase",
  "atStrengthBase",
  "atVitalityBase",
]);
const NOT_TAG = new Set(["攻击", "体质", "气血", "武伤", "主属性", "全属"]);

/** 装备的副属性简写（不含体质、主属性、攻击），例如 ["破防", "无双"] */
export function equipTags(cat: CalcCatalog, e: CalcEquip): string[] {
  const out: string[] = [];
  for (const a of e.装备增益) {
    if (BASE_KEYS.has(a.属性)) continue;
    const n = cat.attrNames[a.属性];
    if (!n || NOT_TAG.has(n) || out.includes(n)) continue;
    out.push(n);
  }
  return out;
}

export function qualityOfCalc(e: CalcEquip) {
  return e.装备类型 === "橙武" ? ("orange" as const) : ("purple" as const);
}

const TYPE_TAG: Record<string, string> = {
  切糕: "切糕",
  副本精简: "精简",
  门派套装: "套装",
  橙武: "橙武",
  特效武器: "特效",
};

/** 列表里装备名后面的小标签 */
export function typeTag(e: CalcEquip): string | null {
  if (TYPE_TAG[e.装备类型]) return TYPE_TAG[e.装备类型];
  const fx = e.装备特效;
  if (fx && fx !== "None" && !fx.startsWith("切糕")) return "特效";
  return null;
}

const clamp = (v: unknown, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number(v)) || 0));

/** 按装备的孔数和精炼上限整理一个部位的输入 */
export function normSlot(
  cat: CalcCatalog,
  idx: string,
  s: CalcSlotInput
): CalcSlotInput | null {
  const e = equipOf(cat, idx, s.id);
  if (!e) return null;
  const holes = e.镶嵌孔数组?.length ?? 0;
  const enchantOk =
    s.enchant != null && enchantsFor(cat, idx).some(f => f.id === s.enchant);
  return {
    id: e.id,
    refine: clamp(s.refine, 0, e.最大精炼等级),
    gems: Array.from({ length: holes }, (_, i) => clamp(s.gems?.[i], 0, 8)),
    enchant: enchantOk ? s.enchant : null,
  };
}

/** 换一件装备：精炼、宝石等级、小附魔尽量沿用 */
export function swapEquip(
  cat: CalcCatalog,
  idx: string,
  prev: CalcSlotInput | null,
  e: CalcEquip
): CalcSlotInput {
  const holes = e.镶嵌孔数组?.length ?? 0;
  const fill = prev?.gems.length ? Math.max(...prev.gems) : 6;
  return normSlot(cat, idx, {
    id: e.id,
    refine: prev ? prev.refine : e.最大精炼等级,
    gems: Array.from({ length: holes }, (_, i) => prev?.gems[i] ?? fill),
    enchant: prev?.enchant ?? null,
  })!;
}

/* ---------------- 五彩石 ---------------- */

const LEVEL_WORD = ["壹", "贰", "叁", "肆", "伍", "陆"];
const STONE_ALIAS: Record<string, string> = {
  内攻: "攻击",
  外攻: "攻击",
  会心效果: "会效",
};

export interface StoneSource {
  families: StoneFamily[];
  find: (name: string | null) => StoneDef | null;
  levels: StoneLevel[];
}

const stoneCache = new WeakMap<CalcCatalog, StoneSource>();

/** 原版的五彩石换成五彩石选择器用的结构（按三条属性分组，每组有伍、陆两级） */
export function calcStoneSource(cat: CalcCatalog): StoneSource {
  const hit = stoneCache.get(cat);
  if (hit) return hit;
  const byName = new Map<string, StoneDef>();
  const byShort = new Map<string, StoneFamily>();
  const levels = new Set<StoneLevel>();
  for (const list of Object.values(cat.stones)) {
    for (const s of list) {
      const level = clamp(s.五彩石等级, 1, 6) as StoneLevel;
      levels.add(level);
      const base = s.五彩石名称.replace(/\([^)]*\)$/, "");
      const short = base.replace(/^彩·/, "");
      const words = short.split("·");
      const attrs = s.装备增益.map(g => {
        const pct = /PercentAdd$/.test(g.增益类型);
        const label = pct
          ? g.增益名称.replace(/百分比$/, "")
          : (STONE_ALIAS[g.增益名称] ?? g.增益名称);
        const value = pct
          ? `+${((g.增益数值 / 1024) * 100).toFixed(1)}%`
          : `+${g.增益数值}`;
        return { label, value };
      });
      if (!attrs.length) continue;
      const def: StoneDef = {
        name: s.五彩石名称,
        short,
        label: `${short}(${LEVEL_WORD[level - 1]})`,
        words,
        level,
        estimated: false,
        attrs,
        delta: {},
      };
      byName.set(def.name, def);
      let fam = byShort.get(short);
      if (!fam) {
        fam = {
          short,
          words,
          labels: words.map(
            (_, i) => attrs[Math.min(i, attrs.length - 1)].label
          ),
          levels: [],
        };
        byShort.set(short, fam);
      }
      fam.levels.push(def);
    }
  }
  for (const f of byShort.values()) f.levels.sort((a, b) => a.level - b.level);
  const src: StoneSource = {
    families: Array.from(byShort.values()),
    find: name => (name ? (byName.get(name) ?? null) : null),
    levels: Array.from(levels).sort((a, b) => a - b),
  };
  stoneCache.set(cat, src);
  return src;
}

/* ---------------- 配装 ↔ 引擎输入 ---------------- */

export interface Seed {
  input: CalcInput;
  /** 当季库里没有、换成了原版默认装备的部位 key */
  replaced: string[];
  /** 五彩石当季库里没有，换成了默认的 */
  stoneReplaced: boolean;
}

const BIG_KEYS: CalcBigKey[] = ["hat", "coat", "belt", "wrist", "shoes"];

/**
 * 打开配装器时的输入：编辑过的配装照存下的原样恢复；
 * 旧配装（魔盒导入、旧赛季）按装备 id、再按名字到当季库里找同一件，找不到的部位用原版默认装备。
 */
export function seedInput(lo: Loadout, cat: CalcCatalog): Seed {
  const d = cat.defaults;
  const slots: CalcInput["slots"] = {};
  const replaced: string[] = [];
  const saved = lo.calc?.input;
  if (saved) {
    for (const idx of SLOT_INDEXES) {
      const s = saved.slots[idx];
      const ok = s ? normSlot(cat, idx, s) : null;
      if (s && !ok) replaced.push(INDEX_KEY[idx]);
      slots[idx] = s ? (ok ?? d.slots[idx] ?? null) : null;
    }
    const stoneOk = !saved.stone || !!calcStoneSource(cat).find(saved.stone);
    return {
      input: {
        slots,
        stone: stoneOk ? saved.stone : d.stone,
        big: { ...d.big, ...saved.big },
        battle: { ...d.battle, ...saved.battle },
      },
      replaced,
      stoneReplaced: !stoneOk,
    };
  }
  for (const idx of SLOT_INDEXES) {
    const s = lo.slots.find(x => x.key === INDEX_KEY[idx]);
    const list = cat.equips[cat.slotPart[idx]] ?? [];
    const name = s ? (s.def?.name ?? s.item.name) : "";
    const hit =
      (s?.def && list.find(e => e.id === s.def!.id)) ||
      list
        .filter(e => !!name && e.装备名称 === name)
        .sort((a, b) => b.装备品级 - a.装备品级)[0];
    const ok =
      s && hit
        ? normSlot(cat, idx, {
            id: hit.id,
            refine: s.refine,
            gems: s.gems,
            enchant: null,
          })
        : null;
    if (!ok && name) replaced.push(INDEX_KEY[idx]);
    slots[idx] = ok ?? d.slots[idx] ?? null;
  }
  const stoneOk = !!lo.stone && !!calcStoneSource(cat).find(lo.stone);
  const big = { ...d.big };
  for (const k of BIG_KEYS) {
    const v = lo.big?.[k];
    if (v === 0 || v === 1 || v === 2) big[k] = v;
  }
  return {
    input: {
      slots,
      stone: stoneOk ? lo.stone : d.stone,
      big,
      battle: { ...d.battle },
    },
    replaced,
    stoneReplaced: !!lo.stone && !stoneOk,
  };
}

/** 两份输入有哪些不同，返回给人看的名称（部位名、五彩石、伤帽…） */
export function inputChanges(lo: Loadout, a: CalcInput, b: CalcInput) {
  const out: string[] = [];
  for (const idx of SLOT_INDEXES) {
    if (
      JSON.stringify(a.slots[idx] ?? null) !==
      JSON.stringify(b.slots[idx] ?? null)
    )
      out.push(lo.slots.find(s => s.key === INDEX_KEY[idx])?.label ?? idx);
  }
  if ((a.stone ?? null) !== (b.stone ?? null)) out.push("五彩石");
  for (const big of BIG_SLOTS) {
    const k = big.key as CalcBigKey;
    if ((a.big[k] ?? 0) !== (b.big[k] ?? 0)) out.push(big.label);
  }
  if (JSON.stringify(a.battle) !== JSON.stringify(b.battle))
    out.push("战斗配置");
  return out;
}

const ATTR_TAGS: Record<string, Attr> = {
  会心: "会心",
  会效: "会心效果",
  破防: "破防",
  无双: "无双",
  加速: "加速",
  破招: "破招",
};

function emptySlot(base: GearSlot): GearSlot {
  return {
    ...base,
    def: null,
    refine: 0,
    gems: [],
    enchant: null,
    item: { name: "", quality: "purple", detail: "", tags: [] },
  };
}

/** 引擎算完的结果写回配装：装备、五彩石、大附魔、面板、装分、秒伤都以原版为准 */
export function loadoutFromEngine(
  lo: Loadout,
  cat: CalcCatalog,
  input: CalcInput,
  r: EngineOk
): Loadout {
  const enchants: Record<string, string> = {};
  const slots = lo.slots.map(s => {
    const idx = KEY_INDEX[s.key];
    const inp = idx ? input.slots[idx] : null;
    const e = idx && inp ? equipOf(cat, idx, inp.id) : null;
    if (!idx || !inp || !e) return emptySlot(s);
    const f = inp.enchant
      ? cat.enchants.find(x => x.id === inp.enchant)
      : undefined;
    if (f) enchants[s.key] = f.附魔效果简写;
    const tags = equipTags(cat, e)
      .map(t => ATTR_TAGS[t])
      .filter((t): t is Attr => !!t);
    return {
      ...s,
      def: null,
      refine: inp.refine,
      gems: inp.gems,
      enchant: null,
      item: {
        name: e.装备名称,
        quality: qualityOfCalc(e),
        iconId: e.图标ID,
        detail: inp.gems.length
          ? `精 ${inp.refine} · 镶 ${inp.gems.join("/")}`
          : `精 ${inp.refine}`,
        tags,
      },
    } satisfies GearSlot;
  });
  const big = { ...lo.big };
  for (const k of BIG_KEYS) {
    const v = input.big[k];
    if (v === 0 || v === 1 || v === 2) big[k] = v;
  }
  const next: Loadout = {
    ...lo,
    slots,
    stone: input.stone,
    big,
    dps: r.dps,
    target: r.target || lo.target,
    sample: false,
    panel: {
      score: r.score,
      hp: r.panel.hp,
      vitality: r.panel.vitality,
      primary: r.panel.primary,
      baseAttack: r.panel.baseAttack,
      attack: r.panel.attack,
      critLv: r.panel.critLv,
      critDmgLv: r.panel.critDmgLv,
      overcomeLv: r.panel.overcomeLv,
      strainLv: r.panel.strainLv,
      // 原版的角色面板里没有破招
      surplus: 0,
      versatility: r.panel.versatility,
    },
    haste: hasteOf(r.panel.haste),
  };
  next.calc = {
    at: new Date().toISOString(),
    roleId: "",
    sig: gearSig(next),
    missing: [],
    pct: r.pct,
    enchants,
    input,
    loop: { name: r.loop.name, title: r.loop.title, time: r.time },
    talents: r.talents,
  };
  return next;
}
