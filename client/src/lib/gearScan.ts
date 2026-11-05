/**
 * 配装截图识别（客户端）。
 *
 * 1. prepareImage：截图缩到长边 2400 像素、转 JPEG（一般 200–600 KB），推栏长截图也看得清字。
 * 2. requestScan：发到备忘录服务器 /api/gear-scan（server/gearScanRoute.ts），模型只照抄截图上的字：
 *    部位、装备名、精炼、五行石、附魔、五彩石、副属性。截图不保存。
 * 3. matchScan：在本机把这些字对上当季装备库（原版计算器的目录），得到配装器的输入：
 *    - 装备：先按名字（容一两个字认错），同名的按副属性、品级区分，都一样时取原版默认的那件、再取品级高的；
 *    - 小附魔：先按全名，截图里只有「急速」这种属性词时取这个部位装分最高的同属性附魔；
 *    - 五彩石：按全名；没写等级时取最高级；
 *    - 截图里没有、或当季库里找不到的部位用原版默认装备，配装页会说明（calc.replaced）。
 */
import { useEffect, useState } from "react";
import type { CalcInput, CalcSlotInput } from "@/data/calcTypes";
import {
  calcStoneSource,
  enchantsFor,
  equipTags,
  loadCatalog,
  normSlot,
  SLOT_INDEXES,
  type CalcCatalog,
  type CalcEquip,
  type Seed,
} from "./calcEngine";
import { INDEX_KEY } from "./dpsCalc";
import { IS_DESKTOP, SITE_ORIGIN } from "./desktop";

/* ---------------- 和服务器约定的结构（server/gearScan.ts） ---------------- */

export interface ScanItem {
  slot: string;
  name: string;
  refine: number | null;
  gems: number[];
  enchant: string | null;
  attrs: string[];
  ilvl: number | null;
}

export interface ScanResult {
  notGear: boolean;
  xinfa: string | null;
  score: number | null;
  stone: string | null;
  items: ScanItem[];
}

/* ---------------- 图片和请求 ---------------- */

export type ScanFail =
  | "network"
  | "rate_limited"
  | "too_large"
  | "failed"
  | "decode";

export class GearScanError extends Error {
  constructor(
    public code: ScanFail,
    public retryAfter?: number
  ) {
    super(code);
  }
}

const ENDPOINT = IS_DESKTOP ? `${SITE_ORIGIN}/api/gear-scan` : "/api/gear-scan";

/** 长边最多这么多像素：推栏 1080×4330 的长截图缩到 599×2400，字还认得清 */
export const SCAN_MAX_SIDE = 2400;
/** 服务器收 3.5 MB 以内；base64 比原图大三分之一 */
const MAX_DATA_URL = 4_600_000;

/** 截图（文件或桌面版剪贴板里的像素）→ JPEG data URL；打不开时抛 decode */
export async function prepareImage(src: Blob | ImageData): Promise<string> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(src);
  } catch {
    throw new GearScanError("decode");
  }
  const scale = Math.min(1, SCAN_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new GearScanError("decode");
  // 透明的 PNG 转 JPEG 会变黑：先铺一层深色底，和游戏界面接近
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  for (const q of [0.86, 0.72, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= MAX_DATA_URL) return url;
  }
  throw new GearScanError("too_large");
}

/** 发给服务器识别；一分钟没结果算失败 */
export async function requestScan(
  dataUrl: string,
  signal?: AbortSignal
): Promise<ScanResult> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 60_000);
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
      signal: ctl.signal,
    });
  } catch {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    // 自己超时算识别失败；其余是连不上
    throw new GearScanError(ctl.signal.aborted ? "failed" : "network");
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: ScanResult;
    retryAfter?: number;
  } | null;
  if (res.status === 429)
    throw new GearScanError("rate_limited", body?.retryAfter);
  if (res.status === 413) throw new GearScanError("too_large");
  if (!res.ok || !body?.ok || !body.result) throw new GearScanError("failed");
  return body.result;
}

/* ---------------- 对上当季装备库 ---------------- */

/** 统一写法：全角转半角、各种间隔点统一成「·」、去空白和名字后面的精炼数字 */
export function normName(s: string) {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[・•‧∙⋅．]/g, "·")
    .replace(/\(\d\)$/, "");
}

function editDistance(a: string[], b: string[]) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = cur;
    }
  }
  return row[b.length];
}

/** 0–1，1 是一样 */
export function similarity(a: string, b: string) {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.max(x.length, y.length);
  return n ? 1 - editDistance(x, y) / n : 0;
}

