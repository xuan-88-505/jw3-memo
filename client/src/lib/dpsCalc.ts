/**
 * 内置的原版配装计算器（jx3dps-online，BSD-3-Clause）。
 *
 * 计算器的构建产物在 client/public/dps-calculator/，由 tools/dps-calculator/build.sh 生成。
 * 桥接代码在 tools/dps-calculator/bridge.ts，两边只通过同源的 localStorage 和 postMessage 交换数据：
 * - 打开前，备忘录把配装页的 12 件装备写进种子键，计算器按种子生成配装；
 * - 计算器里每次改动后，把秒伤、装分、面板和 12 件装备写进结果键，并通知父窗口。
 */
import {
  hasteOf,
  itemOf,
  primaryAttr,
  type CalcPct,
  type GearSlot,
  type Loadout,
  type PanelStats,
} from "@/data/gear";
import { BIG_SLOTS, type BigEnchants, type BigLevel } from "@/data/enchants";
import { getEquipDb, loadEquipDb, partOf, type EquipDb } from "@/data/equip";

/** 计算器支持的心法和它的简写；不在这里的心法仍用备忘录自己的配装器 */
const XF_CODE: Record<string, string> = {
  花间游: "hjy",
  紫霞功: "zxg",
  冰心诀: "bxj",
  易筋经: "yjj",
  焚影圣诀: "fysj",
  天罗诡道: "tlgd",
  毒经: "dj",
  无方: "wf",
  太玄经: "txj",
  周天功: "ztg",
  傲血战意: "axzy",
  分山劲: "fsj",
  孤锋诀: "gfj",
  北傲诀: "baj",
  凌海诀: "lhj",
  笑尘诀: "xcj",
  山海心诀: "shxj",
  幽罗引: "yly",
};

export const CALC_BASE = "/dps-calculator/";
/** 没有内置计算器时（网页版）用在线版，结果不会自动带回 */
export const CALC_ONLINE = "https://dps.btcsg.top/";

export function calcSupported(xinfa: string) {
  return xinfa in XF_CODE;
}

/** 心法在计算器里的简写，例如紫霞功是 zxg；不支持的心法是空串 */
export function calcCode(xinfa: string) {
  return XF_CODE[xinfa] ?? "";
}

/** 计算器的部位索引和备忘录部位 key 的对应 */
export const INDEX_KEY: Record<string, string> = {
  _1: "hat",
  _2: "coat",
  _3: "belt",
  _4: "wrist",
  _5: "pants",
  _6: "shoes",
  _7: "neck",
  _8: "pendant",
  _9: "ring1",
  _10: "ring2",
  _11: "hidden",
  _12: "weapon",
};
export const KEY_INDEX: Record<string, string> = Object.fromEntries(
  Object.entries(INDEX_KEY).map(([i, k]) => [k, i])
);

const seedKey = (id: string) => `jw3memo:calc-seed:v1:${id}`;
const resultKey = (id: string) => `jw3memo:calc-result:v1:${id}`;

export interface CalcSlot {
  index: string;
  id: number;
  name: string;
  iconId: number;
  ilvl: number;
  refine: number;
  maxRefine: number;
  gems: number[];
  enchant: string | null;
  enchantLabel: string | null;
}

export interface CalcResult {
  v: 1;
  loadoutId: string;
  roleId: string;
  xinfa: string;
  dps: number;
  score: number;
  panel: Omit<PanelStats, "score" | "surplus"> & { haste: number };
  /** 计算器面板上的百分比；旧版桥接没有 */
  pct?: CalcPct;
  stone: string | null;
  big: Partial<BigEnchants>;
  slots: CalcSlot[];
  /** 种子里计算器装备库没有、也还没在计算器里重选的部位 */
  missing: string[];
  at: string;
}

/** 计算器发给父窗口的消息 */
export type CalcMessage =
  | { source: "jw3memo-calc"; loadoutId: string; type: "ready" }
  /** 焦点在计算器里按了 Esc，计算器自己没有要关的弹层 */
  | { source: "jw3memo-calc"; loadoutId: string; type: "escape" }
  | {
      source: "jw3memo-calc";
      loadoutId: string;
      type: "seeded";
      missing: string[];
      /** 计算器不认、只好去掉的部分：stone 五彩石，enchant 小附魔 */
      dropped?: string[];
      /** 种子里一共几件装备；和 missing 一样多就是一件都没带过去 */
      total?: number;
    }
  | {
      source: "jw3memo-calc";
      loadoutId: string;
      type: "result";
      result: CalcResult;
    }
  | {
      source: "jw3memo-calc";
      loadoutId: string;
      type: "error";
      /** link 关联角色、load 载入超时：计算器用不了；seed 只是装备没带过去 */
      stage?: "link" | "load" | "seed";
      message: string;
    };

export function isCalcMessage(d: unknown): d is CalcMessage {
  return (
    !!d &&
    typeof d === "object" &&
    (d as { source?: unknown }).source === "jw3memo-calc"
  );
}

/** 部位 key 换成显示用的部位名（计算器报「这些部位没找到」时用） */
export function missingSlotKeys(missing: string[]) {
  return missing.map(i => INDEX_KEY[i]).filter(Boolean);
}

/** 备忘录这边的装备签名：重新导入或手动改过装备后签名会变，下次打开计算器就用新装备覆盖 */
export function gearSig(lo: Loadout) {
  return JSON.stringify([
    lo.slots.map(s => [
      s.key,
      s.def?.id ?? s.item.name,
      s.refine,
      s.gems,
      s.enchant,
    ]),
    lo.stone,
    lo.big,
  ]);
}

