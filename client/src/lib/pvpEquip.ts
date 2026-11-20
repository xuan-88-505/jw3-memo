/**
 * PVP 装备库：把魔盒（JX3BOX）装备接口的记录换成内置原版计算器的装备格式。
 *
 * 原版计算器只有 PVE 装备。tools/pvp-equip/build.ts 从魔盒抓当季 PVP 装备、套装和化劲/御劲小附魔，
 * 用这里的函数换成原版的格式，按门派存成 client/public/pvp-equip/<文件>.json（提交进仓库，运行时不连魔盒）。
 * 计算引擎（tools/dps-calculator/engine.ts）加载心法时读对应门派的文件和通用文件，用 pickPvp 挑出
 * 这个心法能穿的，合进原版的装备库；化劲、御劲原版不算，用 pvpDefense 算。
 *
 * 这个文件不能 import 别的文件：构建内置计算器时它会被原样复制成上游的 src/备忘录PVP.ts。
 */

export const PVP_DATA_VERSION = 1;

/** 门派 → 文件名（client/public/pvp-equip/<文件>.json）。文件名用英文，安装包里的路径不带中文 */
export const PVP_SCHOOL_FILE: Record<string, string> = {
  通用: "common",
  少林: "shaolin",
  万花: "wanhua",
  天策: "tiance",
  纯阳: "chunyang",
  七秀: "qixiu",
  五毒: "wudu",
  唐门: "tangmen",
  藏剑: "cangjian",
  丐帮: "gaibang",
  明教: "mingjiao",
  苍云: "cangyun",
  长歌: "changge",
  霸刀: "badao",
  蓬莱: "penglai",
  凌雪: "lingxue",
  衍天: "yantian",
  药宗: "yaozong",
  刀宗: "daozong",
  万灵: "wanling",
  段氏: "duanshi",
  无相: "wuxiang",
};

/** 化劲、御劲的属性键 */
export const DECRIT_KEY = "atDecriticalDamagePowerBase";
export const TOUGH_KEY = "atToughnessBase";

/** 原版计算器认识的属性，加上化劲、御劲；其他的（防御、技能效果等）丢掉 */
const KEEP = new Set([
  "atVitalityBase",
  "atSpunkBase",
  "atSpiritBase",
  "atStrengthBase",
  "atAgilityBase",
  "atMagicAttackPowerBase",
  "atPhysicsAttackPowerBase",
  "atTherapyPowerBase",
  "atMagicCriticalStrike",
  "atPhysicsCriticalStrike",
  "atAllTypeCriticalStrike",
  "atMagicCriticalDamagePowerBase",
  "atPhysicsCriticalDamagePowerBase",
  "atAllTypeCriticalDamagePowerBase",
  "atMagicOvercome",
  "atPhysicsOvercomeBase",
  "atAllOvercome",
  "atStrainBase",
  "atHasteBase",
  "atSurplusValueBase",
  "atPVXAllRound",
  "atMaxLifeAdditional",
  "atMaxLifeBase",
  DECRIT_KEY,
  TOUGH_KEY,
]);

/** 装备接口 SubType（魔盒）→ 原版的部位名 */
const PART_BY_SUBTYPE: Record<number, string> = {
  0: "武器",
  1: "暗器",
  2: "衣服",
  3: "帽子",
  4: "项链",
  5: "戒指",
  6: "腰带",
  7: "腰坠",
  8: "下装",
  9: "鞋子",
  10: "护腕",
};

const MAIN_BY_KEY: Record<string, string> = {
  atSpunkBase: "元气",
  atSpiritBase: "根骨",
  atStrengthBase: "力道",
  atAgilityBase: "身法",
};
const MAINS = ["元气", "根骨", "力道", "身法"];

const SHORT: Record<string, string> = {
  [DECRIT_KEY]: "化劲",
  [TOUGH_KEY]: "御劲",
};

/** 普通镶嵌孔的基数；原版的孔表按它算（8 级 38） */
export const NORMAL_HOLE_BASE = 304;

export interface PvpAttr {
  属性: string;
  值: number;
}

export interface PvpHole {
  镶嵌类型: string;
  /** 镶嵌基数：普通孔 304，体质孔 456，气血孔 4556 */
  镶嵌基数: number;
}

/** 换好的 PVP 装备：字段同原版的装备数据，多了 pvp、功法、来源、套装 */
export interface PvpEquip {
  id: number;
  图标ID?: number;
  装备名称: string;
  所属门派: string;
  装备主属性: string;
  装备品级: number;
  装备类型: string;
  装备增益: PvpAttr[];
  镶嵌孔数组: PvpHole[];
  武器伤害_最小值?: number;
  武器伤害_最大值?: number;
  最大精炼等级: number;
  pvp: true;
  /** 门派装是「内功」「外功」；通用装是主属性（元气、根骨…） */
  功法: string;
  /** 获取途径：竞技场、威望、阵营拍卖… */
  来源?: string;
  /** 套装 id，见 PvpFile.sets */
  套装?: number;
}