/** 名字至少这么像才算同一件：3 个字认错 1 个（0.67）也算 */
const NAME_MIN = 0.65;

/** 截图上的副属性词 → 装备库的简写 */
function normAttr(a: string) {
  const s = a.replace(/^(外功|内功)·?/, "");
  if (s === "急速") return "加速";
  if (s === "会心效果") return "会效";
  return s;
}

/** 同名装备里挑一件的加分：副属性对得上、品级接近、是原版默认的那件、品级高 */
function tieScore(
  cat: CalcCatalog,
  e: CalcEquip,
  item: ScanItem,
  defaultId: number | undefined
) {
  let s = 0;
  const want = new Set(item.attrs.map(normAttr));
  if (want.size) {
    for (const t of equipTags(cat, e)) s += want.has(t) ? 2 : -1;
  }
  if (item.ilvl) s -= Math.abs(item.ilvl - e.装备品级) / 50;
  if (e.id === defaultId) s += 0.5;
  return s + e.装备品级 / 100_000;
}

function bestEquip(
  cat: CalcCatalog,
  part: string,
  item: ScanItem,
  defaultId: number | undefined
): { e: CalcEquip; sim: number } | null {
  const name = normName(item.name);
  let best: { e: CalcEquip; sim: number; score: number } | null = null;
  for (const e of cat.equips[part] ?? []) {
    const sim = similarity(name, normName(e.装备名称));
    if (sim < NAME_MIN) continue;
    // 名字像不像最要紧；名字一样时才比副属性、品级
    const score = sim * 100 + tieScore(cat, e, item, defaultId);
    if (!best || score > best.score) best = { e, sim, score };
  }
  return best && { e: best.e, sim: best.sim };
}

/** 附魔里的属性词（截图上常常只写这个） */
const ENCHANT_WORDS: [string, string[]][] = [
  ["急速", ["急速", "加速"]],
  ["加速", ["急速", "加速"]],
  ["会心效果", ["会效"]],
  ["会效", ["会效"]],
  ["会心", ["会心"]],
  ["破防", ["破防"]],
  ["无双", ["无双"]],
  ["攻击", ["攻击"]],
  ["根骨", ["根骨"]],
  ["元气", ["元气"]],
  ["身法", ["身法"]],
  ["力道", ["力道"]],
  ["体质", ["体质"]],
  ["武伤", ["武伤"]],
  ["破招", ["破招"]],
];

export function bestEnchant(
  cat: CalcCatalog,
  idx: string,
  text: string | null
): number | null {
  if (!text) return null;
  const list = enchantsFor(cat, idx); // 装分高的在前
  if (!list.length) return null;
  const n = normName(text);
  const exact = list.find(f => normName(f.附魔名称) === n);
  if (exact) return exact.id;
  let close: { id: number; sim: number } | null = null;
  for (const f of list) {
    const sim = similarity(n, normName(f.附魔名称));
    if (sim >= 0.8 && (!close || sim > close.sim)) close = { id: f.id, sim };
  }
  if (close) return close.id;
  for (const [word, alias] of ENCHANT_WORDS) {
    if (!n.includes(word)) continue;
    const hit = list.find(f =>
      alias.some(a => f.附魔名称.includes(a) || f.附魔效果简写.includes(a))
    );
    if (hit) return hit.id;
  }
  return null;
}

/** 五彩石：全名、相近的名字；没写等级时取最高级 */
export function bestStone(cat: CalcCatalog, text: string | null) {
  if (!text) return null;
  const src = calcStoneSource(cat);
  const n = normName(text);
  const all = src.families.flatMap(f => f.levels);
  const exact = all.find(s => normName(s.name) === n);
  if (exact) return exact.name;
  const hasLevel = /\(.+\)$/.test(n);
  let best: { name: string; score: number } | null = null;
  for (const s of all) {
    const target = hasLevel
      ? normName(s.name)
      : normName(s.name).replace(/\(.+\)$/, "");
    const sim = similarity(n, target);
    if (sim < 0.85) continue;
    const score = sim * 100 + s.level;
    if (!best || score > best.score) best = { name: s.name, score };
  }
  return best?.name ?? null;
}

export interface ScanMatch extends Seed {
  /** 对上当季装备的部位数 */
  found: number;
  /** 截图里有、当季装备库里找不到的部位名（帽子、戒指…） */
  missing: string[];
  /** 截图里没有的部位名 */
  absent: string[];
  /** 五彩石：found 对上了；missing 截图里有、当季没有；absent 截图里没有 */
  stone: "found" | "missing" | "absent";
  /** 截图里每件精炼都一样时的精炼等级 */
  refine: number | null;
}

