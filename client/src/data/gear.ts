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

export interface Loadout {
  xinfa: string;
  source: LoadoutSource;
  /** 魔盒方案 ID；装备码、数据版 JSON 导入时为 null */
  sourceId: string | null;
  name: string;
  importedAt: string;
  target: string;
  dps: number;
  haste: { value: number; tier: string; nextTier: string; nextValue: number };
  gains: AttrGain[];
  slots: GearSlot[];
  candidates: Record<string, Candidate[]>;
  history: DpsPoint[];
  /** 生成的示例数值（不是实测） */
  sample: boolean;
}

/** 加速段位阈值（1.5 秒 GCD），取自上游源码 */
export const HASTE_TIERS = [
  { tier: "零段", value: 0 },
  { tier: "一段", value: 206 },
  { tier: "二段", value: 9232 },
];

const SLOT_DEFS: Array<Omit<GearSlot, "item"> & { tags: Attr[] }> = [
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
  { key: "hidden", label: "暗器", short: "暗", group: "武器", tags: ["会心"] },
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

function itemDetail(slot: Omit<GearSlot, "item">) {
  if (slot.group === "武器" && slot.key === "weapon")
    return "特效武器 · 精 8 · 镶 8/8";
  if (slot.group === "饰品")
    return slot.key.startsWith("ring") ? "精 6 · 小附魔" : "精 6 · 镶 8";
  if (slot.key === "hidden") return "精 6 · 镶 8";
  return "精 6 · 镶 8/8";
}

function buildSlots(xinfa: string): GearSlot[] {
  return SLOT_DEFS.map(({ tags, ...def }) => ({
    ...def,
    short: def.key === "weapon" ? weaponShort(xinfa) : def.short,
    item: {
      name: `${def.label}·${tags.join(" ")}`,
      quality: def.key === "weapon" ? "orange" : "purple",
      detail: itemDetail(def),
      tags,
    },
  }));
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
    tags: slot.item.tags,
    pct: 0,
    effects: [],
    current: true,
  };
}

export function sortCandidates(list: Candidate[]) {
  return [...list].sort((a, b) => b.pct - a.pct);
}

/** 生成一份示例配装（导入后用） */
export function makeLoadout(
  xinfa: string,
  source: LoadoutSource,
  sourceId: string | null,
  at = new Date().toISOString()
): Loadout {
  const r = hash(xinfa);
  const dps = Math.round(2_150_000 + r * 260_000);
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
      return { attr, pct, dps: Math.round((dps * pct) / 100) };
    })
    .sort((a, b) => b.pct - a.pct);
  const slots = buildSlots(xinfa);
  const hasteValue = Math.round(1200 + r * 2400);
  return {
    xinfa,
    source,
    sourceId,
    name: "日常木桩",
    importedAt: at,
    target: "134 级木桩 · 304 秒",
    dps,
    haste: {
      value: hasteValue,
      tier: "一段",
      nextTier: "二段",
      nextValue: 9232,
    },
    gains,
    slots,
    candidates: buildCandidates(xinfa, slots, gains),
    history: [{ at, dps, label: "导入", kind: "import" }],
    sample: true,
  };
}

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
  const slots = buildSlots(xinfa);
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
    xinfa,
    source: "jx3box",
    sourceId: "87412",
    name: "日常木桩",
    importedAt: "2026-09-06T20:30:00+08:00",
    target: "134 级木桩 · 304 秒",
    dps: 2302267,
    haste: { value: 2089, tier: "一段", nextTier: "二段", nextValue: 9232 },
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