export interface PvpSet {
  效果: { 件数: number; 增益: PvpAttr[] }[];
}

export interface PvpEnchant {
  id: number;
  附魔名称: string;
  附魔效果简写: string;
  附魔支持部位: string[];
  增益集合: PvpAttr[];
  附魔装分: number;
  附魔类型: string;
  附魔颜色: string;
  pvp: true;
}

export interface PvpFile {
  v: number;
  school: string;
  /** 抓取日期，例如 2026-11-20 */
  updatedAt: string;
  /** 收录的品级 */
  levels: number[];
  /** 按部位 */
  equips: Record<string, PvpEquip[]>;
  sets: Record<string, PvpSet>;
  /** 只在通用文件里有 */
  enchants?: PvpEnchant[];
}

/* ---------------- 魔盒记录 ---------------- */

type BoxAttr = (string | number | null)[];
export interface BoxEquip {
  ID: number;
  Name: string;
  Level: number;
  Quality?: number;
  SubType: number;
  DetailType?: number;
  BelongSchool?: string | null;
  MagicKind?: string | null;
  GetType?: string | null;
  MaxStrengthLevel?: number | null;
  _IconID?: number | null;
  IconID?: number | null;
  SetID?: number | null;
  _SetData?: Record<string, { attr?: BoxAttr } | null> | null;
  [k: string]: unknown;
}

export interface BoxEnchant {
  ID: number;
  Name: string;
  Score?: number | null;
  DestItemSubType?: number | null;
  _quality?: number | null;
  _latest_enhance?: boolean | null;
  [k: string]: unknown;
}

const ELEMENT =
  /^at(?:Neutral|Solar|Lunar|Poison|SolarAndLunar)(AttackPowerBase|CriticalStrike|OvercomeBase|CriticalDamagePowerBase)$/;
const MAGIC_KEY: Record<string, string> = {
  AttackPowerBase: "atMagicAttackPowerBase",
  CriticalStrike: "atMagicCriticalStrike",
  OvercomeBase: "atMagicOvercome",
  CriticalDamagePowerBase: "atMagicCriticalDamagePowerBase",
};