export function matchScan(cat: CalcCatalog, scan: ScanResult): ScanMatch {
  const d = cat.defaults;
  // 部位名 → 计算器的部位索引（戒指有两个）
  const free = new Map<string, string[]>();
  for (const idx of SLOT_INDEXES) {
    const part = cat.slotPart[idx];
    free.set(part, [...(free.get(part) ?? []), idx]);
  }
  const slots: CalcInput["slots"] = {};
  const missing: string[] = [];
  const seen = new Set<string>();
  // 截图里五行石的等级：没写等级的孔按截图里最高的等级算，都没写按原版默认
  const gemLevels = scan.items.flatMap(it => it.gems.filter(g => g > 0));
  const gemFill = gemLevels.length ? Math.max(...gemLevels) : null;
  const refines: number[] = [];

  for (const item of scan.items) {
    let part = item.slot;
    let idx = free.get(part)?.[0];
    let hit = idx ? bestEquip(cat, part, item, d.slots[idx]?.id) : null;
    // 部位写错了：别的部位里有一模一样名字的，换过去
    if (!hit) {
      for (const [p, list] of free) {
        if (p === part || !list.length) continue;
        const h = bestEquip(cat, p, item, d.slots[list[0]]?.id);
        if (h && h.sim >= 0.9) {
          part = p;
          idx = list[0];
          hit = h;
          break;
        }
      }
    }
    if (!idx) continue; // 同一部位截图里出现了两次：只用第一件
    if (!hit) {
      if (!seen.has(item.slot)) missing.push(item.slot);
      seen.add(item.slot);
      continue;
    }
    free.set(
      part,
      free.get(part)!.filter(i => i !== idx)
    );
    const e = hit.e;
    const holes = e.镶嵌孔数组?.length ?? 0;
    const fill = gemFill ?? d.slots[idx]?.gems[0] ?? 6;
    const input: CalcSlotInput = {
      id: e.id,
      refine: item.refine ?? e.最大精炼等级,
      gems: Array.from({ length: holes }, (_, i) =>
        item.gems[i] && item.gems[i] > 0 ? item.gems[i] : fill
      ),
      enchant: bestEnchant(cat, idx, item.enchant),
    };
    const ok = normSlot(cat, idx, input);
    if (!ok) continue;
    slots[idx] = ok;
    if (item.refine !== null) refines.push(item.refine);
  }

  const replaced: string[] = [];
  const absent: string[] = [];
  for (const idx of SLOT_INDEXES) {
    if (slots[idx]) continue;
    slots[idx] = d.slots[idx] ?? null;
    replaced.push(INDEX_KEY[idx]);
    const part = cat.slotPart[idx];
    if (!seen.has(part) && !absent.includes(part)) absent.push(part);
  }
  // 两个戒指只认出一个时，另一个算截图里没有
  const stoneName = bestStone(cat, scan.stone);
  const stone = !scan.stone ? "absent" : stoneName ? "found" : "missing";
  const found = SLOT_INDEXES.length - replaced.length;
  return {
    input: {
      slots,
      stone: stoneName ?? d.stone,
      big: { ...d.big },
      battle: { ...d.battle },
    },
    replaced,
    stoneReplaced: stone === "missing",
    found,
    missing,
    absent,
    stone,
    refine:
      refines.length && refines.every(r => r === refines[0])
        ? refines[0]
        : null,
  };
}

/** 识别结果对上这个心法的当季装备库；目录要先加载（一般 1–3 秒，配装页打开过就是现成的） */
export function useScanMatch(xinfa: string, scan: ScanResult | null) {
  const [st, setSt] = useState<{
    xinfa: string;
    scan: ScanResult;
    match: ScanMatch | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (!scan) return;
    let alive = true;
    loadCatalog(xinfa).then(
      cat =>
        alive &&
        setSt({ xinfa, scan, match: matchScan(cat, scan), failed: false }),
      () => alive && setSt({ xinfa, scan, match: null, failed: true })
    );
    return () => {
      alive = false;
    };
  }, [xinfa, scan]);
  // 换了心法或换了截图，旧的对照结果不算
  const fresh = st && st.xinfa === xinfa && st.scan === scan ? st : null;
  return {
    match: fresh?.match ?? null,
    failed: fresh?.failed ?? false,
    loading: !!scan && !fresh,
  };
}