/** 计算器地址；内置版带上配装 id，桥接据此关联角色 */
export function calcUrl(lo: Loadout) {
  const q = new URLSearchParams({
    memo: lo.id,
    xf: XF_CODE[lo.xinfa] ?? "",
    name: lo.name,
  });
  return `${CALC_BASE}index.html?${q.toString()}`;
}

/** 内置计算器在不在（网页版的部署里没有） */
let bundled: Promise<boolean> | null = null;
export function hasBundledCalc() {
  bundled ??= fetch(`${CALC_BASE}VERSION.json`, { cache: "no-store" })
    .then(async r => {
      if (!r.ok) return false;
      const j = (await r.json().catch(() => null)) as {
        commit?: string;
      } | null;
      return !!j?.commit;
    })
    .catch(() => false);
  return bundled;
}

/**
 * 打开前写种子。第一次打开时计算器按种子生成配装；
 * 备忘录这边改过装备（签名变了）时加 force，覆盖计算器里的旧配装。
 */
export function writeSeed(lo: Loadout) {
  const force = !!lo.calc && lo.calc.sig !== gearSig(lo);
  const seed = {
    v: 1,
    force,
    slots: lo.slots
      .filter(s => KEY_INDEX[s.key] && (s.def || s.item.name))
      .map(s => ({
        index: KEY_INDEX[s.key],
        id: s.def?.id ?? 0,
        name: s.def?.name ?? s.item.name,
        refine: s.refine,
        gems: s.gems,
        enchant: s.enchant,
      })),
    stone: lo.stone,
    big: lo.big,
  };
  try {
    localStorage.setItem(seedKey(lo.id), JSON.stringify(seed));
  } catch {
    // 存储满了：计算器按它自己保存的配装打开
  }
}

/** 计算器上次写回的结果（窗口关着时改的，下次进配装页也能带回） */
export function readResult(id: string): CalcResult | null {
  try {
    const s = localStorage.getItem(resultKey(id));
    const r = s ? (JSON.parse(s) as CalcResult) : null;
    return r && r.v === 1 && r.dps > 0 ? r : null;
  } catch {
    return null;
  }
}

function slotFromCalc(
  base: GearSlot,
  c: CalcSlot,
  db: EquipDb | null
): GearSlot {
  // 两边装备库版本不同：能对上的用备忘录的装备资料，对不上的只用计算器给的名字和图标
  const def = db?.[partOf(base.key)]?.find(d => d.id === c.id) ?? null;
  const gems = c.gems ?? [];
  const item = def
    ? { ...itemOf(def, c.refine, gems), name: c.name || def.name }
    : {
        name: c.name,
        quality: c.maxRefine > 6 ? ("orange" as const) : ("purple" as const),
        detail: gems.length
          ? `精 ${c.refine} · 镶 ${gems.join("/")}`
          : `精 ${c.refine}`,
        tags: [],
      };
  return {
    ...base,
    def,
    refine: c.refine,
    gems,
    enchant: c.enchant,
    item: { ...item, iconId: c.iconId || def?.iconId || base.item.iconId },
  };
}

/** 没穿装备的部位 */
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

/** 计算器的结果合进配装：装备、五彩石、大附魔、面板、装分、秒伤都以计算器为准 */
export function loadoutFromCalc(lo: Loadout, r: CalcResult): Loadout {
  const db = getEquipDb(primaryAttr(lo.xinfa));
  const missing = new Set(missingSlotKeys(r.missing ?? []));
  const byKey = new Map(
    r.slots.map(c => [INDEX_KEY[c.index], c] as const).filter(([k]) => !!k)
  );
  const slots = lo.slots.map(s => {
    const c = byKey.get(s.key);
    if (c) return slotFromCalc(s, c, db);
    // 计算器装备库里没有这件、用户也还没重选：保留原来的装备，提示去计算器里换
    return missing.has(s.key) ? s : emptySlot(s);
  });
  const big = { ...lo.big };
  for (const b of BIG_SLOTS) {
    const v = r.big?.[b.key];
    if (v === 0 || v === 1 || v === 2) big[b.key] = v as BigLevel;
  }
  const next: Loadout = {
    ...lo,
    slots,
    stone: r.stone,
    big,
    dps: r.dps,
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
      // 计算器的角色属性里没有破招
      surplus: 0,
      versatility: r.panel.versatility,
    },
    haste: hasteOf(r.panel.haste),
  };
  const enchants: Record<string, string> = {};
  for (const c of r.slots) {
    const k = INDEX_KEY[c.index];
    if (k && c.enchantLabel) enchants[k] = c.enchantLabel;
  }
  next.calc = {
    at: r.at,
    roleId: r.roleId,
    sig: gearSig(next),
    missing: [...missing],
    pct: r.pct,
    enchants,
  };
  return next;
}

/** 配装页上的数值是不是计算器算的（之后重新导入过就不是了） */
export function fromCalc(lo: Loadout) {
  return !!lo.calc && lo.calc.sig === gearSig(lo);
}

/** 结果是不是比配装里记的新（同一份结果不重复应用） */
export function isNewer(lo: Loadout, r: CalcResult) {
  return !lo.calc || lo.calc.at < r.at;
}

/** 回写前先加载装备库，能对上的装备就带上备忘录的装备资料 */
export function preloadEquipDb(xinfa: string) {
  return loadEquipDb(primaryAttr(xinfa)).catch(() => null);
}