/** 内功分系的属性（混元、阳性、阴性、毒性、阴阳）统一成原版用的内功属性，同原版魔盒导入 */
export function normAttr(key: string): string {
  const m = ELEMENT.exec(key);
  return m ? MAGIC_KEY[m[1]] : key;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function addAttr(list: PvpAttr[], key: string, v: number) {
  if (!v) return;
  const hit = list.find(a => a.属性 === key);
  if (hit) hit.值 += v;
  else list.push({ 属性: key, 值: v });
}

/**
 * 一条魔盒装备记录换成原版格式；不是装备部位的返回 null。
 * dropped 收集丢掉的属性键，抓取脚本用来提示。
 */
export function convertEquip(
  rec: BoxEquip,
  dropped?: Set<string>
): { part: string; equip: PvpEquip } | null {
  const part = PART_BY_SUBTYPE[rec.SubType];
  if (!part || !rec.ID || !rec.Name) return null;
  const 装备增益: PvpAttr[] = [];
  for (let i = 1; i <= 16; i++) {
    const m = rec[`_Magic${i}Type`] as { attr?: BoxAttr } | null | undefined;
    const raw = m?.attr?.[0];
    if (!raw) continue;
    const key = normAttr(String(raw));
    if (!KEEP.has(key)) {
      dropped?.add(key);
      continue;
    }
    addAttr(装备增益, key, num(m!.attr![1]));
  }
  const 镶嵌孔数组: PvpHole[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = rec[`_DiamondAttributeID${i}`] as BoxAttr | null | undefined;
    if (!d?.[0]) continue;
    const key = normAttr(String(d[0]));
    if (!KEEP.has(key)) {
      dropped?.add(key);
      continue;
    }
    镶嵌孔数组.push({ 镶嵌类型: key, 镶嵌基数: num(d[1]) || NORMAL_HOLE_BASE });
  }
  let dmgBase = 0;
  let dmgRand = 0;
  for (let i = 1; i <= 6; i++) {
    const t = rec[`Base${i}Type`];
    if (t === "atMeleeWeaponDamageBase") dmgBase = num(rec[`Base${i}Min`]);
    if (t === "atMeleeWeaponDamageRand") dmgRand = num(rec[`Base${i}Min`]);
  }
  const kind = rec.MagicKind || "";
  const main =
    装备增益.map(a => MAIN_BY_KEY[a.属性]).find(Boolean) ||
    (MAINS.includes(kind) ? kind : "");
  const equip: PvpEquip = {
    id: rec.ID,
    装备名称: rec.Name,
    所属门派: rec.BelongSchool || "通用",
    装备主属性: main,
    装备品级: num(rec.Level),
    装备类型: "普通",
    装备增益,
    镶嵌孔数组,
    最大精炼等级: num(rec.MaxStrengthLevel) || 6,
    pvp: true,
    功法: kind,
  };
  const icon = num(rec._IconID) || num(rec.IconID);
  if (icon) equip.图标ID = icon;
  if (dmgBase > 0) {
    equip.武器伤害_最小值 = dmgBase;
    equip.武器伤害_最大值 = dmgBase + dmgRand;
  }
  if (rec.GetType) equip.来源 = rec.GetType;
  if (rec.SetID) equip.套装 = num(rec.SetID);
  return { part, equip };
}

/** 套装的属性加成（「2_1」= 两件第一条）；技能效果类的丢掉 */
export function convertSet(rec: BoxEquip): PvpSet | null {
  const data = rec._SetData;
  if (!rec.SetID || !data) return null;
  const byCount = new Map<number, PvpAttr[]>();
  for (const [k, v] of Object.entries(data)) {
    const count = parseInt(k, 10);
    const raw = v?.attr?.[0];
    if (!count || !raw) continue;
    const key = normAttr(String(raw));
    if (!KEEP.has(key)) continue;
    const list = byCount.get(count) ?? [];
    addAttr(list, key, num(v!.attr![1]));
    byCount.set(count, list);
  }
  if (!byCount.size) return null;
  return {
    效果: Array.from(byCount.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([件数, 增益]) => ({ 件数, 增益 })),
  };
}

/** 魔盒附魔详情（/resource/std/enchant.<id>）换成原版的附魔格式 */
export function convertEnchant(rec: BoxEnchant): PvpEnchant | null {
  const part = PART_BY_SUBTYPE[num(rec.DestItemSubType)];
  if (!part || !rec.ID) return null;
  const 增益集合: PvpAttr[] = [];
  for (let i = 1; i <= 4; i++) {
    const raw = rec[`Attribute${i}ID`];
    if (!raw) continue;
    const key = normAttr(String(raw));
    if (KEEP.has(key)) addAttr(增益集合, key, num(rec[`Attribute${i}Value1`]));
  }
  if (!增益集合.length) return null;
  const score = num(rec.Score);
  const color =
    num(rec._quality) >= 4 ? (score >= 122 ? "精" : "紫") : "蓝";
  return {
    id: rec.ID,
    附魔名称: rec.Name,
    附魔效果简写: 增益集合
      .map(g => `${SHORT[g.属性] ?? g.属性}+${g.值}`)
      .join(" "),
    附魔支持部位: [part],
    增益集合,
    附魔装分: score,
    附魔类型: color,
    附魔颜色: color,
    pvp: true,
  };
}

/* ---------------- 按心法挑装备 ---------------- */

export interface PvpWho {
  /** 门派，例如 衍天 */
  school: string;
  /** 内功 / 外功 */
  gongfa: string;
  /** 主属性：元气、根骨、力道、身法 */
  main: string;
}

export interface PvpPick {
  equips: Record<string, PvpEquip[]>;
  sets: Record<string, PvpSet>;
  enchants: PvpEnchant[];
}

/** 这个心法能穿的：本门派、功法对得上的门派装，加上主属性对得上的通用装 */
export function pvpFits(e: PvpEquip, who: PvpWho) {
  if (e.所属门派 === "通用") return e.功法 === who.main;
  return (
    e.所属门派 === who.school &&
    e.功法 === who.gongfa &&
    (!e.装备主属性 || e.装备主属性 === who.main)
  );
}

export function pickPvp(files: (PvpFile | null | undefined)[], who: PvpWho): PvpPick {
  const out: PvpPick = { equips: {}, sets: {}, enchants: [] };
  const seen = new Set<number>();
  for (const f of files) {
    if (!f || f.v !== PVP_DATA_VERSION) continue;
    for (const [part, list] of Object.entries(f.equips || {})) {
      for (const e of list) {
        if (seen.has(e.id) || !pvpFits(e, who)) continue;
        seen.add(e.id);
        (out.equips[part] ??= []).push(e);
        if (e.套装 && f.sets?.[e.套装]) out.sets[e.套装] = f.sets[e.套装];
      }
    }
    for (const x of f.enchants || []) {
      if (!out.enchants.some(y => y.id === x.id)) out.enchants.push(x);
    }
  }
  return out;
}

/** 心法的门派：装备库里门派装最多的那个门派 */
export function schoolOf(equips: Record<string, { 所属门派?: string }[]>) {
  const count = new Map<string, number>();
  for (const list of Object.values(equips || {}))
    for (const e of list || []) {
      const s = e?.所属门派;
      if (s && s !== "通用") count.set(s, (count.get(s) ?? 0) + 1);
    }
  let best = "";
  let n = 0;
  count.forEach((v, k) => {
    if (v > n) {
      best = k;
      n = v;
    }
  });
  return best;
}

/* ---------------- 镶嵌、化劲、御劲 ---------------- */

/**
 * 镶嵌孔的属性值：floor(基数 × 系数)。
 * 系数：等级 > 6 时 1.3 × (0.65L − 3.2) × 1355 / 27800，否则 0.195L × 1355 / 27800。
 * 普通孔（304）算出来和原版的孔表一样（8 级 38）。来源：https://www.jx3box.com/tool/30582
 */
export function holeValue(base: number, level: number) {
  const L = Math.max(0, Math.min(8, Math.round(Number(level)) || 0));
  if (!L || !base) return 0;
  const k = L > 6 ? 1.3 * (0.65 * L - 3.2) : 0.195 * L;
  return Math.floor((base * k * 1355) / 27800 + 1e-9);
}

/** 精炼后的值：值 + round(值 × 系数[等级])，同原版 精炼加成系数算法 */
export function refined(v: number, level: number, coef: Record<number, number>) {
  return v + Math.round(v * (coef[level] ?? 0));
}

export interface DefenseSlot {
  def: {
    装备增益?: PvpAttr[];
    镶嵌孔数组?: { 镶嵌类型: string; 镶嵌基数?: number }[];
    套装?: number;
  };
  refine: number;
  gems: number[];
  enchant?: { 增益集合?: PvpAttr[] } | null;
}

/**
 * 化劲、御劲等级（原版不算这两项），以及生效的套装属性。
 * setGains 里除了化劲、御劲，其他属性要由调用方加进原版的面板。
 */
export function pvpDefense(
  slots: DefenseSlot[],
  sets: Record<string, PvpSet>,
  coef: Record<number, number>
) {
  const sum: Record<string, number> = { [DECRIT_KEY]: 0, [TOUGH_KEY]: 0 };
  const add = (key: string, v: number) => {
    if (key in sum) sum[key] += v;
  };
  const pieces = new Map<number, number>();
  for (const s of slots) {
    for (const a of s.def.装备增益 || []) add(a.属性, refined(a.值, s.refine, coef));
    (s.def.镶嵌孔数组 || []).forEach((h, i) =>
      add(h.镶嵌类型, holeValue(h.镶嵌基数 || NORMAL_HOLE_BASE, s.gems[i] ?? 0))
    );
    for (const a of s.enchant?.增益集合 || []) add(a.属性, a.值);
    if (s.def.套装) pieces.set(s.def.套装, (pieces.get(s.def.套装) ?? 0) + 1);
  }
  const setGains: PvpAttr[] = [];
  pieces.forEach((n, id) => {
    for (const fx of sets[id]?.效果 || []) {
      if (fx.件数 > n) continue;
      for (const a of fx.增益) {
        if (a.属性 in sum) add(a.属性, a.值);
        else setGains.push({ ...a });
      }
    }
  });
  return { decrit: sum[DECRIT_KEY], tough: sum[TOUGH_KEY], setGains };
}

/** 基础化劲率 102/1024（≈ 9.96%），人人都有 */
export const DECRIT_BASE_PCT = (102 / 1024) * 100;
/** 化劲率上限 85%（2024-04-25 版本公告） */
export const DECRIT_MAX_PCT = 85;

/**
 * 化劲百分比：n / (n + 系数) + 基础 102/1024，最多 85%。
 * 系数是原版 自身属性系数.化劲（50 级 5148）。来源：https://www.jx3box.com/bps/85797 。
 * 用户推栏截图核对过：4404 化劲 → 56.07%。没有化劲（PVE 配装）返回 0，面板不显示这一行。
 */
export function decritPct(lv: number, coef: number) {
  if (!(lv > 0 && coef > 0)) return 0;
  return Math.min(DECRIT_MAX_PCT, (lv / (lv + coef)) * 100 + DECRIT_BASE_PCT);
}

/** 御劲百分比：n / 系数，系数是原版 自身属性系数.御劲（50 级 19025.82） */
export function toughPct(lv: number, coef: number) {
  return lv > 0 && coef > 0 ? (lv / coef) * 100 : 0;
}
